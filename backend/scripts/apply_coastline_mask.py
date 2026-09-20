"""Taglia la griglia batimetrica fine lungo la LINEA DI RIVA REALE.

Problema: amp_bathy_fine.tif decide "mare/terra" con EMODnet (~115 m/pixel),
che sulla costa a picco delle 5 Terre mette "mare" anche sopra la scogliera.
Di conseguenza la mappa dei punteggi arrivava fino sulla roccia e le zone
"buone" sembravano stare sulla scogliera.

Qui si usa la linea di riva ufficiale Regione Liguria (coastline_raw.geojson,
vedi fetch_coastline.py): si rasterizza sulla griglia, si etichettano le
regioni separate dalla linea e si tiene come mare solo quella collegata al
mare aperto. Il resto diventa terra.

Idempotente: si puo' rilanciare dopo build_fine_bathymetry.py.
Uso: dalla cartella backend/:  .venv/Scripts/python.exe scripts/apply_coastline_mask.py
"""

import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from scipy.ndimage import label
from shapely.geometry import LineString

BACKEND_DIR = Path(__file__).resolve().parent.parent
TIF = BACKEND_DIR / "data" / "bathymetry" / "amp_bathy_fine.tif"
COAST = BACKEND_DIR / "data" / "bathymetry" / "coastline_raw.geojson"

OPEN_SEA_POINTS = [(9.60, 44.10), (9.66, 44.08), (9.72, 44.07)]  # punti sicuramente in mare aperto
LAND_ELEVATION_M = 5.0


def main() -> None:
    with rasterio.open(TIF) as ds:
        elev = ds.read(1)
        transform = ds.transform
        profile = ds.profile
    with open(COAST, encoding="utf-8") as f:
        feats = json.load(f)["features"]
    lines = [LineString(ft["geometry"]["coordinates"]) for ft in feats]

    coast = rasterize(
        [(ln, 1) for ln in lines], out_shape=elev.shape, transform=transform, all_touched=True, dtype="uint8"
    ).astype(bool)
    regions, n = label(~coast)  # connettivita' a 4: la linea (8-connessa) fa da barriera
    ref_labels = set()
    for lon, lat in OPEN_SEA_POINTS:
        r, c = ds_index(transform, lon, lat)
        if regions[r, c] != 0:
            ref_labels.add(int(regions[r, c]))
    true_sea = np.isin(regions, list(ref_labels))

    was_sea = elev < 0
    removed = was_sea & ~true_sea
    print(f"regioni: {n}, riferimento mare: {ref_labels}")
    print(f"celle mare prima: {was_sea.sum()}, tolte perche' oltre la riva reale: {removed.sum()} ({100*removed.sum()/was_sea.sum():.1f}%)")
    if removed.sum() > 0.35 * was_sea.sum():
        raise SystemExit("Troppe celle tolte: linea di riva con buchi? Non scrivo.")

    out = np.where(was_sea & true_sea, elev, LAND_ELEVATION_M).astype("float32")
    with rasterio.open(TIF, "w", **profile) as dst:
        dst.write(out, 1)
    print("griglia aggiornata")


def ds_index(transform, lon, lat):
    col, row = ~transform * (lon, lat)
    return int(row), int(col)


if __name__ == "__main__":
    main()
