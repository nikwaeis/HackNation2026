"""Small geometry helpers shared by the analysis modules."""

from functools import lru_cache

from pyproj import Transformer
from shapely.geometry.base import BaseGeometry
from shapely.ops import transform

WGS84 = 4326
PL_1992 = 2180  # EPSG:2180, PUWG 1992 – native CRS of the GUGiK NMT


@lru_cache(maxsize=16)
def _transformer(src_epsg: int, dst_epsg: int) -> Transformer:
    # always_xy=True -> (lon, lat) / (easting, northing) regardless of the CRS axis order.
    return Transformer.from_crs(src_epsg, dst_epsg, always_xy=True)


def reproject(geom: BaseGeometry, dst_epsg: int, src_epsg: int = WGS84) -> BaseGeometry:
    """Reproject a shapely geometry. Call from the event-loop thread only (Transformer is cached)."""
    return transform(_transformer(src_epsg, dst_epsg).transform, geom)
