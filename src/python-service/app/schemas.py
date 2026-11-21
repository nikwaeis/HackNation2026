"""Request / response models. Mirrors section 2 of api_asp_net_core_python_fastapi.md (POST /extract-geo).

Fields not in the contract (elevation_*, error_reason) are additive: the C# DTOs ignore unknown properties.
"""

import datetime as dt
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, model_validator
from shapely import force_2d
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.validation import explain_validity

Position = list[float]  # [lon, lat] or [lon, lat, z]

TERRAIN_SOURCE = "Geoportal NMT WCS"
SATELLITE_SOURCE = "Sentinel-2 L2A (Earth Search)"


class PolygonGeometry(BaseModel):
    type: Literal["Polygon"]
    coordinates: list[list[Position]]


class MultiPolygonGeometry(BaseModel):
    type: Literal["MultiPolygon"]
    coordinates: list[list[list[Position]]]


Geometry = Annotated[Union[PolygonGeometry, MultiPolygonGeometry], Field(discriminator="type")]


class GeoExtractRequest(BaseModel):
    dzialka_id: str = Field(..., examples=["040101_1.0001.123/4"])
    target_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", examples=["2026-06-15"])
    include_terrain: bool = True
    geometry: Geometry = Field(description="GeoJSON Polygon/MultiPolygon in WGS84 (EPSG:4326), [lon, lat] order.")

    @model_validator(mode="after")
    def _validate(self) -> "GeoExtractRequest":
        try:
            dt.date.fromisoformat(self.target_date)
        except ValueError as exc:
            raise ValueError(f"target_date is not a valid calendar date: {exc}") from None
        geom = self.to_shapely()
        if geom.is_empty or geom.area == 0:
            raise ValueError("geometry is empty or has zero area")
        if not geom.is_valid:
            raise ValueError(f"geometry is not a valid polygon: {explain_validity(geom)}")
        minx, miny, maxx, maxy = geom.bounds
        if minx < -180 or maxx > 180 or miny < -90 or maxy > 90:
            raise ValueError("coordinates must be WGS84 [lon, lat]")
        return self

    @property
    def date(self) -> dt.date:
        return dt.date.fromisoformat(self.target_date)

    def to_shapely(self) -> BaseGeometry:
        return force_2d(shape(self.geometry.model_dump()))


class TerrainMetrics(BaseModel):
    status: Literal["OK", "NO_DATA", "ERROR"]
    mean_slope_deg: float | None = None
    max_slope_deg: float | None = None
    steep_area_pct: float | None = Field(None, description="Percent of parcel area with slope above the threshold (3°).")
    source: str = TERRAIN_SOURCE
    # --- additive, outside the contract ---
    elevation_min_m: float | None = None
    elevation_max_m: float | None = None
    elevation_diff_m: float | None = None
    error_reason: str | None = None

    @classmethod
    def no_data(cls, reason: str) -> "TerrainMetrics":
        return cls(status="NO_DATA", error_reason=reason)

    @classmethod
    def error(cls, reason: str) -> "TerrainMetrics":
        return cls(status="ERROR", error_reason=reason)


class SatelliteMetrics(BaseModel):
    status: Literal["OK", "CLOUDY_FALLBACK", "NO_DATA", "ERROR"]
    ndvi_mean: float | None = Field(None, description="Mean NDVI over clean (SCL 4/5/6) pixels.")
    ndwi_mean: float | None = Field(None, description="Mean NDWI (Gao) = (NIR - SWIR16) / (NIR + SWIR16).")
    scene_date: str | None = Field(None, description="YYYY-MM-DD, never after target_date.")
    cloud_cover_pct: float | None = Field(
        None, description="Percent of polygon pixels flagged cloud/shadow/cirrus (SCL 3/8/9/10)."
    )
    source: str = SATELLITE_SOURCE
    # --- additive, outside the contract ---
    error_reason: str | None = None

    @classmethod
    def no_data(cls, reason: str) -> "SatelliteMetrics":
        return cls(status="NO_DATA", error_reason=reason)

    @classmethod
    def error(cls, reason: str) -> "SatelliteMetrics":
        return cls(status="ERROR", error_reason=reason)


class GeoExtractResponse(BaseModel):
    dzialka_id: str
    terrain: TerrainMetrics | None = None  # null when include_terrain=false
    satellite: SatelliteMetrics
