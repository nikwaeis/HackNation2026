"""WodoPlon Geo-Worker: stateless raster metrics for ASP.NET Core.

Contract: api_asp_net_core_python_fastapi.md, section 2 (POST /extract-geo).
Upstream failures never produce HTTP 5xx: the affected section comes back with status NO_DATA / ERROR.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.schemas import GeoExtractRequest, GeoExtractResponse, SatelliteMetrics, TerrainMetrics
from app.services.satellite import analyze_satellite
from app.services.terrain import analyze_terrain

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("wodoplon.geo-worker")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    async with httpx.AsyncClient(
        timeout=settings.http_timeout_s,
        headers={"User-Agent": "wodoplon-geo-worker/1.0"},
        follow_redirects=True,
    ) as client:
        app.state.http = client
        yield


app = FastAPI(title="WodoPlon Geo-Worker", version="1.0.0", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def _validation_as_400(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Contract, section 4: malformed input (bad date, bad geometry) -> 400 Bad Request.
    return JSONResponse(status_code=400, content={"detail": jsonable_encoder(exc.errors())})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _failure_reason(exc: BaseException, source: str, timeout_s: float) -> str:
    if isinstance(exc, TimeoutError):
        return f"{source} exceeded {timeout_s:g}s timeout"
    return f"{source} failed: {type(exc).__name__}: {exc}"


async def _skip() -> None:
    return None


@app.post("/extract-geo", response_model=GeoExtractResponse)
async def extract_geo(body: GeoExtractRequest, request: Request) -> GeoExtractResponse:
    settings = get_settings()
    client: httpx.AsyncClient = request.app.state.http
    polygon = body.to_shapely()
    timeout = settings.module_timeout_s

    terrain_res, satellite_res = await asyncio.gather(
        asyncio.wait_for(analyze_terrain(polygon, client, settings), timeout=timeout) if body.include_terrain else _skip(),
        asyncio.wait_for(analyze_satellite(polygon, body.date, client, settings), timeout=timeout),
        return_exceptions=True,
    )

    if body.include_terrain and not isinstance(terrain_res, TerrainMetrics):
        log.warning("Terrain module error for %s: %r", body.dzialka_id, terrain_res)
        terrain_res = TerrainMetrics.error(_failure_reason(terrain_res, "Terrain analysis", timeout))
    if not isinstance(satellite_res, SatelliteMetrics):
        log.warning("Satellite module error for %s: %r", body.dzialka_id, satellite_res)
        satellite_res = SatelliteMetrics.error(_failure_reason(satellite_res, "Satellite analysis", timeout))

    return GeoExtractResponse(
        dzialka_id=body.dzialka_id,
        terrain=terrain_res if body.include_terrain else None,
        satellite=satellite_res,
    )
