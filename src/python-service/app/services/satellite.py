"""Vegetation / water indices from Sentinel-2 L2A (Element 84 Earth Search STAC, public AWS COGs).

Scene selection (hybrid of the KOWR brief and the backend contract):
  * search STRICTLY in the past: [target_date - 30 days, target_date], never after target_date;
  * scan scenes newest first, reading only the cheap 20 m SCL band clipped to the polygon;
  * first scene with polygon cloud cover < 20 %                 -> status OK;
  * otherwise the least cloudy scene with cloud cover 20-50 %   -> status CLOUDY_FALLBACK;
  * nothing usable                                              -> status NO_DATA.
Only for the chosen scene are red / nir / swir16 read; NDVI and NDWI are averaged over clean pixels
(SCL 4 vegetation, 5 bare soil, 6 water).
"""

import asyncio
import datetime as dt
import logging
import math
import time
from dataclasses import dataclass

import httpx
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds
from rasterio.windows import Window
from rasterio.windows import from_bounds as window_from_bounds
from shapely.geometry import mapping
from shapely.geometry.base import BaseGeometry

from app.config import Settings
from app.geo import reproject
from app.schemas import SatelliteMetrics

log = logging.getLogger(__name__)

LOOKBACK_DAYS = 30
MAX_SCENES = 8  # scenes whose SCL is inspected before giving up
MAX_GRID_PX = 512  # cap on the analysis grid side; larger polygons are read from COG overviews
GRID_RES_M = 10.0  # native resolution of red / nir
CLEAN_SCL = (4, 5, 6)
CLOUD_SCL = (3, 8, 9, 10)  # cloud shadow, cloud medium/high probability, thin cirrus
MIN_TILE_COVERAGE = 0.5  # polygon share that must lie inside the tile footprint
BANDS = ("red", "nir", "swir16", "scl")
# Stop scanning new scenes when this little of the module budget is left (the 3 reflectance bands still
# have to be read for the chosen scene).
SCAN_RESERVE_S = 3.0

# GDAL tuning for range reads of public COGs over HTTPS.
# HTTP/2 multiplexing is deliberately NOT enabled: on slow links it produced truncated tile reads
# ("TIFFFillTile ... got N bytes, expected M").
GDAL_ENV = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_MERGE_CONSECUTIVE_RANGES": "YES",
    "GDAL_HTTP_TIMEOUT": "7",
    "GDAL_HTTP_MAX_RETRY": "1",
    "GDAL_HTTP_RETRY_DELAY": "0.5",
    "VSI_CACHE": "TRUE",
    "AWS_NO_SIGN_REQUEST": "YES",
}


@dataclass(frozen=True)
class _Grid:
    bounds: tuple[float, float, float, float]
    shape: tuple[int, int]  # (rows, cols)
    inside: np.ndarray  # bool, True = pixel centre inside polygon

    @property
    def decimated(self) -> bool:
        return self.shape[1] < round((self.bounds[2] - self.bounds[0]) / GRID_RES_M)


@dataclass(frozen=True)
class _Scene:
    id: str
    date: dt.date
    epsg: int
    hrefs: dict[str, str]
    scale_offset: dict[str, tuple[float, float]]


@dataclass(frozen=True)
class _Assessment:
    scene: _Scene
    grid: _Grid
    clean: np.ndarray  # bool, clean SCL pixel inside polygon
    cloud_pct: float


class _SceneUnusable(Exception):
    """The scene cannot be used for this polygon; try the next one."""


# --------------------------------------------------------------------------- STAC


def _parse_epsg(props: dict) -> int | None:
    if props.get("proj:epsg"):
        return int(props["proj:epsg"])
    code = props.get("proj:code")  # newer STAC projection extension: "EPSG:32634"
    if isinstance(code, str) and code.upper().startswith("EPSG:"):
        return int(code.split(":", 1)[1])
    return None


def _parse_scene(feature: dict, ref_date: dt.date) -> _Scene | None:
    props = feature.get("properties", {})
    assets = feature.get("assets", {})
    try:
        scene_date = dt.datetime.fromisoformat(props["datetime"].replace("Z", "+00:00")).date()
    except (KeyError, ValueError):
        return None
    epsg = _parse_epsg(props)
    if scene_date > ref_date or epsg is None or any(b not in assets for b in BANDS):
        return None
    scale_offset = {}
    for band in BANDS:
        rb = (assets[band].get("raster:bands") or [{}])[0]
        scale_offset[band] = (float(rb.get("scale", 1.0)), float(rb.get("offset", 0.0)))
    return _Scene(
        id=feature.get("id", "?"),
        date=scene_date,
        epsg=epsg,
        hrefs={b: assets[b]["href"] for b in BANDS},
        scale_offset=scale_offset,
    )


async def _search(
    client: httpx.AsyncClient, settings: Settings, polygon_wgs84: BaseGeometry, ref_date: dt.date
) -> list[_Scene]:
    start = ref_date - dt.timedelta(days=LOOKBACK_DAYS)
    body = {
        "collections": [settings.stac_collection],
        "intersects": mapping(polygon_wgs84),
        # Closed interval ending on ref_date: never anything after the requested date.
        "datetime": f"{start.isoformat()}T00:00:00Z/{ref_date.isoformat()}T23:59:59.999Z",
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": 40,
        "fields": {
            "include": ["id", "properties.datetime", "properties.proj:epsg", "properties.proj:code"]
            + [f"assets.{b}" for b in BANDS],
            "exclude": ["links", "geometry"],
        },
    }
    resp = await client.post(f"{settings.stac_url.rstrip('/')}/search", json=body, timeout=settings.http_timeout_s)
    resp.raise_for_status()
    scenes = [s for f in resp.json().get("features", []) if (s := _parse_scene(f, ref_date))]
    scenes.sort(key=lambda s: s.date, reverse=True)  # don't rely on the server honouring sortby
    return scenes


# --------------------------------------------------------------------------- raster


def _build_grid(polygon_utm: BaseGeometry) -> _Grid:
    minx, miny, maxx, maxy = polygon_utm.bounds
    # Snap outward to the 10 m Sentinel-2 pixel lattice (tile origins are multiples of 20 m).
    minx = math.floor(minx / GRID_RES_M) * GRID_RES_M
    miny = math.floor(miny / GRID_RES_M) * GRID_RES_M
    maxx = math.ceil(maxx / GRID_RES_M) * GRID_RES_M
    maxy = math.ceil(maxy / GRID_RES_M) * GRID_RES_M
    cols = max(1, round((maxx - minx) / GRID_RES_M))
    rows = max(1, round((maxy - miny) / GRID_RES_M))
    factor = max(1.0, max(cols, rows) / MAX_GRID_PX)
    shape = (max(1, math.ceil(rows / factor)), max(1, math.ceil(cols / factor)))
    transform = from_bounds(minx, miny, maxx, maxy, shape[1], shape[0])
    geoms = [mapping(polygon_utm)]
    inside = geometry_mask(geoms, out_shape=shape, transform=transform, invert=True)
    if not inside.any():  # polygon smaller than a pixel
        inside = geometry_mask(geoms, out_shape=shape, transform=transform, invert=True, all_touched=True)
    return _Grid(bounds=(minx, miny, maxx, maxy), shape=shape, inside=inside)


def _read_band(href: str, grid: _Grid, resampling: Resampling) -> np.ndarray:
    """Read one band onto the analysis grid (clipped to the polygon bbox). Blocking; run in a worker thread."""
    with rasterio.Env(**GDAL_ENV), rasterio.open(href) as src:
        window = window_from_bounds(*grid.bounds, transform=src.transform)
        full = Window(0, 0, src.width, src.height)
        boundless = not (
            window.col_off >= full.col_off
            and window.row_off >= full.row_off
            and window.col_off + window.width <= full.width
            and window.row_off + window.height <= full.height
        )
        return src.read(
            1,
            window=window,
            out_shape=grid.shape,
            resampling=resampling,
            boundless=boundless,
            fill_value=0,  # 0 = nodata for every S2 L2A band on Earth Search
        )


def _reflectance(dn: np.ndarray, scale_offset: tuple[float, float]) -> np.ndarray:
    scale, offset = scale_offset  # Earth Search v1: scale 0.0001, offset -0.1 (BOA offset, baseline >= 04.00)
    return dn.astype("float64") * scale + offset


def _normalized_difference(a: np.ndarray, b: np.ndarray, valid: np.ndarray) -> float | None:
    denom = a + b
    ok = valid & (denom > 0)
    if not ok.any():
        return None
    nd = np.clip((a[ok] - b[ok]) / denom[ok], -1.0, 1.0)
    return round(float(nd.mean()), 4)


async def _assess_scene(scene: _Scene, polygon_wgs84: BaseGeometry) -> _Assessment:
    """Cheap pass: SCL only -> polygon cloud cover and clean-pixel mask."""
    grid = _build_grid(reproject(polygon_wgs84, scene.epsg))
    inside = grid.inside
    scl = await asyncio.to_thread(_read_band, scene.hrefs["scl"], grid, Resampling.nearest)
    has_data = inside & (scl != 0)
    n_data = int(has_data.sum())
    if n_data == 0 or n_data / int(inside.sum()) < MIN_TILE_COVERAGE:
        raise _SceneUnusable(f"{scene.id}: polygon mostly outside tile footprint")
    cloud_pct = 100.0 * float((has_data & np.isin(scl, CLOUD_SCL)).sum()) / n_data
    clean = has_data & np.isin(scl, CLEAN_SCL)
    if not clean.any():
        raise _SceneUnusable(f"{scene.id}: no clean (SCL 4/5/6) pixels over polygon ({cloud_pct:.0f}% clouds)")
    return _Assessment(scene=scene, grid=grid, clean=clean, cloud_pct=cloud_pct)


async def _compute_indices(a: _Assessment, status: str) -> SatelliteMetrics:
    """Expensive pass for the chosen scene: red / nir (10 m) and swir16 (20 m) on the same grid."""
    resample_10m = Resampling.average if a.grid.decimated else Resampling.nearest
    red_dn, nir_dn, swir_dn = await asyncio.gather(
        asyncio.to_thread(_read_band, a.scene.hrefs["red"], a.grid, resample_10m),
        asyncio.to_thread(_read_band, a.scene.hrefs["nir"], a.grid, resample_10m),
        asyncio.to_thread(_read_band, a.scene.hrefs["swir16"], a.grid, Resampling.bilinear),
    )
    valid = a.clean & (red_dn > 0) & (nir_dn > 0) & (swir_dn > 0)
    if not valid.any():
        return SatelliteMetrics.no_data(f"{a.scene.id}: clean pixels have no reflectance data")
    red = _reflectance(red_dn, a.scene.scale_offset["red"])
    nir = _reflectance(nir_dn, a.scene.scale_offset["nir"])
    swir = _reflectance(swir_dn, a.scene.scale_offset["swir16"])
    return SatelliteMetrics(
        status=status,
        ndvi_mean=_normalized_difference(nir, red, valid),
        ndwi_mean=_normalized_difference(nir, swir, valid),
        scene_date=a.scene.date.isoformat(),
        cloud_cover_pct=round(a.cloud_pct, 1),
    )


# --------------------------------------------------------------------------- entry point


async def analyze_satellite(
    polygon_wgs84: BaseGeometry, ref_date: dt.date, client: httpx.AsyncClient, settings: Settings
) -> SatelliteMetrics:
    """Never raises for upstream failures; returns status NO_DATA / ERROR with error_reason instead."""
    started = time.monotonic()
    try:
        scenes = await _search(client, settings, polygon_wgs84, ref_date)
    except httpx.TimeoutException:
        return SatelliteMetrics.error("Earth Search STAC request timed out")
    except httpx.HTTPStatusError as exc:
        return SatelliteMetrics.error(f"Earth Search STAC returned HTTP {exc.response.status_code}")
    except httpx.HTTPError as exc:
        return SatelliteMetrics.error(f"Earth Search STAC connection error: {type(exc).__name__}")
    except Exception as exc:  # noqa: BLE001
        log.exception("STAC search failed")
        return SatelliteMetrics.error(f"STAC search failed: {exc}")

    if not scenes:
        return SatelliteMetrics.no_data(f"No Sentinel-2 L2A scenes in the {LOOKBACK_DAYS} days up to {ref_date}")

    fallback: _Assessment | None = None
    reasons: list[str] = []
    inspected = 0  # scenes whose SCL was actually read (a real "cloudy / not covered" answer)
    for scene in scenes[:MAX_SCENES]:
        if time.monotonic() - started > settings.module_timeout_s - SCAN_RESERVE_S:
            reasons.append("time budget exhausted")
            break
        try:
            a = await _assess_scene(scene, polygon_wgs84)
        except _SceneUnusable as exc:
            inspected += 1
            reasons.append(str(exc))
            continue
        except Exception as exc:  # noqa: BLE001 - e.g. a COG read failure; try the next scene
            log.warning("Sentinel-2 scene %s failed: %s", scene.id, exc)
            reasons.append(f"{scene.id}: read error ({type(exc).__name__})")
            continue

        inspected += 1
        if a.cloud_pct < settings.cloud_ok_pct:
            return await _compute_indices(a, "OK")
        if a.cloud_pct <= settings.cloud_fallback_pct:
            if fallback is None or a.cloud_pct < fallback.cloud_pct:
                fallback = a
            reasons.append(f"{scene.id}: {a.cloud_pct:.0f}% clouds (fallback candidate)")
        else:
            reasons.append(f"{scene.id}: {a.cloud_pct:.0f}% clouds")

    if fallback is not None:
        result = await _compute_indices(fallback, "CLOUDY_FALLBACK")
        if result.status == "CLOUDY_FALLBACK":
            result.error_reason = f"No scene under {settings.cloud_ok_pct:g}% clouds; used the least cloudy one"
        return result

    detail = "No usable Sentinel-2 scene: " + "; ".join(reasons)
    # Nothing actually inspected (read errors / time budget) -> upstream problem, not a "cloudy field" answer.
    return SatelliteMetrics.no_data(detail) if inspected else SatelliteMetrics.error(detail)
