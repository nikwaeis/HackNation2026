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


def test_search_keeps_latest_reprocessing_only(monkeypatch):
    feats = [
        {"id": sid, "properties": {"datetime": f"{d}T10:00:00Z", "proj:epsg": 32634},
         "assets": {b: {"href": "x"} for b in sat.BANDS}}
        for sid, d in [("S2A_33UYU_20260615_0_L2A", "2026-06-15"), ("S2A_33UYU_20260615_1_L2A", "2026-06-15"),
                       ("S2A_34UCD_20260615_0_L2A", "2026-06-15")]
    ]

    class Resp:
        def raise_for_status(self): ...
        def json(self): return {"features": feats}

    class Client:
        async def post(self, *_, **__): return Resp()

    scenes = asyncio.run(sat._search(Client(), Settings(), box(0, 0, 1, 1), REF))
    assert [s.id for s in scenes] == ["S2A_34UCD_20260615_0_L2A", "S2A_33UYU_20260615_1_L2A"]


def test_cloudy_overpass_skips_other_tiles_same_date(monkeypatch):
    seen = []
    scenes = [sat._Scene(id=i, date=d, epsg=32634, hrefs={}, scale_offset={})
              for i, d in [("T1", REF), ("T2", REF), ("T3", REF - dt.timedelta(days=2))]]

    async def fake_search(*_):
        return scenes

    async def fake_assess(scene, _):
        seen.append(scene.id)
        if scene.id == "T1":
            raise sat._SceneCloudy("T1: clouds")
        return sat._Assessment(scene=scene, grid=None, clean=None, cloud_pct=1.0)

    async def fake_compute(a, status):
        return SatelliteMetrics(status=status, scene_date=a.scene.date.isoformat())

    monkeypatch.setattr(sat, "_search", fake_search)
    monkeypatch.setattr(sat, "_assess_scene", fake_assess)
    monkeypatch.setattr(sat, "_compute_indices", fake_compute)
    r = asyncio.run(sat.analyze_satellite(box(0, 0, 1, 1), REF, None, Settings()))
    assert seen == ["T1", "T3"] and r.scene_date == "2026-06-13"
