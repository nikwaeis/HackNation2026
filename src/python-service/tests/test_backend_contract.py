"""Contract between the ASP.NET Core client and this geo-worker, exactly as the C# code serializes it.

Source of truth on the C# side (read-only here):
  * src/backend/WodoPlon.Api/Common/Services/PythonServiceClient.cs
      - JsonNamingPolicy.SnakeCaseLower  -> request field "need_terrain" (record ExtractGeoRequest(..., bool NeedTerrain, ...))
      - geometry is an NTS MultiPolygon serialized as GeoJSON
  * src/backend/WodoPlon.Api/Common/Interface/IPythonServiceClient.cs -> record GeoMetrics (FLAT fields):
      mean_slope_deg, max_slope_deg, steep_area_pct, ndvi_mean, ndwi_mean,
      satellite_scene_date, cloud_cover_pct, satellite_status
  * src/backend/WodoPlon.Domain/Enums/SatelliteStatus.cs -> Ok | CloudyFallback | NoData
      (JsonStringEnumConverter(SnakeCaseUpper) => "OK" | "CLOUDY_FALLBACK" | "NO_DATA"; anything else = JsonException)
  * docs/api.md §3.4 describes the same flat response.

If these fields were missing, System.Text.Json would leave every metric null and default SatelliteStatus to Ok:
the report would claim a usable satellite scene without any NDVI/NDWI ("pozorna precyzja", KOWR 3.3.5).
"""

import datetime as dt
import math

import httpx
import pytest

from conftest import EXPECTED_NDVI, EXPECTED_NDWI, PARCEL, TILT, stac_feature

# Values System.Text.Json can bind to the C# SatelliteStatus enum
CSHARP_SATELLITE_STATUSES = {"OK", "CLOUDY_FALLBACK", "NO_DATA"}
FLAT_FIELDS = {
    "mean_slope_deg",
    "max_slope_deg",
    "steep_area_pct",
    "ndvi_mean",
    "ndwi_mean",
    "satellite_scene_date",
    "cloud_cover_pct",
    "satellite_status",
}


def csharp_request(need_terrain: bool = True, **overrides) -> dict:
    """Body as PythonServiceClient sends it (snake_case, need_terrain, MultiPolygon)."""
    body = {
        "dzialka_id": "040101_1.0001.123/4",
        "target_date": "2026-06-15",
        "need_terrain": need_terrain,
        "geometry": PARCEL,
    }
    body.update(overrides)
    return body


def test_flat_fields_for_csharp_client(client, upstream):
    r = client.post("/extract-geo", json=csharp_request())
    assert r.status_code == 200
    j = r.json()
    missing = FLAT_FIELDS - j.keys()
    assert not missing, f"C# GeoMetrics would bind these as null: {missing}"

    slope = math.degrees(math.atan(TILT))
    assert j["mean_slope_deg"] == pytest.approx(slope, abs=0.05)
    assert j["max_slope_deg"] == pytest.approx(slope, abs=0.05)
    assert j["steep_area_pct"] == 100.0
    assert j["ndvi_mean"] == EXPECTED_NDVI
    assert j["ndwi_mean"] == EXPECTED_NDWI
    assert j["satellite_scene_date"] == "2026-06-15"
    dt.date.fromisoformat(j["satellite_scene_date"])  # C# DateOnly needs YYYY-MM-DD
    assert j["cloud_cover_pct"] == 0.0
    assert j["satellite_status"] == "OK"


def test_flat_fields_mirror_nested_blocks(client, upstream):
    """The nested terrain / satellite blocks stay (detail + error_reason) and agree with the flat view."""
    j = client.post("/extract-geo", json=csharp_request()).json()
    assert j["mean_slope_deg"] == j["terrain"]["mean_slope_deg"]
    assert j["ndvi_mean"] == j["satellite"]["ndvi_mean"]
    assert j["satellite_scene_date"] == j["satellite"]["scene_date"]
    assert j["satellite_status"] == j["satellite"]["status"]


def test_need_terrain_false_is_honoured(client, upstream):
    """C# sends need_terrain=false when relief is already cached — NMT must not be called again."""
    j = client.post("/extract-geo", json=csharp_request(need_terrain=False)).json()
    assert "nmt" not in upstream.calls
    assert j["terrain"] is None
    assert j["mean_slope_deg"] is None and j["max_slope_deg"] is None and j["steep_area_pct"] is None
    assert j["satellite_status"] == "OK"


def test_include_terrain_still_accepted(client, upstream):
    """The older field name from api_asp_net_core_python_fastapi.md keeps working."""
    body = csharp_request()
    body.pop("need_terrain")
    body["include_terrain"] = False
    client.post("/extract-geo", json=body)
    assert "nmt" not in upstream.calls


@pytest.mark.parametrize(
    "stac_status, expected",
    [
        (httpx.Response(503, text="down"), "NO_DATA"),  # module ERROR -> C# has no Error member
        (httpx.Response(200, json={"features": []}), "NO_DATA"),
    ],
)
def test_satellite_status_always_binds_to_csharp_enum(client, upstream, stac_status, expected):
    upstream.stac = lambda _req: stac_status
    j = client.post("/extract-geo", json=csharp_request()).json()
    assert j["satellite_status"] in CSHARP_SATELLITE_STATUSES
    assert j["satellite_status"] == expected
    assert j["ndvi_mean"] is None and j["ndwi_mean"] is None and j["satellite_scene_date"] is None
    # the precise reason is still available for logs / debugging
    assert j["satellite"]["status"] in {"ERROR", "NO_DATA"}


def test_cloudy_fallback_flat_status(client, upstream, monkeypatch):
    ref = dt.date(2026, 6, 15)
    upstream.stac = lambda _req: httpx.Response(200, json={"features": [stac_feature("CLOUDY", ref)]})
    # SCL 8 = cloud medium probability on every pixel would be 100 % -> make it ~ 33 % by mixing classes
    import numpy as np

    def read_band(href, grid, resampling):
        band = href.split("/")[-1].removesuffix(".tif")
        if band == "SCL":
            arr = np.full(grid.shape, 4, dtype="uint8")
            arr[: grid.shape[0] // 3, :] = 8
            return arr
        return np.full(grid.shape, {"B04": 1100, "B08": 4100, "B11": 2100}[band], dtype="uint16")

    import app.services.satellite as satellite

    monkeypatch.setattr(satellite, "_read_band", read_band)
    j = client.post("/extract-geo", json=csharp_request(need_terrain=False)).json()
    assert j["satellite_status"] == "CLOUDY_FALLBACK"
    assert 20 <= j["cloud_cover_pct"] <= 50
    assert j["ndvi_mean"] is not None


def test_terrain_failure_gives_null_flat_slope(client, upstream):
    upstream.nmt = lambda _req: httpx.Response(500, text="boom")
    j = client.post("/extract-geo", json=csharp_request()).json()
    assert j["terrain"]["status"] == "ERROR"
    assert j["mean_slope_deg"] is None and j["steep_area_pct"] is None
