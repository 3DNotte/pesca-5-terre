"""Divide il mare dell'area in SETTORI (celle ~500 m) per i feedback degli utenti.

L'utente cerchia una zona sulla mappa e l'app la traduce in id di settore:
dato sommabile e anonimo (niente coordinate precise dell'utente), utile per
capire dove il modello sbaglia. Solo mare entro ~3,5 km dalla riva: oltre
non e' l'area di pesca dell'app.

Uso: dalla cartella backend/:  .venv/Scripts/python.exe scripts/build_sectors.py
"""

import json
from pathlib import Path

import numpy as np
import rasterio
from scipy.ndimage import distance_transform_edt

BACKEND_DIR = Path(__file__).resolve().parent.parent
SRC = BACKEND_DIR / "data" / "bathymetry" / "amp_bathy_fine.tif"
OUT = BACKEND_DIR.parent / "public" / "data" / "sectors.geojson"

CELL_LON = 0.006  # ~470 m a questa latitudine
CELL_LAT = 0.0045  # ~500 m
MAX_COAST_DIST_M = 3500
MIN_SEA_FRACTION = 0.25

# Riferimenti per dare un nome leggibile alla zona di ogni settore (lon, nome).
PLACES = [
    (9.645, "Punta Mesco"),
    (9.6605, "Monterosso"),
    (9.6835, "Vernazza"),
    (9.7095, "Corniglia"),
    (9.7295, "Manarola"),
    (9.7385, "Riomaggiore"),
]


def main() -> None:
    with rasterio.open(SRC) as ds:
        elev = ds.read(1)
        b = ds.bounds
    rows, cols = elev.shape
    sea = elev < 0
    px_m = (b.right - b.left) * 111_320 * np.cos(np.radians(44.13)) / cols
    dist_m = distance_transform_edt(sea) * px_m

    lon = b.left + (np.arange(cols) + 0.5) * (b.right - b.left) / cols
    lat = b.top - (np.arange(rows) + 0.5) * (b.top - b.bottom) / rows
    LON, LAT = np.meshgrid(lon, lat)
    col_idx = np.floor((LON - b.left) / CELL_LON).astype(int)
    row_idx = np.floor((b.top - LAT) / CELL_LAT).astype(int)

    features = []
    for r in range(row_idx.max() + 1):
        for c in range(col_idx.max() + 1):
            m = (row_idx == r) & (col_idx == c)
            if not m.any():
                continue
            frac = sea[m].mean()
            if frac < MIN_SEA_FRACTION:
                continue
            if dist_m[m & sea].size == 0 or dist_m[m & sea].min() > MAX_COAST_DIST_M:
                continue
            w, n = b.left + c * CELL_LON, b.top - r * CELL_LAT
            e, s = w + CELL_LON, n - CELL_LAT
            cx = (w + e) / 2
            place = min(PLACES, key=lambda p: abs(p[0] - cx))[1]
            band = "riva" if dist_m[m & sea].min() < 250 else "sottocosta" if dist_m[m & sea].min() < 1200 else "largo"
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Polygon", "coordinates": [[[w, n], [e, n], [e, s], [w, s], [w, n]]]},
                    "properties": {"id": f"r{r}c{c}", "zone": place, "band": band},
                }
            )
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    print(f"{len(features)} settori scritti su {OUT} ({OUT.stat().st_size/1e3:.0f} KB)")


if __name__ == "__main__":
    main()
