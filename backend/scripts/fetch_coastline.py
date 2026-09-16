"""Scarica la linea di riva ATTUALE ufficiale di Regione Liguria (layer
M2112:L7173, WFS pubblico, stessa fonte del rilievo multibeam 2012 gia'
usato per le batimetriche di dettaglio). Serve come base geometrica per
tracciare la rotta traghetti lungo la costa vera, invece di segmenti retti
tra i moli.

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\fetch_coastline.py
"""

import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

BACKEND_DIR = Path(__file__).resolve().parent.parent
OUT_PATH = BACKEND_DIR / "data" / "bathymetry" / "coastline_raw.geojson"

WFS_URL = "https://geoservizi.regione.liguria.it/geoserver/M2112/wfs"
BBOX_3003 = "1538000,4873000,1569000,4902000,EPSG:3003"


def main() -> None:
    params = {
        "service": "WFS",
        "version": "1.0.0",
        "request": "GetFeature",
        "typeName": "M2112:L7173",
        "outputFormat": "json",
        "srsName": "EPSG:4326",
        "BBOX": BBOX_3003,
    }
    url = f"{WFS_URL}?{urlencode(params)}"
    with urlopen(url, timeout=60) as resp:
        data = json.load(resp)
    print(f"Scaricate {len(data['features'])} feature di linea di costa")
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(data), encoding="utf-8")
    print(f"Scritto {OUT_PATH}")


if __name__ == "__main__":
    main()
