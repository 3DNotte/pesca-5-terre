"""Scarica le fasce batimetriche ufficiali di Regione Liguria (digitalizzate da
carte nautiche, licenza CC BY) e le converte in due layer per il frontend:

1. public/data/liguria_bathymetry_bands.geojson — poligoni di fascia
   (0-10, 10-20, 20-30, 30-50, 50-100, 100-200, 200-500, 500-1000 m), per un
   riempimento colorato molto piu' fedele del raster EMODnet.
2. public/data/liguria_isobaths.geojson — i confini tra fasce adiacenti,
   estratti come linee etichettate con la profondita' esatta (10, 20, 30, 50,
   100, 200, 500m) — queste SONO isobate vere, non stimate da una griglia
   grossolana.

Fonte: Regione Liguria, Sistema Informativo della Costa (SICOAST), layer
"Batimetrie" (id D.1222.L3121), CC BY. Attribuzione obbligatoria: "Regione
Liguria - SICOAST".

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\fetch_liguria_bathymetry.py
"""

import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

from shapely.geometry import box, shape, mapping
from shapely.ops import unary_union

BACKEND_DIR = Path(__file__).resolve().parent.parent
BANDS_OUT = BACKEND_DIR.parent / "public" / "data" / "liguria_bathymetry_bands.geojson"
ISOBATHS_OUT = BACKEND_DIR.parent / "public" / "data" / "liguria_isobaths.geojson"

WFS_URL = "https://geoservizi.regione.liguria.it/geoserver/M1222/wfs"

# Bbox dell'area operativa (area.ts) in EPSG:3003 (Gauss-Boaga Fuso Ovest,
# proiezione nativa del layer), con margine. Calcolato per interpolazione
# dal bbox dichiarato del layer (vedi commit history) — verificato che
# restituisce le fasce giuste per Levanto-Punta di Montenero.
BBOX_3003 = "1538000,4873000,1569000,4902000,EPSG:3003"

# Bbox di ritaglio in lon/lat (area.ts + margine), per non spedire al
# frontend poligoni che coprono l'intera costa ligure — l'app e' pensata
# per l'uso mobile con connessione scarsa in barca.
CLIP_BOUNDS = box(9.45, 43.98, 9.90, 44.28)

BAND_LABELS = {
    "01": "0-10 m",
    "02": "10-20 m",
    "03": "20-30 m",
    "04": "30-50 m",
    "05": "50-100 m",
    "06": "100-200 m",
    "07": "200-500 m",
    "08": "500-1000 m",
}
# Profondita' del confine INFERIORE di ciascuna fascia (per etichettare le isobate estratte).
BAND_LOWER_DEPTH = {
    "01": 0,
    "02": 10,
    "03": 20,
    "04": 30,
    "05": 50,
    "06": 100,
    "07": 200,
    "08": 500,
}


def fetch_bands() -> dict:
    params = {
        "service": "WFS",
        "version": "1.0.0",
        "request": "GetFeature",
        "typeName": "L3121",
        "outputFormat": "json",
        "srsName": "EPSG:4326",
        "BBOX": BBOX_3003,
    }
    url = f"{WFS_URL}?{urlencode(params)}"
    with urlopen(url, timeout=60) as resp:
        return json.load(resp)


def main() -> None:
    raw = fetch_bands()
    print(f"Scaricate {len(raw['features'])} feature grezze da Regione Liguria")

    band_features = []
    for f in raw["features"]:
        codice = f["properties"].get("codice")
        if codice not in BAND_LABELS:
            continue
        geom = shape(f["geometry"]).intersection(CLIP_BOUNDS)
        if geom.is_empty:
            continue
        band_features.append(
            {
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": {
                    "band_code": codice,
                    "band_label": BAND_LABELS[codice],
                    "lower_depth_m": BAND_LOWER_DEPTH[codice],
                },
            }
        )

    BANDS_OUT.parent.mkdir(parents=True, exist_ok=True)
    BANDS_OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": band_features}), encoding="utf-8"
    )
    print(f"Scritte {len(band_features)} fasce di profondita' su {BANDS_OUT}")

    # Isobate: ogni fascia ha DUE bordi (verso riva e verso il largo). Non si
    # puo' etichettare l'intero contorno di una fascia con un solo valore di
    # profondita', altrimenti il bordo verso il largo (che e' la vera isobata
    # successiva, condivisa con la fascia adiacente piu' profonda) risulta
    # duplicato e mal etichettato — la stessa curva appare due volte con due
    # valori diversi. Per ogni soglia D prendiamo il contorno di "tutto cio'
    # che e' piu' basso di D" e teniamo solo la parte che passa vicino a
    # "tutto cio' che e' piu' profondo o uguale a D" (tolleranza ~22m, i
    # poligoni delle fasce adiacenti non condividono vertici esatti — sono
    # stati digitalizzati singolarmente, non come un'unica partizione
    # topologica). Scartiamo i frammenti piu' corti di ~111m: sono rumore di
    # digitalizzazione, non isobate reali (verificato: le isobate vere sono
    # tutte piu' lunghe di 470m, il rumore e' sempre sotto i 65m).
    # Una stessa fascia (band_code) puo' comparire in piu' feature separate
    # (es. la fascia 0-10m e' spezzata in 11 tratti lungo la costa) — vanno
    # raggruppate PRIMA di unirle, altrimenti un dict per band_code ne perde
    # tutte tranne l'ultima.
    parts_by_band: dict[str, list] = {}
    for feat in band_features:
        parts_by_band.setdefault(feat["properties"]["band_code"], []).append(shape(feat["geometry"]))
    geom_by_band = {code: unary_union(parts) for code, parts in parts_by_band.items()}

    NEIGHBOR_TOLERANCE_DEG = 0.0002  # ~22 m
    MIN_ISOBATH_LENGTH_DEG = 0.001  # ~111 m

    isobath_features = []
    thresholds = sorted(set(BAND_LOWER_DEPTH.values()) - {0})
    for depth in thresholds:
        shallow_geoms = [g for code, g in geom_by_band.items() if BAND_LOWER_DEPTH[code] < depth]
        deep_geoms = [g for code, g in geom_by_band.items() if BAND_LOWER_DEPTH[code] >= depth]
        if not shallow_geoms or not deep_geoms:
            continue
        shallow_boundary = unary_union(shallow_geoms).boundary
        deep_region = unary_union(deep_geoms)
        shared = shallow_boundary.intersection(deep_region.buffer(NEIGHBOR_TOLERANCE_DEG))
        parts = list(shared.geoms) if hasattr(shared, "geoms") else [shared]
        for part in parts:
            if getattr(part, "length", 0) < MIN_ISOBATH_LENGTH_DEG:
                continue
            isobath_features.append(
                {
                    "type": "Feature",
                    "geometry": mapping(part),
                    "properties": {"depth": depth},
                }
            )

    ISOBATHS_OUT.write_text(
        json.dumps({"type": "FeatureCollection", "features": isobath_features}), encoding="utf-8"
    )
    print(f"Scritte {len(isobath_features)} linee isobate reali su {ISOBATHS_OUT}")


if __name__ == "__main__":
    main()
