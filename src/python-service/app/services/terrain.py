"""Terrain statistics from the GUGiK NMT (Numeryczny Model Terenu) WCS service.

Pipeline: WGS84 polygon -> EPSG:2180 -> WCS 1.0.0 GetCoverage (float ASCII grid, adaptive resolution)
-> slope on the full (padded) raster -> clip strictly to the polygon with rasterio.mask -> stats.
"""

import asyncio
import logging
import math
import re

import httpx
import numpy as np
from rasterio.io import MemoryFile
from rasterio.mask import mask as rio_mask
from shapely.geometry import mapping
from shapely.geometry.base import BaseGeometry

from app.config import Settings
from app.geo import PL_1992, reproject
from app.schemas import TerrainMetrics

log = logging.getLogger(__name__)

GRID_DIVISOR = 130.0  # ~130 cells along the longer bbox side
MIN_STEP_M = 1.0  # native NMT resolution (GRID1)
PAD_CELLS = 2  # extra cells around the bbox so slope at the polygon edge has real neighbours
# Plausible elevation range for Poland (m). Anything outside is treated as nodata
# (guards against sentinel values such as -9999 when the GeoTIFF has no nodata tag).
ELEV_VALID_MIN, ELEV_VALID_MAX = -50.0, 2600.0

_SERVICE_EXCEPTION_RE = re.compile(r"<ServiceException(?:\s[^>]*)?>(.*?)</ServiceException>", re.S)


class WcsServiceError(Exception):
    """The WCS answered, but with an OGC ServiceException instead of data."""


def grid_step_m(polygon_2180: BaseGeometry) -> float:
    minx, miny, maxx, maxy = polygon_2180.bounds
    max_side_m = max(maxx - minx, maxy - miny)
    return round(max(MIN_STEP_M, max_side_m / GRID_DIVISOR), 2)


def _request_bbox(polygon_2180: BaseGeometry, step: float) -> tuple[float, float, float, float]:
    minx, miny, maxx, maxy = polygon_2180.bounds
    pad = PAD_CELLS * step
    return (
        math.floor((minx - pad) / step) * step,
        math.floor((miny - pad) / step) * step,
        math.ceil((maxx + pad) / step) * step,
        math.ceil((maxy + pad) / step) * step,
    )


async def _fetch_coverage(
    client: httpx.AsyncClient, settings: Settings, bbox: tuple[float, float, float, float], step: float
) -> bytes:
    minx, miny, maxx, maxy = bbox
    # Verified against the live service:
    #  * FORMAT=image/tiff is a 3-band uint8 *rendering* (0-255), not heights -> unusable.
    #  * FORMAT=image/x-aaigrid returns float32 heights in metres.
    #  * WCS 2.0.1 + aaigrid drops the connection; WCS 1.0.0 BBOX+WIDTH/HEIGHT works and does the resampling.
    width = round((maxx - minx) / step)
    height = round((maxy - miny) / step)
    params = {
        "SERVICE": "WCS",
        "VERSION": "1.0.0",
        "REQUEST": "GetCoverage",
        "COVERAGE": settings.nmt_coverage_id,
        "CRS": "EPSG:2180",
        "BBOX": f"{minx:.2f},{miny:.2f},{maxx:.2f},{maxy:.2f}",
        "WIDTH": str(width),
        "HEIGHT": str(height),
        "FORMAT": "image/x-aaigrid",
    }
    resp = await client.get(settings.nmt_wcs_url, params=params, timeout=settings.http_timeout_s)
    resp.raise_for_status()
    if not resp.content[:64].lstrip().lower().startswith(b"ncols"):
        match = _SERVICE_EXCEPTION_RE.search(resp.text)
        detail = " ".join(match.group(1).split()) if match else resp.text[:150].replace("\n", " ")
        raise WcsServiceError(f"GUGiK NMT WCS error: {detail[:300]}")
    return resp.content


def _compute(content: bytes, polygon_2180: BaseGeometry, steep_threshold_deg: float) -> TerrainMetrics:
    geoms = [mapping(polygon_2180)]
    # The ASCII grid has no .prj; rasterio.mask only needs the transform, and the geometry is already EPSG:2180.
    with MemoryFile(content, ext=".asc") as mem, mem.open(driver="AAIGrid") as src:
        elev = src.read(1, masked=True).astype("float64").filled(np.nan)
        # The service's ASCII grid carries no NODATA_value line: cells without data come back as exactly 0.0.
        # Real NMT heights are fractional floats (and Zulawy lies below 0 m), so an exact 0.0 is treated as nodata.
        elev[(elev == 0.0) | (elev < ELEV_VALID_MIN) | (elev > ELEV_VALID_MAX)] = np.nan
        xres, yres = src.res

        # Strict clip: pixel centres inside the polygon. For slivers narrower than one cell fall back
        # to all_touched so we still return the cells the polygon actually lies on.
        inside = None
        for all_touched in (False, True):
            try:
                clipped, _ = rio_mask(src, geoms, crop=False, filled=False, indexes=1, all_touched=all_touched)
            except ValueError:  # polygon does not overlap the raster
                break
            candidate = ~np.ma.getmaskarray(clipped)
            if candidate.any():
                inside = candidate
                break

    if inside is None:
        return TerrainMetrics.no_data("Polygon does not overlap the NMT coverage")

    valid = inside & np.isfinite(elev)
    if not valid.any():
        return TerrainMetrics.no_data("No NMT elevation data inside the polygon (outside Poland?)")

    # Slope on the full padded raster (so edge cells use real neighbours), then clipped.
    if min(elev.shape) < 2:
        return TerrainMetrics.no_data("Raster too small to compute slope")
    dz_dy, dz_dx = np.gradient(elev, yres, xres)
    slope_deg = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))
    slope_vals = slope_deg[valid & np.isfinite(slope_deg)]
    if not slope_vals.size:
        return TerrainMetrics.no_data("Not enough contiguous NMT cells inside the polygon to compute slope")

    z = elev[valid]
    z_min, z_max = float(z.min()), float(z.max())
    return TerrainMetrics(
        status="OK",
        mean_slope_deg=round(float(slope_vals.mean()), 2),
        max_slope_deg=round(float(slope_vals.max()), 2),
        steep_area_pct=round(100.0 * float((slope_vals > steep_threshold_deg).mean()), 1),
        elevation_min_m=round(z_min, 2),
        elevation_max_m=round(z_max, 2),
        elevation_diff_m=round(z_max - z_min, 2),
    )


async def _fetch_with_retry(
    client: httpx.AsyncClient, settings: Settings, bbox: tuple[float, float, float, float], step: float
) -> bytes:
    """GUGiK NMT WCS occasionally stalls (observed live: single requests over 6.5 s, the next one fast).
    One retry on timeout fits the module budget: 2 x http_timeout_s < module_timeout_s."""
    attempts = 2 if 2 * settings.http_timeout_s < settings.module_timeout_s else 1
    for attempt in range(1, attempts + 1):
        try:
            return await _fetch_coverage(client, settings, bbox, step)
        except httpx.TimeoutException:
            if attempt == attempts:
                raise
            log.info("GUGiK NMT WCS timed out, retrying once")
    raise AssertionError("unreachable")


async def analyze_terrain(polygon_wgs84: BaseGeometry, client: httpx.AsyncClient, settings: Settings) -> TerrainMetrics:
    """Never raises for upstream failures; returns status NO_DATA / ERROR with error_reason instead."""
    try:
        polygon_2180 = reproject(polygon_wgs84, PL_1992)
        step = grid_step_m(polygon_2180)
        content = await _fetch_with_retry(client, settings, _request_bbox(polygon_2180, step), step)
        return await asyncio.to_thread(_compute, content, polygon_2180, settings.steep_slope_threshold_deg)
    except WcsServiceError as exc:
        # e.g. "Requested BBOX is outside requested coverage BBOX" -> parcel outside Poland
        status = TerrainMetrics.no_data if "outside" in str(exc).lower() else TerrainMetrics.error
        return status(str(exc))
    except httpx.TimeoutException:
        return TerrainMetrics.error("GUGiK NMT WCS request timed out")
    except httpx.HTTPStatusError as exc:
        return TerrainMetrics.error(f"GUGiK NMT WCS returned HTTP {exc.response.status_code}")
    except httpx.HTTPError as exc:
        return TerrainMetrics.error(f"GUGiK NMT WCS connection error: {type(exc).__name__}")
    except Exception as exc:  # noqa: BLE001 - this module must never take the endpoint down
        log.exception("Terrain analysis failed")
        return TerrainMetrics.error(f"Terrain analysis failed: {exc}")
