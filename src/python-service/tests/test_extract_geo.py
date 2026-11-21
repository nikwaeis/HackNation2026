"""Contract tests for GET /health and POST /extract-geo (api_asp_net_core_python_fastapi.md, section 2).

All external APIs are mocked (see conftest.py); no network access.
"""

import asyncio
import datetime as dt
import math
import time

import httpx
import pytest

from app.config import Settings
from conftest import EXPECTED_NDVI, EXPECTED_NDWI, TILT, request_body, stac_feature

# Contract field -> allowed JSON types (None = nullable). Numbers: C# decimal? accepts int or float.
NUM = (int, float)
CONTRACT_TOP = {"dzialka_id": (str,), "terrain": (dict, type(None)), "satellite": (dict,)}
CONTRACT_TERRAIN = {
    "status": (str,),
    "mean_slope_deg": (*NUM, type(None)),
    "max_slope_deg": (*NUM, type(None)),
    "steep_area_pct": (*NUM, type(None)),
    "source": (str,),
}
CONTRACT_SATELLITE = {
    "status": (str,),
    "ndvi_mean": (*NUM, type(None)),
    "ndwi_mean": (*NUM, type(None)),
    "scene_date": (str, type(None)),
    "cloud_cover_pct": (*NUM, type(None)),
    "source": (str,),
}
TERRAIN_STATUSES = {"OK", "NO_DATA", "ERROR"}
SATELLITE_STATUSES = {"OK", "CLOUDY_FALLBACK", "NO_DATA", "ERROR"}


def assert_matches(obj: dict, spec: dict, where: str) -> None:
    missing = spec.keys() - obj.keys()
    assert not missing, f"{where}: missing contract fields {missing}"
    for key, types in spec.items():
        assert isinstance(obj[key], types) and not isinstance(obj[key], bool), (
            f"{where}.{key}={obj[key]!r} has type {type(obj[key]).__name__}, expected {types}"
        )


def assert_contract(j: dict) -> None:
    assert_matches(j, CONTRACT_TOP, "response")
    if j["terrain"] is not None:
        assert_matches(j["terrain"], CONTRACT_TERRAIN, "terrain")
        assert j["terrain"]["status"] in TERRAIN_STATUSES
    assert_matches(j["satellite"], CONTRACT_SATELLITE, "satellite")
    assert j["satellite"]["status"] in SATELLITE_STATUSES


# --------------------------------------------------------------------------- health


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


# --------------------------------------------------------------------------- (a) valid request


def test_a_valid_request_matches_contract(client, upstream):
    r = client.post("/extract-geo", json=request_body())
    assert r.status_code == 200
    j = r.json()
    assert_contract(j)
    assert j["dzialka_id"] == "040101_1.0001.123/4"

    t = j["terrain"]
    assert t["status"] == "OK"
    assert t["source"] == "Geoportal NMT WCS"
    expected_slope = math.degrees(math.atan(TILT))  # 5.71 deg on the synthetic tilted plane
    assert t["mean_slope_deg"] == pytest.approx(expected_slope, abs=0.05)
    assert t["max_slope_deg"] == pytest.approx(expected_slope, abs=0.05)
    assert t["steep_area_pct"] == 100.0  # every cell > 3 deg

    s = j["satellite"]
    assert s == {
        "status": "OK",
        "ndvi_mean": EXPECTED_NDVI,
        "ndwi_mean": EXPECTED_NDWI,
        "scene_date": "2026-06-15",
        "cloud_cover_pct": 0.0,
        "source": "Sentinel-2 L2A (Earth Search)",
        "error_reason": None,
    }


def test_a_wcs_request_uses_working_coverage_and_format(client, upstream):
    seen = {}

    def nmt(request: httpx.Request):
        seen.update(request.url.params)
        from conftest import tilted_aaigrid

        return httpx.Response(200, text=tilted_aaigrid(dict(request.url.params)))

    upstream.nmt = nmt
    client.post("/extract-geo", json=request_body())
    assert seen["VERSION"] == "1.0.0"
    assert seen["COVERAGE"] == "DTM_PL-EVRF2007-NH"
    assert seen["FORMAT"] == "image/x-aaigrid"  # image/tiff on this service is an 8-bit RGB rendering
    assert seen["CRS"] == "EPSG:2180"
    # adaptive grid: ~300 m parcel -> step = max_side/130 ~ 2.4 m; padded bbox -> ~ 130 + 2*2 cells
    assert 125 <= int(seen["WIDTH"]) <= 140


# --------------------------------------------------------------------------- (b) include_terrain=false


def test_b_include_terrain_false_skips_nmt(client, upstream):
    r = client.post("/extract-geo", json=request_body(include_terrain=False))
    assert r.status_code == 200
    j = r.json()
    assert j["terrain"] is None
    assert "nmt" not in upstream.calls
    assert j["satellite"]["status"] == "OK"
    assert_contract(j)


# --------------------------------------------------------------------------- (c) upstream failures / timeouts


def test_c_default_timeouts_are_production_safe():
    s = Settings()
    # must stay well below the 18 s the API waits for the geo-worker
    assert 10.0 <= s.module_timeout_s <= 15.0
    assert s.http_timeout_s < s.module_timeout_s
    assert s.nmt_attempts * s.nmt_attempt_timeout_s < s.module_timeout_s


async def _hang(_request):
    await asyncio.sleep(120)


def test_c_nmt_retries_after_a_hung_attempt(client, upstream):
    """GUGiK NMT times out on one request, answers the next: terrain must still be OK."""

    async def time_out_once(request):
        # MockTransport has no network I/O, so the attempt timeout is simulated by the exception httpx raises
        upstream.nmt = None  # the retry gets the default tilted plane
        raise httpx.ReadTimeout("hung", request=request)

    upstream.nmt = time_out_once
    j = client.post("/extract-geo", json=request_body()).json()
    assert j["terrain"]["status"] == "OK" and j["terrain"]["mean_slope_deg"] is not None


def test_c_both_apis_hang_real_12s_budget(client, upstream):
    """Real default budget: must answer in ~12 s, not after the upstream's 70-100 s."""
    upstream.nmt = _hang
    upstream.stac = _hang
    t0 = time.monotonic()
    r = client.post("/extract-geo", json=request_body())
    elapsed = time.monotonic() - t0
    assert r.status_code == 200
    assert 11.5 <= elapsed < 14.0, f"took {elapsed:.1f}s"
    j = r.json()
    assert_contract(j)
    assert j["terrain"]["status"] == "ERROR" and "timeout" in j["terrain"]["error_reason"]
    assert j["satellite"]["status"] == "ERROR" and "timeout" in j["satellite"]["error_reason"]


def test_c_sentinel_cog_read_thread_hangs(client, upstream, settings, release_threads):
    """A blocked GDAL read in a worker thread must not hold the response past the budget."""
    settings.module_timeout_s = 2.0
    upstream.band_hook = lambda href: release_threads.wait(60)
    t0 = time.monotonic()
    r = client.post("/extract-geo", json=request_body(include_terrain=False))
    elapsed = time.monotonic() - t0
    assert r.status_code == 200
    assert elapsed < 3.0, f"took {elapsed:.1f}s"
    assert r.json()["satellite"]["status"] == "ERROR"


@pytest.mark.parametrize(
    "nmt_response, expected_status",
    [
        (lambda req: httpx.Response(503, text="Service Unavailable"), "ERROR"),
        (lambda req: (_ for _ in ()).throw(httpx.ConnectError("refused", request=req)), "ERROR"),
        (lambda req: httpx.Response(200, text="<html>maintenance</html>"), "ERROR"),
        (
            lambda req: httpx.Response(
                200,
                text='<?xml version="1.0"?><ServiceExceptionReport><ServiceException code="NoApplicableCode">'
                "msWCSGetCoverage(): Requested BBOX is outside requested coverage BBOX</ServiceException>"
                "</ServiceExceptionReport>",
            ),
            "NO_DATA",
        ),
    ],
    ids=["http-503", "connect-error", "garbage-body", "bbox-outside-poland"],
)
def test_c_nmt_failures_return_200(client, upstream, nmt_response, expected_status):
    upstream.nmt = nmt_response
    r = client.post("/extract-geo", json=request_body())
    assert r.status_code == 200
    j = r.json()
    assert_contract(j)
    assert j["terrain"]["status"] == expected_status
    assert j["terrain"]["error_reason"]
    assert j["satellite"]["status"] == "OK"  # one failing module does not affect the other


@pytest.mark.parametrize(
    "stac_response",
    [
        lambda req: httpx.Response(502, text="Bad Gateway"),
        lambda req: (_ for _ in ()).throw(httpx.ReadTimeout("slow", request=req)),
        lambda req: httpx.Response(200, text="not json"),
    ],
    ids=["http-502", "read-timeout", "invalid-json"],
)
def test_c_stac_failures_return_200(client, upstream, stac_response):
    upstream.stac = stac_response
    r = client.post("/extract-geo", json=request_body())
    assert r.status_code == 200
    j = r.json()
    assert_contract(j)
    assert j["satellite"]["status"] == "ERROR"
    assert j["satellite"]["ndvi_mean"] is None
    assert j["terrain"]["status"] == "OK"


def test_c_all_scenes_cloudy_is_no_data(client, upstream):
    upstream.stac = lambda req: httpx.Response(
        200, json={"features": [stac_feature("S2_CLOUDY", dt.date(2026, 6, 14))]}
    )
    upstream.scl_by_scene = {"S2_CLOUDY": 9}  # cloud high probability everywhere
    j = client.post("/extract-geo", json=request_body()).json()
    assert j["satellite"]["status"] == "NO_DATA"
    assert j["satellite"]["ndvi_mean"] is None and j["satellite"]["ndwi_mean"] is None


# --------------------------------------------------------------------------- (d) historical date window


def test_d_historical_date_never_uses_future_scenes(client, upstream):
    target = dt.date(2022, 6, 20)
    features = [
        stac_feature("S2_FUTURE", dt.date(2022, 6, 21)),  # server misbehaving: after target_date
        stac_feature("S2_ON_DATE", dt.date(2022, 6, 20)),
        stac_feature("S2_OLDER", dt.date(2022, 5, 25)),
    ]
    upstream.stac = lambda req: httpx.Response(200, json={"features": features})

    r = client.post("/extract-geo", json=request_body(target_date="2022-06-20", include_terrain=False))
    assert r.status_code == 200

    # The STAC query window is exactly [date - 30 days, date].
    (body,) = upstream.stac_bodies
    start, end = body["datetime"].split("/")
    assert start == "2022-05-21T00:00:00Z"
    assert end == "2022-06-20T23:59:59.999Z"
    assert dt.date.fromisoformat(start[:10]) == target - dt.timedelta(days=30)

    # Nothing after target_date is ever read or returned.
    assert not any("S2_FUTURE" in h for h in upstream.read_hrefs)
    s = r.json()["satellite"]
    assert s["status"] == "OK"
    assert s["scene_date"] == "2022-06-20"
    assert dt.date.fromisoformat(s["scene_date"]) <= target


def test_d_cloudy_newest_falls_back_to_older_clear_scene(client, upstream):
    features = [stac_feature("S2_NEW", dt.date(2022, 6, 19)), stac_feature("S2_OLD", dt.date(2022, 6, 1))]
    upstream.stac = lambda req: httpx.Response(200, json={"features": features})
    upstream.scl_by_scene = {"S2_NEW": 8, "S2_OLD": 4}
    s = client.post("/extract-geo", json=request_body(target_date="2022-06-20", include_terrain=False)).json()[
        "satellite"
    ]
    assert s["status"] == "OK" and s["scene_date"] == "2022-06-01"


# --------------------------------------------------------------------------- (e) invalid input -> 400


@pytest.mark.parametrize(
    "payload",
    [
        request_body(target_date="invalid"),
        request_body(target_date="2026-02-30"),
        request_body(target_date="15.06.2026"),
        request_body(geometry={"type": "Point", "coordinates": [18.0, 53.0]}),
        request_body(
            geometry={"type": "Polygon", "coordinates": [[[20.87, 51.86], [20.88, 51.87], [20.88, 51.86], [20.87, 51.87], [20.87, 51.86]]]}
        ),
        {k: v for k, v in request_body().items() if k != "dzialka_id"},
        {k: v for k, v in request_body().items() if k != "geometry"},
    ],
    ids=["date-invalid", "date-impossible", "date-wrong-format", "point", "self-intersecting", "no-dzialka", "no-geometry"],
)
def test_e_invalid_payload_is_400(client, upstream, payload):
    r = client.post("/extract-geo", json=payload)
    assert r.status_code == 400, r.text
    assert upstream.calls == []  # nothing is sent upstream for invalid input


def test_e_malformed_json_is_400(client, upstream):
    r = client.post("/extract-geo", content=b'{"dzialka_id": "x", ', headers={"content-type": "application/json"})
    assert r.status_code == 400
    assert upstream.calls == []
