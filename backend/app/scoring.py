"""Motore di scoring — sezione 6 del progetto.

score_cella(specie, t) =
    w1 * score_morfologia(cella) * affinita_struttura(specie)
  + w2 * score_stagionale(specie, mese(t))
  + w3 * score_orario(specie, ora(t))
  + w4 * (1 - pressione_traffico(cella, t)) * sensibilita_disturbo(specie)
  + w5 * score_meteo_mare(cella, t)   # placeholder neutro finche' Step 5 non e' integrato

La regola chiave (sezione 6): quando pressione alta + specie sensibile, il
punteggio migliore si sposta verso celle piu' al largo o schermate, non si
abbassa uniformemente. Questo emerge naturalmente dal termine w4, che varia
per cella in base alla pressione locale — non serve un caso speciale.
"""

from datetime import datetime

import numpy as np

from .config import WEIGHTS
from .meteo import MeteoUnavailable, get_conditions, meteo_score_grid
from .morphology import MorphologyGrid, load_morphology, morphology_score
from .species import SpeciesProfile
from .traffic import traffic_pressure


def compute_score_grid(species: SpeciesProfile, dt: datetime, weights: dict | None = None) -> dict:
    grid: MorphologyGrid = load_morphology()
    w = weights if weights is not None else WEIGHTS

    morfologia = morphology_score(grid) * species.structure_affinity
    stagionale = np.full(grid.shape, species.seasonal_score(dt.month), dtype=np.float32)
    orario = np.full(grid.shape, species.hourly_score(dt.hour), dtype=np.float32)
    pressione = traffic_pressure(grid, dt)
    traffico_term = (1 - pressione) * species.disturbance_sensitivity

    try:
        conditions = get_conditions(dt)
        meteo = meteo_score_grid(grid, conditions)
        meteo_available = True
    except MeteoUnavailable:
        # Meteo non raggiungibile o fuori dalla finestra di previsione: score
        # neutro esplicitamente segnalato come tale (mai spacciato per dato reale).
        conditions = None
        meteo = np.full(grid.shape, 0.5, dtype=np.float32)
        meteo_available = False

    total_weight = sum(w.values())
    raw = (
        w["w1_morfologia"] * morfologia
        + w["w2_stagionale"] * stagionale
        + w["w3_orario"] * orario
        + w["w4_traffico"] * traffico_term
        + w["w5_meteo_mare"] * meteo
    )
    score_0_100 = np.clip((raw / max(total_weight, 1e-6)) * 100, 0, 100)

    # Terra: nessun punteggio (non e' mare).
    score_0_100 = np.where(grid.sea_mask, score_0_100, np.nan)

    return {
        "score": score_0_100,
        "transform": grid.transform,
        "crs": grid.crs,
        "shape": grid.shape,
        "meteo_available": meteo_available,
        "conditions": conditions,
        "components": {
            "morfologia": morfologia,
            "stagionale": stagionale,
            "orario": orario,
            "pressione_traffico": pressione,
            "meteo_mare": meteo,
        },
    }


def classify_score(value: float) -> str:
    if np.isnan(value):
        return "n/d"
    if value >= 70:
        return "molto probabile"
    if value >= 50:
        return "buono"
    if value >= 30:
        return "da provare"
    return "sconsigliato"
