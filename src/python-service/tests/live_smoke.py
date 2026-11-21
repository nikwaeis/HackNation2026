"""Live smoke test against the REAL external services (ULDK, GUGiK NMT WCS, Earth Search / Sentinel-2).

Not collected by pytest (no test_ prefix) — needs network. Run inside the service image:
    docker run --rm -v "<repo>/src/python-service:/app" -w /app <image> python tests/live_smoke.py
For every parcel: boundary from ULDK -> POST /extract-geo exactly as the C# client sends it -> print the flat
contract fields and the wall time (the KOWR budget for a whole analysis is 30 s; the worker gets 18 s of it).
"""

import json
import sys
import time
import urllib.parse
import urllib.request

from fastapi.testclient import TestClient
from shapely import wkt
from shapely.geometry import mapping

from app.main import app

# (parcel id, target date, note)
PARCELS = [
    ("040706_5.0016.16/10", "2025-07-15", "arable field, Kruszwica (kujawsko-pomorskie)"),
    ("143703_4.0001.387", "2026-06-01", "house plot, Lubowidz (mazowieckie) — built-up land"),
    ("040706_5.0016.16/10", "2018-06-20", "same field, date 8 years back (drought year)"),
]


def uldk_geometry(parcel_id: str) -> dict:
    q = urllib.parse.urlencode({"request": "GetParcelById", "id": parcel_id, "result": "geom_wkt", "srid": "4326"})
    req = urllib.request.Request(f"https://uldk.gugik.gov.pl/?{q}", headers={"User-Agent": "wodoplon-live-smoke/1.0"})
    text = urllib.request.urlopen(req, timeout=15).read().decode()
    lines = [l for l in text.splitlines() if l.strip()]
    if not lines or lines[0].strip() != "0":
        raise RuntimeError(f"ULDK: {text[:120]!r}")
    geom = wkt.loads(lines[1].split(";", 1)[-1])
    if geom.geom_type == "Polygon":  # C# always sends a MultiPolygon
        from shapely.geometry import MultiPolygon

        geom = MultiPolygon([geom])
    # ULDK EPSG:4326 WKT is lat/lon? It returns x=lon, y=lat; guard against a swap anyway
    minx, miny, _, _ = geom.bounds
    if minx > 45:
        from shapely.ops import transform

        geom = transform(lambda x, y: (y, x), geom)
    return mapping(geom)


def main() -> int:
    failures = 0
    with TestClient(app) as client:
        for parcel_id, date, note in PARCELS:
            print(f"\n=== {parcel_id} @ {date} — {note}")
            try:
                geometry = uldk_geometry(parcel_id)
            except Exception as exc:  # noqa: BLE001
                print(f"  ULDK failed: {exc}")
                failures += 1
                continue
            body = {"dzialka_id": parcel_id, "target_date": date, "need_terrain": True, "geometry": geometry}
            t0 = time.monotonic()
            r = client.post("/extract-geo", json=body)
            took = time.monotonic() - t0
            j = r.json()
            flat = {k: j.get(k) for k in (
                "mean_slope_deg", "max_slope_deg", "steep_area_pct", "ndvi_mean", "ndwi_mean",
                "satellite_scene_date", "cloud_cover_pct", "satellite_status",
            )}
            print(f"  HTTP {r.status_code} in {took:.1f}s")
            print("  flat:", json.dumps(flat))
            print("  terrain:", (j.get("terrain") or {}).get("status"), (j.get("terrain") or {}).get("error_reason"))
            print("  satellite:", j["satellite"]["status"], j["satellite"].get("error_reason"))
            if r.status_code != 200 or took > 18:
                failures += 1
    print(f"\n{'OK' if not failures else f'{failures} problem(s)'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
