"""Request / response models for POST /extract-geo.

Two documents describe this endpoint and the ASP.NET Core client follows the flat one:
  * docs/api.md §3.4 + C# PythonServiceClient / GeoMetrics: request flag `need_terrain`,
    FLAT response (mean_slope_deg, ndvi_mean, satellite_status, ...)  <- what the backend actually binds;
  * api_asp_net_core_python_fastapi.md §2: flag `include_terrain`, nested `terrain` / `satellite` blocks.
The worker accepts both flag names and returns both views (flat fields + nested blocks with error_reason).
System.Text.Json ignores unknown properties, so the nested blocks are harmless for the C# client.
"""

import datetime as dt
from typing import Annotated, Literal, Union

from pydantic import AliasChoices, BaseModel, Field, model_validator
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
    dzialka_id: str = Field(..., examples=["141611_2.0018.103"])
    target_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", examples=["2026-06-15"])
    # C# PythonServiceClient serializes `bool NeedTerrain` as "need_terrain"; the older doc calls it include_terrain
    include_terrain: bool = Field(True, validation_alias=AliasChoices("include_terrain", "need_terrain"))
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


# Values the C# SatelliteStatus enum (Ok | CloudyFallback | NoData) can bind; there is no Error member.
CSharpSatelliteStatus = Literal["OK", "CLOUDY_FALLBACK", "NO_DATA"]


class GeoExtractResponse(BaseModel):
    dzialka_id: str

    # --- flat view bound by the ASP.NET Core GeoMetrics record (docs/api.md §3.4) ---
    mean_slope_deg: float | None = None
    max_slope_deg: float | None = None
    steep_area_pct: float | None = None
    ndvi_mean: float | None = None
    ndwi_mean: float | None = None
    satellite_scene_date: str | None = None
    cloud_cover_pct: float | None = None
    satellite_status: CSharpSatelliteStatus = "NO_DATA"

    # --- detailed blocks (status + error_reason per module) ---
    terrain: TerrainMetrics | None = None  # null when the terrain was not requested
    satellite: SatelliteMetrics

    @model_validator(mode="after")
    def _flatten(self) -> "GeoExtractResponse":
        """Derive the flat fields from the nested blocks so the two views can never disagree."""
        t = self.terrain if self.terrain is not None and self.terrain.status == "OK" else None
        self.mean_slope_deg = t.mean_slope_deg if t else None
        self.max_slope_deg = t.max_slope_deg if t else None
        self.steep_area_pct = t.steep_area_pct if t else None

        sat = self.satellite
        usable = sat.status in ("OK", "CLOUDY_FALLBACK")
        # ERROR has no C# counterpart: report it as NO_DATA so the backend shows the "no satellite data" warning
        self.satellite_status = sat.status if usable else "NO_DATA"
        self.ndvi_mean = sat.ndvi_mean if usable else None
        self.ndwi_mean = sat.ndwi_mean if usable else None
        self.satellite_scene_date = sat.scene_date if usable else None
        self.cloud_cover_pct = sat.cloud_cover_pct if usable else None
        return self
