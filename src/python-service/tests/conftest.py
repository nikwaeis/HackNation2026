"""Test fixtures: the real app with all outbound traffic routed to in-process mocks.

* HTTP (GUGiK NMT WCS, Earth Search STAC) -> httpx.MockTransport via app.state.http_transport.
* Sentinel-2 COG reads (GDAL, not httpx)  -> app.services.satellite._read_band is monkeypatched.
"""

import asyncio
import datetime as dt
import threading
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from urllib.parse import parse_qs, urlparse

import httpx
import numpy as np
import pytest
from fastapi.testclient import TestClient

import app.services.satellite as satellite
from app.config import get_settings
from app.main import app

NMT_HOST = "mapy.geoportal.gov.pl"
STAC_HOST = "earth-search.aws.element84.com"

# 300 m x 300 m parcel near Grojec (inside Poland, UTM 34N).
PARCEL = {
    "type": "MultiPolygon",
    "coordinates": [[[[20.870, 51.860], [20.8745, 51.860], [20.8745, 51.8627], [20.870, 51.8627], [20.870, 51.860]]]],
}


def request_body(**overrides) -> dict:
    body = {"dzialka_id": "040101_1.0001.123/4", "target_date": "2026-06-15", "include_terrain": True, "geometry": PARCEL}
    body.update(overrides)
    return body


# --------------------------------------------------------------------------- NMT (WCS)

TILT = 0.1  # dz/dx of the synthetic terrain -> slope = atan(0.1) = 5.71 deg everywhere


def tilted_aaigrid(params: dict[str, str]) -> str:
    """ASCII grid that honours the request's BBOX/WIDTH/HEIGHT: z = 100 + TILT * (x - minx)."""
    minx, miny, maxx, _ = (float(v) for v in params["BBOX"].split(","))
    width, height = int(params["WIDTH"]), int(params["HEIGHT"])
    cell = (maxx - minx) / width
    xs = minx + (np.arange(width) + 0.5) * cell
    row = " ".join(f"{100 + TILT * (x - minx):.3f}" for x in xs)
    header = f"ncols {width}\nnrows {height}\nxllcorner {minx}\nyllcorner {miny}\ncellsize {cell}\n"
    return header + "\n".join([row] * height) + "\n"


# --------------------------------------------------------------------------- STAC


def stac_feature(scene_id: str, date: dt.date) -> dict:
    so = [{"nodata": 0, "scale": 0.0001, "offset": -0.1}]
    href = f"https://s2.mock/{scene_id}/{{}}.tif"
    return {
        "id": scene_id,
        "properties": {"datetime": f"{date.isoformat()}T09:56:14.730000Z", "proj:epsg": 32634},
        "assets": {
            "red": {"href": href.format("B04"), "raster:bands": so},
            "nir": {"href": href.format("B08"), "raster:bands": so},
            "swir16": {"href": href.format("B11"), "raster:bands": so},
            "scl": {"href": href.format("SCL"), "raster:bands": [{"nodata": 0}]},
        },
    }


# Synthetic harmonized DNs (scale 0.0001; the advertised offset -0.1 must be ignored): red 0.01, nir 0.31, swir16 0.11
DN = {"B04": 100, "B08": 3100, "B11": 1100}
EXPECTED_NDVI = round((0.31 - 0.01) / (0.31 + 0.01), 4)  # 0.9375
EXPECTED_NDWI = round((0.31 - 0.11) / (0.31 + 0.11), 4)  # 0.4762


@dataclass
class Upstream:
    """Programmable fake of every external dependency. Tests mutate the attributes."""

    nmt: Callable[[httpx.Request], object] | None = None  # sync/async handler; default = tilted plane
    stac: Callable[[httpx.Request], object] | None = None  # default = one clear scene on target date
    scl_by_scene: dict[str, int] = field(default_factory=dict)  # scene id -> SCL class (default 4 = vegetation)
    band_hook: Callable[[str], None] | None = None  # called inside the read thread (e.g. to block)
    calls: list[str] = field(default_factory=list)
    stac_bodies: list[dict] = field(default_factory=list)
    read_hrefs: list[str] = field(default_factory=list)

    async def handle(self, request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host == NMT_HOST:
            self.calls.append("nmt")
            if self.nmt:
                res = self.nmt(request)
                return await res if asyncio.iscoroutine(res) else res
            params = {k: v[0] for k, v in parse_qs(urlparse(str(request.url)).query).items()}
            return httpx.Response(200, text=tilted_aaigrid(params), headers={"content-type": "image/x-aaigrid"})
        if host == STAC_HOST:
            self.calls.append("stac")
            import json

            self.stac_bodies.append(json.loads(request.content))
            if self.stac:
                res = self.stac(request)
                return await res if asyncio.iscoroutine(res) else res
            ref = dt.date.fromisoformat(self.stac_bodies[-1]["datetime"].split("/")[1][:10])
            return httpx.Response(200, json={"features": [stac_feature("S2_MOCK_A", ref)]})
        return httpx.Response(599, text=f"unexpected host {host}")

    def read_band(self, href: str, grid, resampling) -> np.ndarray:
        self.read_hrefs.append(href)
        if self.band_hook:
            self.band_hook(href)
        scene_id, band = href.split("/")[-2], href.split("/")[-1].removesuffix(".tif")
        if band == "SCL":
            return np.full(grid.shape, self.scl_by_scene.get(scene_id, 4), dtype="uint8")
        return np.full(grid.shape, DN[band], dtype="uint16")


@pytest.fixture
def upstream(monkeypatch) -> Upstream:
    up = Upstream()
    monkeypatch.setattr(satellite, "_read_band", up.read_band)
    return up


@pytest.fixture
def settings():
    """The cached Settings singleton; any field changed by a test is restored afterwards."""
    s = get_settings()
    saved = s.model_dump()
    yield s
    for k, v in saved.items():
        setattr(s, k, v)


@pytest.fixture
def client(upstream) -> Iterator[TestClient]:
    app.state.http_transport = httpx.MockTransport(upstream.handle)
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.state.http_transport = None


@pytest.fixture
def release_threads() -> Iterator[threading.Event]:
    """Event for tests that block worker threads; always released so pytest can exit."""
    ev = threading.Event()
    yield ev
    ev.set()
