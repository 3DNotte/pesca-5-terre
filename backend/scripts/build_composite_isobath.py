"""Costruisce una linea isobata CONTINUA lungo tutta la costa per profondita'
che il rilievo di dettaglio Regione Liguria (2012, multibeam 1x1m) copre solo
a chiazze: dato reale dove c'e', completato con il contorno EMODnet (meno
preciso, ~115m/pixel) SOLO nei tratti dove il dato reale non arriva.

Ogni segmento porta una proprieta' "source" ("liguria" o "emodnet") cosi' il
frontend puo' disegnare il tratto vero solido e quello stimato tratteggiato,
esattamente come gia' fa per gli altri layer — nessuna perdita di onesta'
sulla precisione, ma una linea che copre l'intera costa invece di sparire a
meta'.

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\build_composite_isobath.py 40
    (il livello in metri come argomento; default 40 se omesso)
"""

import json
import sys
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

BACKEND_DIR = Path(__file__).resolve().parent.parent
LIGURIA_PATH = BACKEND_DIR.parent / "public" / "data" / "liguria_isobaths.geojson"
EMODNET_PATH = BACKEND_DIR.parent / "public" / "data" / "isobaths.geojson"

# Quanto "corridoio" attorno al dato reale consideriamo gia' coperto (gradi).
# ~250m: abbastanza da non lasciare un fastidioso doppio tratto/microscuci-
# tura al bordo, non cosi' tanto da mangiare tratti EMODnet lontani dal dato
# vero.
COVERED_BUFFER_DEG = 0.0025


def main() -> None:
    level = int(sys.argv[1]) if len(sys.argv) > 1 else 40

    liguria = json.loads(LIGURIA_PATH.read_text(encoding="utf-8"))
    emodnet = json.loads(EMODNET_PATH.read_text(encoding="utf-8"))

    real_feats = [f for f in liguria["features"] if f["properties"]["depth"] == level]
    est_feats = [f for f in emodnet["features"] if f["properties"]["depth"] == level]
    if not est_feats:
        print(f"Nessun dato EMODnet a {level}m — impossibile completare la costa.")
        return
    if not real_feats:
        print(f"Nessun dato reale Regione Liguria a {level}m — la linea sara' interamente EMODnet (tratteggiata).")

    est_geoms = unary_union([shape(f["geometry"]) for f in est_feats])
    if real_feats:
        real_geoms = [shape(f["geometry"]) for f in real_feats]
        covered = unary_union(real_geoms).buffer(COVERED_BUFFER_DEG)
        gap_geom = est_geoms.difference(covered)
    else:
        gap_geom = est_geoms

    gap_parts = list(gap_geom.geoms) if hasattr(gap_geom, "geoms") else [gap_geom]
    MIN_GAP_LEN_DEG = 0.001  # scarta frammenti minuscoli residui del taglio (~100m)
    gap_features = [
        {
            "type": "Feature",
            "geometry": mapping(part),
            "properties": {"depth": level, "source": "emodnet"},
        }
        for part in gap_parts
        if getattr(part, "length", 0) >= MIN_GAP_LEN_DEG
    ]

    # Rimuoviamo le vecchie feature reali a questo livello (le riscriviamo con
    # la proprieta' "source" per coerenza) e quelle stimate eventualmente gia'
    # presenti da un run precedente dello script.
    liguria["features"] = [
        f
        for f in liguria["features"]
        if not (f["properties"]["depth"] == level)
    ]
    new_real_features = [
        {
            "type": "Feature",
            "geometry": f["geometry"],
            "properties": {"depth": level, "source": "liguria"},
        }
        for f in real_feats
    ]
    liguria["features"].extend(new_real_features)
    liguria["features"].extend(gap_features)

    LIGURIA_PATH.write_text(json.dumps(liguria), encoding="utf-8")
    print(
        f"{level}m: {len(new_real_features)} tratti reali (Regione Liguria) + "
        f"{len(gap_features)} tratti di completamento (EMODnet) scritti su {LIGURIA_PATH}"
    )


if __name__ == "__main__":
    main()
