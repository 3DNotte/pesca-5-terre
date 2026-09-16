"""Genera le isobate (linee di profondita') come GeoJSON statico per il frontend.

Usa i dati batimetrici reali gia' scaricati da EMODnet (stessa fonte del layer
raster). Verificato due volte:
1. I VALORI di profondita' coincidono con l'API ufficiale EMODnet al metro (in
   un caso con un rilievo IIM reale).
2. Non esiste dettaglio nascosto da sfruttare: una richiesta alla stessa area
   a risoluzione 4x piu' fine ha restituito solo pixel duplicati (nearest-
   neighbor upsampling), confermando che ~115m/pixel e' il vero tetto di
   risoluzione del prodotto gratuito "mean" per questa zona.

NON viene piu' applicato smoothing (Chaikin corner-cutting, rimosso): sposta
la linea dalla posizione tracciata dai dati per un risultato piu' "pulito"
visivamente, ma la priorita' qui e' la fedelta' al dato, non l'estetica —
le linee restano "a scalini" perche' e' cosi' che il dato a 115m si traduce
davvero sul terreno.

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\generate_isobaths.py
Rigenera public/data/isobaths.geojson nel progetto frontend. Da rilanciare
solo se cambia l'area (area.ts) o si aggiorna il file .tif sorgente.
"""

import json
from pathlib import Path

import contourpy
import numpy as np
import rasterio

BACKEND_DIR = Path(__file__).resolve().parent.parent
TIF_PATH = BACKEND_DIR / "data" / "bathymetry" / "amp_bathy.tif"
OUT_PATH = BACKEND_DIR.parent / "public" / "data" / "isobaths.geojson"

# Profondita' (m) per cui tracciare una linea. NIENTE sotto i 20m (vedi nota
# sopra: la curva "2m" cadeva a oltre 400m dal vero bordo del porto di
# Riomaggiore). Piu' dense tra 20 e 150m, la fascia rilevante per la traina
# costiera; piu' rade oltre, solo per contesto.
LEVELS = [20, 25, 30, 40, 50, 60, 75, 80, 90, 100, 125, 150, 200, 300, 500]


def main() -> None:
    with rasterio.open(TIF_PATH) as ds:
        elevation = ds.read(1).astype(float)
        transform = ds.transform
        rows, cols = ds.shape

    xs = transform.c + (np.arange(cols) + 0.5) * transform.a
    ys = transform.f + (np.arange(rows) + 0.5) * transform.e  # decrescente (nord->sud)

    # contourpy vuole coordinate monotone crescenti: capovolgo l'asse y.
    ys_inc = ys[::-1]
    elevation_inc = elevation[::-1, :]

    # Sul mare tracciamo la profondita' (positiva); su terra NaN cosi' le
    # isobate non attraversano la costa.
    depth = np.where(elevation_inc < 0, -elevation_inc, np.nan)

    gen = contourpy.contour_generator(x=xs, y=ys_inc, z=depth, line_type="Separate")

    features = []
    for level in LEVELS:
        lines = gen.lines(level)
        for line in lines:
            if len(line) < 2:
                continue
            features.append(
                {
                    "type": "Feature",
                    "properties": {"depth": level},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[round(float(x), 6), round(float(y), 6)] for x, y in line],
                    },
                }
            )

    geojson = {"type": "FeatureCollection", "features": features}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(geojson), encoding="utf-8")
    print(f"Scritte {len(features)} linee isobate su {OUT_PATH}")


if __name__ == "__main__":
    main()
