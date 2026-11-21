from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every field can be overridden by an env var (case-insensitive)."""

    model_config = SettingsConfigDict(extra="ignore")

    # GUGiK NMT (1 m grid) WCS. Coverage id taken from GetCapabilities:
    # DTM_PL-EVRF2007-NH = current Polish vertical datum (PL-EVRF2007-NH); KRON86 is the legacy one.
    nmt_wcs_url: str = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModel"
    nmt_coverage_id: str = "DTM_PL-EVRF2007-NH"

    stac_url: str = "https://earth-search.aws.element84.com/v1"
    stac_collection: str = "sentinel-2-l2a"

    # terrain.steep_area_pct = share of parcel cells with slope above this value.
    steep_slope_threshold_deg: float = 3.0

    # Sentinel-2 polygon cloud thresholds (contract): < ok -> OK, ok..fallback -> CLOUDY_FALLBACK, above -> skipped.
    cloud_ok_pct: float = 20.0
    cloud_fallback_pct: float = 50.0

    # Hard per-module budget enforced in main.py via asyncio.wait_for.
    module_timeout_s: float = 8.0
    # Single outbound HTTP request timeout (must stay below module_timeout_s).
    http_timeout_s: float = 6.5


@lru_cache
def get_settings() -> Settings:
    return Settings()
