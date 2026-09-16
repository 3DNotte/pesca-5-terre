"""Scarica le isobate di DETTAGLIO di Regione Liguria (layer M2112:L7174,
"Isobatimetriche di dettaglio"): linee ogni 1 metro di profondita', derivate
da un rilievo multibeam reale del 2012 a griglia 1x1m (fonte ufficiale
PTAMC — Piano Territoriale di Coordinamento della Costa, WFS pubblico,
nessuna restrizione dichiarata). Sostituisce come fonte di dettaglio le
fasce ogni 10-500m usate finora (backend/scripts/fetch_liguria_bathymetry.py,
che resta comunque utile per le fasce colorate a bassa risoluzione).

Il layer copre l'intera area operativa (verificato: 20138 feature nel bbox
di area.ts, valori da -1 a oltre -60m). Il server e' un GeoServer con
paginazione WFS 2.0.0 (STARTINDEX/COUNT) — un'unica richiesta si ferma a
5000 feature per limite server, quindi paginiamo.

Output:
- public/data/liguria_isobaths_detailed.geojson (linee, proprieta' "depth")
- backend/data/bathymetry/liguria_detailed_points.npz (nuvola di punti
  [lon, lat, depth] estratta dai vertici delle linee, usata da
  generate_hillshade.py per costruire un DEM reale al posto della griglia
  EMODnet 115m/pixel)

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\fetch_liguria_detailed_isobaths.py
"""

import json
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
from shapely.geometry import box, shape, mapping

BACKEND_DIR = Path(__file__).resolve().parent.parent
GEOJSON_OUT = BACKEND_DIR.parent / "public" / "data" / "liguria_isobaths_detailed.geojson"
POINTS_OUT = BACKEND_DIR / "data" / "bathymetry" / "liguria_detailed_points.npz"

WFS_URL = "https://geoservizi.regione.liguria.it/geoserver/M2112/wfs"

# Stesso bbox EPSG:3003 gia' validato in fetch_liguria_bathymetry.py per
# l'area operativa (area.ts), con margine.
BBOX_3003 = "1538000,4873000,1569000,4902000,EPSG:3003"
CLIP_BOUNDS = box(9.45, 43.98, 9.90, 44.28)
PAGE_SIZE = 5000


def fetch_page(start_index: int) -> dict:
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": "M2112:L7174",
        "outputFormat": "json",
        "srsName": "EPSG:4326",
        "BBOX": BBOX_3003,
        "count": PAGE_SIZE,
        "startIndex": start_index,
    }
    url = f"{WFS_URL}?{urlencode(params)}"
    with urlopen(url, timeout=90) as resp:
        return json.load(resp)


def main() -> None:
    t0 = time.time()
    all_features = []
    start_index = 0
    while True:
        page = fetch_page(start_index)
        feats = page["features"]
        print(f"Pagina da {start_index}: {len(feats)} feature")
        all_features.extend(feats)
        if len(feats) < PAGE_SIZE:
            break
        start_index += PAGE_SIZE

    print(f"Totale scaricato: {len(all_features)} feature in {time.time()-t0:.1f}s")

    line_features = []
    points_lon, points_lat, points_depth = [], [], []
    for f in all_features:
        depth = f["properties"].get("VALUE")
        if depth is None:
            continue
        depth = -depth if depth < 0 else depth  # VALUE e' negativo (elevazione); vogliamo profondita' positiva
        geom = shape(f["geometry"]).intersection(CLIP_BOUNDS)
        if geom.is_empty:
            continue
        line_features.append(
            {
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": {"depth": depth, "ambito": f["properties"].get("AMBITO")},
            }
        )
        coords = list(geom.coords) if geom.geom_type == "LineString" else [
            c for part in geom.geoms for c in part.coords
        ]
        for lon, lat, *_ in coords:
            points_lon.append(lon)
            points_lat.append(lat)
            points_depth.append(depth)

    GEOJSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    GEOJSON_OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": line_features}), encoding="utf-8"
    )
    print(f"Scritte {len(line_features)} linee isobate di dettaglio su {GEOJSON_OUT}")

    POINTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    np.savez(
        POINTS_OUT,
        lon=np.array(points_lon),
        lat=np.array(points_lat),
        depth=np.array(points_depth),
    )
    print(f"Scritti {len(points_lon)} punti (lon,lat,depth) su {POINTS_OUT}")


if __name__ == "__main__":
    main()
