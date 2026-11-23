#!/bin/sh
# Imports all Polish OSM water (rivers, streams, canals, ditches, drains, lakes, wetlands) into hydro_features,
# so the API finds nearby water and draws ditches locally in milliseconds instead of asking Overpass.
#
# `docker compose up` starts it automatically (OSM_IMPORT=auto): it waits for the database schema, then imports
# unless the last import is younger than OSM_IMPORT_MAX_AGE_DAYS (30). The first run downloads ~2.1 GB.
#   OSM_IMPORT=auto    import when missing or older than OSM_IMPORT_MAX_AGE_DAYS (compose default)
#   OSM_IMPORT=always  import now (default when the script is run directly)
#   OSM_IMPORT=off     do nothing (slow or metered connections; the API then asks Overpass per parcel)
# Refresh by hand: docker compose -f docker-compose.dev.yml run --rm -e OSM_IMPORT=always osm-import
# It is idempotent (upsert by OSM id).
set -eu

MODE="${OSM_IMPORT:-always}"
MAX_AGE_DAYS="${OSM_IMPORT_MAX_AGE_DAYS:-30}"
if [ "$MODE" = "off" ]; then
  echo "OSM_IMPORT=off: skipping the OSM water import"
  exit 0
fi

PBF_URL="${PBF_URL:-https://download.geofabrik.de/europe/poland-latest.osm.pbf}"
PBF=/data/poland-latest.osm.pbf
# prod passes the password as a docker secret file
if [ -n "${PGPASSWORD_FILE:-}" ]; then PGPASSWORD="$(cat "$PGPASSWORD_FILE")"; export PGPASSWORD; fi
PG="PG:host=${PGHOST} dbname=${PGDATABASE} user=${PGUSER} password=${PGPASSWORD}"

sql() { ogrinfo -q "$PG" -sql "$1" > /dev/null; }

# the API creates the tables (dev: migrations on startup; prod: applied by hand), so wait for them
waited=0
until ogrinfo -q "$PG" -sql "SELECT 1 FROM data_imports LIMIT 1" > /dev/null 2>&1; do
  if [ "$waited" -ge 900 ]; then
    echo "database tables not found after 15 minutes: apply the API migrations first (docs/setup.md)" >&2
    exit 1
  fi
  [ "$waited" -eq 0 ] && echo "waiting for the database schema (API migrations)..."
  sleep 10
  waited=$((waited + 10))
done

if [ "$MODE" = "auto" ] && ogrinfo "$PG" -sql "SELECT name FROM data_imports WHERE name = 'osm_water'
     AND imported_at > now() - interval '$MAX_AGE_DAYS days'" 2> /dev/null | grep -q "name (String) = osm_water"; then
  echo "OSM water was imported in the last $MAX_AGE_DAYS days: nothing to do (OSM_IMPORT=always forces a refresh)"
  exit 0
fi

echo "1/4 download (only if Geofabrik has a newer file)"
# abort a stalled transfer instead of waiting forever
fetch() { curl -fsSL -R --connect-timeout 30 --speed-limit 1024 --speed-time 60 -o "$PBF.part" "$@"; }
if [ -f "$PBF" ]; then
  fetch -z "$PBF" "$PBF_URL" && [ -s "$PBF.part" ] && mv "$PBF.part" "$PBF" || rm -f "$PBF.part"
else
  # "latest" redirects to the newest dated file, which can hang or answer 404/502 until Geofabrik publishes it:
  # then take one of the previous days' extracts
  if ! fetch "$PBF_URL"; then
    for days in 1 2 3; do
      url="https://download.geofabrik.de/europe/poland/poland-$(date -u -d "$days days ago" +%y%m%d).osm.pbf"
      echo "    download failed, trying $url"
      fetch "$url" && break
    done
  fi
  [ -s "$PBF.part" ] && mv "$PBF.part" "$PBF"
fi
SOURCE_DATE="$(date -u -r "$PBF" +%F)"
echo "    extract date: $SOURCE_DATE"

# OSM driver: larger temp index in RAM/disk makes the 2 GB extract much faster
export OSM_MAX_TMPFILE_SIZE=2000

echo "2/4 waterways (lines)"
ogr2ogr -f PostgreSQL "$PG" "$PBF" lines -overwrite -nln osm_water_lines -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -lco SPATIAL_INDEX=NONE -select osm_id,name,waterway \
  -where "waterway IN ('river','stream','canal','ditch','drain')"

echo "3/4 lakes and wetlands (areas)"
ogr2ogr -f PostgreSQL "$PG" "$PBF" multipolygons -overwrite -nln osm_water_areas -t_srs EPSG:4326 \
  -lco GEOMETRY_NAME=geom -lco SPATIAL_INDEX=NONE -select osm_id,osm_way_id,name,natural \
  -where "\"natural\" IN ('water','wetland')"

echo "4/4 upsert into hydro_features"
# ids as Overpass returns them: ways positive; relations negative so they never clash with way ids
sql "INSERT INTO hydro_features (feature_type, name, geom, osm_id)
     SELECT DISTINCT ON (osm_id::bigint)
            CASE WHEN waterway IN ('river','stream','canal') THEN 'River' ELSE 'Ditch' END,
            left(name, 150), geom, osm_id::bigint
     FROM osm_water_lines WHERE geom IS NOT NULL
     ON CONFLICT (osm_id) DO UPDATE SET feature_type = EXCLUDED.feature_type, name = EXCLUDED.name, geom = EXCLUDED.geom"
sql "INSERT INTO hydro_features (feature_type, name, geom, osm_id)
     SELECT DISTINCT ON (id) type, name, geom, id FROM (
       SELECT CASE \"natural\" WHEN 'water' THEN 'Lake' ELSE 'Wetland' END AS type, left(name, 150) AS name,
              ST_MakeValid(geom) AS geom, COALESCE(osm_way_id::bigint, -osm_id::bigint) AS id
       FROM osm_water_areas WHERE geom IS NOT NULL) a
     ON CONFLICT (osm_id) DO UPDATE SET feature_type = EXCLUDED.feature_type, name = EXCLUDED.name, geom = EXCLUDED.geom"
sql "DROP TABLE osm_water_lines"
sql "DROP TABLE osm_water_areas"
sql "ANALYZE hydro_features"
# profiles checked against older data get the new one on their next analysis
sql "UPDATE parcel_static_profiles SET water_checked_at = NULL"
sql "INSERT INTO data_imports (name, imported_at, source_date) VALUES ('osm_water', now(), DATE '$SOURCE_DATE')
     ON CONFLICT (name) DO UPDATE SET imported_at = EXCLUDED.imported_at, source_date = EXCLUDED.source_date"

echo "done: OSM water as of $SOURCE_DATE"
