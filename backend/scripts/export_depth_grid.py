"""Esporta la griglia batimetrica fine come file statico per il frontend:
serve a leggere la profondita' nel punto in cui l'utente tocca la mappa
("+ Aggiungi punto") senza chiamare il backend (che su Render free puo'
essere addormentato) e senza chiederla a mano.

Formato: Int16 little-endian, decimetri (profondita' positiva in mare);
-32768 = terra. Riga per riga dal nord, come amp_bathy_fine.tif.
Uso: dalla cartella backend/:  .venv/Scripts/python.exe scripts/export_depth_grid.py
"""

import json
from pathlib import Path

import numpy as np
import rasterio

BACKEND_DIR = Path(__file__).resolve().parent.parent
SRC = BACKEND_DIR / "data" / "bathymetry" / "amp_bathy_fine.tif"
OUT_DIR = BACKEND_DIR.parent / "public" / "data"


def main() -> None:
    with rasterio.open(SRC) as ds:
        elev = ds.read(1)
        b = ds.bounds
    depth_dm = np.where(elev < 0, np.round(-elev * 10), -32768).clip(-32768, 32767).astype("<i2")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "depth_grid.bin").write_bytes(depth_dm.tobytes())
    meta = {"width": int(elev.shape[1]), "height": int(elev.shape[0]), "bounds": [b.left, b.bottom, b.right, b.top]}
    (OUT_DIR / "depth_grid.json").write_text(json.dumps(meta), encoding="utf-8")
    print(f"depth_grid.bin {depth_dm.nbytes/1e6:.2f} MB, {meta}")


if __name__ == "__main__":
    main()
