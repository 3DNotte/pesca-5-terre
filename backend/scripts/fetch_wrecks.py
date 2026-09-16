"""Scarica i relitti reali dal database UKHO (Worldwide Wrecks), distribuito
da EMODnet Human Activities via WFS, e li salva come GeoJSON statico per il
frontend — sezione 5a del progetto ("layer relitti, UKHO Wrecks database").

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\fetch_wrecks.py
Rigenera public/data/relitti_ukho.geojson. Da rilanciare solo se cambia
l'area (area.ts) o si vuole un dato piu' recente dal servizio EMODnet.
"""

import json
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode

BACKEND_DIR = Path(__file__).resolve().parent.parent
OUT_PATH = BACKEND_DIR.parent / "public" / "data" / "relitti_ukho.geojson"

# Stesso bounding box dell'area operativa (area.ts): Levanto -> Punta di Montenero.
BBOX = "9.53,44.04,9.82,44.23"  # west,south,east,north (WFS 1.0.0: sempre lon,lat)

WFS_URL = "https://ows.emodnet-humanactivities.eu/wfs?" + urlencode(
    {
        "SERVICE": "WFS",
        "VERSION": "1.0.0",
        "request": "GetFeature",
        "typeName": "wwshipwrecks",
        "OUTPUTFORMAT": "json",
        "BBOX": BBOX,
    }
)

# Il database UKHO non ha nome per la maggior parte dei relitti in quest'area
# (16 su 18): dove chi pesca qui conosce il nome locale, lo mettiamo qui cosi'
# sopravvive a un ri-scaricamento del dato (altrimenti si perderebbe ogni
# volta che si rilancia questo script).
#
# I 15 rimasti senza nome vero sono numerati "Zatterone N" come segnaposto
# provvisorio, in ordine di longitudine crescente (da ovest/Levanto verso
# est/Punta di Montenero) — da sostituire uno alla volta con il nome vero
# man mano che vengono identificati.
LOCAL_NAME_OVERRIDES = {
    "36536": "Spiaggione di Corniglia",
    "36165": "Zatterone 1",
    "82397": "Zatterone 2",
    "67220": "Zatterone 3",
    "36413": "Zatterone 4",
    "61836": "Zatterone 5",
    "36433": "Zatterone 6",
    "36167": "Zatterone 7",
    "86948": "Zatterone 8",
    "35855": "Zatterone 9",
    "36168": "Zatterone 10",
    "61837": "Zatterone 11",
    "88018": "Zatterone 12",
    "36435": "Zatterone 13",
    "36169": "Zatterone 14",
    "36434": "Zatterone 15",
}


def clean_feature(raw: dict) -> dict:
    p = raw["properties"]

    depth_m = None
    for key in ("depth", "water_dept"):
        val = p.get(key)
        if val and val != "n/a":
            try:
                depth_m = float(val)
                break
            except ValueError:
                continue

    name = p.get("name")
    name = None if name in (None, "n/a") else name
    name = LOCAL_NAME_OVERRIDES.get(str(p.get("wreck_id")), name)

    circumstance = p.get("circumstan")
    circumstance = None if circumstance in (None, "n/a") else circumstance

    date_sunk = p.get("date_sunk")
    year_sunk = None
    if date_sunk and date_sunk != "n/a" and len(date_sunk) >= 4:
        year_sunk = date_sunk[:4]

    return {
        "type": "Feature",
        "geometry": raw["geometry"],
        "properties": {
            "wreck_id": p.get("wreck_id"),
            "name": name,
            "category": p.get("wreck_cate"),
            "vessel_type": None if p.get("type") in (None, "n/a") else p.get("type"),
            "depth_m": depth_m,
            "year_sunk": year_sunk,
            "removed": p.get("status") == "dead",
            "circumstance": circumstance,
            "source": "UKHO Worldwide Wrecks (EMODnet Human Activities)",
        },
    }


def main() -> None:
    with urlopen(WFS_URL, timeout=30) as resp:
        data = json.load(resp)

    features = [clean_feature(f) for f in data["features"]]
    geojson = {"type": "FeatureCollection", "features": features}

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(geojson, ensure_ascii=False), encoding="utf-8")
    print(f"Scritti {len(features)} relitti reali (UKHO) su {OUT_PATH}")


if __name__ == "__main__":
    main()
