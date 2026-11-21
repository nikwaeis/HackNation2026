"""Debug: raw Sentinel-2 DN values over one parcel, to check the reflectance scale/offset handling.

Not a pytest test (needs network). Usage: python tests/live_debug_ndvi.py <parcel_id> <YYYY-MM-DD>
"""

import asyncio
import datetime as dt
import sys

import httpx
import numpy as np
from rasterio.enums import Resampling
from shapely.geometry import shape

import app.services.satellite as sat
from app.config import get_settings
from app.geo import reproject
from tests.live_smoke import uldk_geometry


async def main(parcel_id: str, date: str) -> None:
    poly = shape(uldk_geometry(parcel_id))
    settings = get_settings()
    async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "wodoplon-live-debug/1.0"}) as client:
        scenes = await sat._search(client, settings, poly, dt.date.fromisoformat(date))
    for scene in scenes[:3]:
        grid = sat._build_grid(reproject(poly, scene.epsg))
        print(f"\n{scene.id} {scene.date} epsg={scene.epsg} grid={grid.shape} inside_px={int(grid.inside.sum())}")
        print("  scale/offset:", scene.scale_offset)
        scl = sat._read_band(scene.hrefs["scl"], grid, Resampling.nearest)
        print("  SCL classes inside:", dict(zip(*np.unique(scl[grid.inside], return_counts=True))))
        for band in ("red", "nir", "swir16"):
            dn = sat._read_band(scene.hrefs[band], grid, Resampling.nearest)[grid.inside]
            refl = sat._reflectance(dn, scene.scale_offset[band])
            print(f"  {band:6s} DN min/med/max = {dn.min()}/{int(np.median(dn))}/{dn.max()}  "
                  f"refl med = {np.median(refl):.4f}  share(refl<0) = {(refl < 0).mean():.2f}")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1], sys.argv[2]))
