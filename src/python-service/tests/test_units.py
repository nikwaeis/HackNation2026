"""Unit tests for the computation pieces (no HTTP)."""

import asyncio
import datetime as dt

import numpy as np
import pytest
from shapely.geometry import box

import app.services.satellite as sat
from app.config import Settings
from app.schemas import SatelliteMetrics
from app.services.terrain import _compute, grid_step_m

# --------------------------------------------------------------------------- terrain


@pytest.mark.parametrize(
    "side_m, expected",
    [(50, 1.0), (130, 1.0), (260, 2.0), (1300, 10.0), (13000, 100.0)],
)
def test_grid_step_is_max_side_over_130_min_1m(side_m, expected):
    assert grid_step_m(box(500000, 400000, 500000 + side_m, 400000 + side_m / 2)) == expected


def _aaigrid(z: np.ndarray, minx: float, miny: float, cell: float) -> bytes:
    h, w = z.shape
    head = f"ncols {w}\nnrows {h}\nxllcorner {minx}\nyllcorner {miny}\ncellsize {cell}\n"
    return (head + "\n".join(" ".join(f"{v:.3f}" for v in row) for row in z)).encode()


def test_flat_terrain_with_zero_nodata_band():
    """Exact 0.0 cells (service nodata) must not create fake cliffs or a 0 m minimum."""
    z = np.full((20, 20), 150.0)
    z[:, :3] = 0.0  # nodata strip on the west edge, partly inside the polygon
    content = _aaigrid(z, 0.0, 0.0, 1.0)
    polygon = box(1.0, 1.0, 19.0, 19.0)
    r = _compute(content, polygon, steep_threshold_deg=3.0)
    assert r.status == "OK"
    assert r.elevation_min_m == 150.0 and r.elevation_diff_m == 0.0
    assert r.max_slope_deg == 0.0 and r.steep_area_pct == 0.0


def test_terrain_all_nodata_is_no_data():
    content = _aaigrid(np.zeros((10, 10)), 0.0, 0.0, 1.0)
    r = _compute(content, box(2, 2, 8, 8), steep_threshold_deg=3.0)
    assert r.status == "NO_DATA" and r.mean_slope_deg is None


# --------------------------------------------------------------------------- satellite scene selection

REF = dt.date(2026, 6, 15)


def _run_selection(monkeypatch, clouds: dict[str, object]) -> SatelliteMetrics:
    scenes = [
        sat._Scene(id=sid, date=REF - dt.timedelta(days=i), epsg=32634, hrefs={}, scale_offset={})
        for i, sid in enumerate(clouds)
    ]

    async def fake_search(*_):
        return scenes

    async def fake_assess(scene, _):
        v = clouds[scene.id]
        if v == "unusable":
            raise sat._SceneUnusable(f"{scene.id}: unusable")
        if v == "error":
            raise OSError("read failed")
        return sat._Assessment(scene=scene, grid=None, clean=None, cloud_pct=v)

    async def fake_compute(a, status):
        return SatelliteMetrics(status=status, scene_date=a.scene.date.isoformat(), cloud_cover_pct=a.cloud_pct)

    monkeypatch.setattr(sat, "_search", fake_search)
    monkeypatch.setattr(sat, "_assess_scene", fake_assess)
    monkeypatch.setattr(sat, "_compute_indices", fake_compute)
    return asyncio.run(sat.analyze_satellite(box(0, 0, 1, 1), REF, None, Settings()))


@pytest.mark.parametrize(
    "clouds, status, scene_date",
    [
        ({"A": 5.0, "B": 1.0}, "OK", "2026-06-15"),  # newest clear scene wins
        ({"A": 35.0, "B": 10.0}, "OK", "2026-06-14"),  # keeps looking for < 20 %
        ({"A": 45.0, "B": 30.0, "C": 80.0}, "CLOUDY_FALLBACK", "2026-06-14"),  # least cloudy 20-50 %
        ({"A": 20.0}, "CLOUDY_FALLBACK", "2026-06-15"),
        ({"A": 90.0, "B": 60.0}, "NO_DATA", None),
        ({"A": "unusable", "B": "error"}, "NO_DATA", None),
        ({"A": "error", "B": "error"}, "ERROR", None),  # nothing inspected -> upstream problem
    ],
)
def test_scene_selection(monkeypatch, clouds, status, scene_date):
    r = _run_selection(monkeypatch, clouds)
    assert (r.status, r.scene_date) == (status, scene_date)


def test_normalized_difference_ignores_invalid_and_clips():
    a = np.array([[0.5, 0.0], [0.3, 0.2]])
    b = np.array([[0.1, 0.0], [0.3, -0.5]])
    valid = np.array([[True, True], [True, False]])
    # pixel (0,1): denominator 0 -> skipped; (1,1) invalid -> skipped
    assert sat._normalized_difference(a, b, valid) == round(((0.4 / 0.6) + 0.0) / 2, 4)


# --------------------------------------------------------------------------- reflectance offset sanity
#
# Live finding (Earth Search v1): some items declare raster:bands offset -0.1 although their DNs are already
# harmonised (same acquisition as an offset-0 item, identical DNs; or every land pixel below DN 1000).
# Applying the offset blindly makes red reflectance negative and pins NDVI near 1.0.


def _scene(offset: float) -> sat._Scene:
    so = {b: (0.0001, offset) for b in ("red", "nir", "swir16")}
    so["scl"] = (1.0, 0.0)
    return sat._Scene(id="S", date=REF, epsg=32634, hrefs={}, scale_offset=so)


def test_offset_kept_when_dns_carry_it():
    """Baseline >= 04.00 DNs (+1000) -> offset -0.1 is real and must be applied."""
    red = np.full((4, 4), 1300)  # 0.03 reflectance after offset
    valid = np.ones((4, 4), bool)
    assert sat._effective_scale_offset(_scene(-0.1), red, valid)["red"] == (0.0001, -0.1)


def test_offset_dropped_when_it_would_make_reflectance_negative():
    """Observed on S2 2026-05-29 over a Lubowidz plot: red DN 589-969 with declared offset -0.1."""
    red = np.array([[589, 755], [969, 700]])
    valid = np.ones((2, 2), bool)
    eff = sat._effective_scale_offset(_scene(-0.1), red, valid)
    assert eff["red"] == (0.0001, 0.0) and eff["nir"] == (0.0001, 0.0) and eff["swir16"] == (0.0001, 0.0)


def test_ndvi_is_plausible_for_harmonised_dns(monkeypatch):
    """End-to-end on the observed DN medians: NDVI must be ~0.50, not ~1.0."""
    dn = {"red": 755, "nir": 2278, "swir16": 1929}
    grid = sat._Grid(bounds=(0, 0, 40, 40), shape=(4, 4), inside=np.ones((4, 4), bool))
    a = sat._Assessment(scene=_scene(-0.1), grid=grid, clean=np.ones((4, 4), bool), cloud_pct=0.0)
    band_of = {"r": "red", "n": "nir", "s": "swir16"}
    monkeypatch.setattr(sat, "_read_band", lambda href, g, r: np.full(g.shape, dn[band_of[href]], dtype="uint16"))
    a = sat._Assessment(
        scene=sat._Scene(id="S", date=REF, epsg=32634, hrefs={"red": "r", "nir": "n", "swir16": "s"},
                         scale_offset=a.scene.scale_offset),
        grid=grid, clean=a.clean, cloud_pct=0.0,
    )
    r = asyncio.run(sat._compute_indices(a, "OK"))
    assert r.ndvi_mean == pytest.approx((0.2278 - 0.0755) / (0.2278 + 0.0755), abs=1e-3)  # 0.502
    assert r.ndwi_mean == pytest.approx((0.2278 - 0.1929) / (0.2278 + 0.1929), abs=1e-3)
    assert r.ndvi_mean < 0.9
