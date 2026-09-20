"""Motore di scoring — sezione 6 del progetto.

score_cella(specie, t) = 100 * SPAZIALE(cella, specie) * (0.55 + 0.45 * TEMPO(cella, t))

  SPAZIALE = morfologia (pendenza/secche) * affinita_struttura * fit di
             profondita', piu' un termine "sotto costa" (fascia entro ~600 m
             dalla riva, dove la costa rocciosa cade a picco) e un piccolo
             favore per l'arco Punta Mesco - Riomaggiore.
  TEMPO    = media pesata (w2..w5) di stagionale, orario, traffico, meteo/mare.

Perche' moltiplicativo e non una somma pesata (versione precedente): stagione,
ora e meteo sono UGUALI su tutta la mappa, e sommati valevano ~65% del
punteggio. Ogni cella partiva da ~50/100 e con orari favorevoli l'intero
mare superava la soglia "rosso". Cosi' invece il POSTO decide dove e' il
rosso e il momento lo alza o lo abbassa (fino a -45%) senza uniformarlo.

Il peso w1 non entra piu' come somma: il contributo del luogo e' il fattore
principale. La regola chiave (sezione 6): quando pressione alta + specie sensibile, il
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


def depth_fit_score(elevation: np.ndarray, depth_range_m: tuple[float, float] | None) -> np.ndarray:
    """1.0 dentro il range di profondita' reale della specie, sfuma a 0 fuori
    (transizione morbida, non un taglio netto — una secca a 95m per una specie
    tipica fino a 90m non e' irreale come una a 200m). None = nessun vincolo
    (pelagici puri: la loro posizione dipende da rotta/corrente, non dal
    fondale, quindi non va scartata nessuna cella per profondita')."""
    if depth_range_m is None:
        return np.ones_like(elevation, dtype=np.float32)
    depth_m = -elevation  # elevation negativa in mare
    lo, hi = depth_range_m
    margin = max((hi - lo) * 0.4, 10.0)
    fit = np.ones_like(depth_m, dtype=np.float32)
    fit = np.where(depth_m < lo, np.clip(1 - (lo - depth_m) / margin, 0, 1), fit)
    fit = np.where(depth_m > hi, np.clip(1 - (depth_m - hi) / margin, 0, 1), fit)
    return fit.astype(np.float32)


COAST_PEAK_M = 100  # distanza dalla riva a cui il termine sottocosta e' massimo
COAST_BAND_M = 600  # fascia "sotto costa": qui il fondale roccioso scende subito
MESCO_LON, RIOMAGGIORE_LON = 9.645, 9.745  # arco favorito (esperienza diretta dell'utente)
ZONE_BOOST_MAX = 0.15  # +15% al massimo, sfuma ai bordi: un favore, non un dogma
ZONE_COAST_REACH_M = 1500


def shallow_gate(grid: MorphologyGrid) -> np.ndarray:
    """0..1: fondali sotto ~3 m non sono pescabili/raggiungibili in barca
    (frangenti, scogli a filo d'acqua). Sale da 0 a 1 tra 1 e 4 m. Serve a
    non far "accendere" la fascia a filo riva, che graficamente sembra
    la scogliera stessa."""
    depth = np.where(grid.sea_mask, -grid.elevation, 0.0)
    return np.clip((depth - 1.0) / 3.0, 0, 1).astype(np.float32)


def coast_term(grid: MorphologyGrid, depth_fit: np.ndarray) -> np.ndarray:
    """0..1: massimo a ~COAST_PEAK_M dalla riva e cala fino a 0 a COAST_BAND_M. Premia il
    sottocosta (3-40 m) dove c'e' anche pendenza o rilievo; e' pesato dal
    fit di profondita' della specie."""
    # Sale da 0 a riva fino al massimo a COAST_PEAK_M e poi cala fino a COAST_BAND_M:
    # il massimo a filo riva sulla mappa sembrava "sulla scogliera".
    d = grid.distance_to_coast_m
    near = np.clip(d / COAST_PEAK_M, 0, 1) * np.clip(1 - (d - COAST_PEAK_M) / (COAST_BAND_M - COAST_PEAK_M), 0, 1)
    structure = np.clip(0.5 + 0.5 * np.maximum(grid.slope_score, grid.shoal_score), 0, 1)
    return (near * structure * depth_fit).astype(np.float32)


def zone_boost(grid: MorphologyGrid) -> np.ndarray:
    """1.0..(1+ZONE_BOOST_MAX): arco costiero Punta Mesco - Riomaggiore."""
    cols = np.arange(grid.shape[1])
    lon = grid.transform.c + (cols + 0.5) * grid.transform.a
    ramp = 0.1  # gradi: sfumatura ai due estremi
    lon_w = np.clip((lon - (MESCO_LON - ramp / 2)) / ramp, 0, 1) * np.clip(((RIOMAGGIORE_LON + ramp / 2) - lon) / ramp, 0, 1)
    reach = np.exp(-grid.distance_to_coast_m / ZONE_COAST_REACH_M)
    return (1 + ZONE_BOOST_MAX * lon_w[None, :] * reach).astype(np.float32)


_SPATIAL_CACHE: dict[str, np.ndarray] = {}


def _spatial_term(species: SpeciesProfile) -> np.ndarray:
    """Termine spaziale (0..1) per specie: non dipende dall'orario, quindi si
    calcola una volta sola (il wizard valuta molte specie x orari)."""
    cached = _SPATIAL_CACHE.get(species.key)
    if cached is not None:
        return cached
    grid = load_morphology()
    depth_fit = depth_fit_score(grid.elevation, species.depth_range_m)
    morf_raw = morphology_score(grid)  # 0..1, si normalizza sotto
    morf_n = np.clip(morf_raw / 0.70, 0, 1) ** 0.8

    if species.depth_range_m is None:
        # Pelagici: seguono scarpate/fronti piu' che il fondo sotto costa;
        # base moderata, il rilievo la modula (mai zero: sono mobili).
        spaziale = 0.08 + 0.60 * morf_n**1.5
    else:
        aff = 0.6 + 0.4 * species.structure_affinity  # ammorbidita: l'affinita' non deve annullare il posto
        spaziale = np.clip(
            0.60 * morf_n * aff * depth_fit + 0.40 * coast_term(grid, depth_fit) * aff,
            0,
            1,
        )
    result = np.clip(spaziale * zone_boost(grid) * shallow_gate(grid), 0, 1).astype(np.float32)
    _SPATIAL_CACHE[species.key] = result
    return result


_SHARED_CACHE: dict[tuple[str, str], np.ndarray] = {}


def _shared(kind: str, dt: datetime, compute) -> np.ndarray:
    """Traffico e meteo dipendono dall'ora ma NON dalla specie: nel wizard
    (tutte le specie x piu' orari) si riusano invece di ricalcolarli."""
    key = (kind, dt.strftime("%Y%m%d%H%M"))
    hit = _SHARED_CACHE.get(key)
    if hit is None:
        if len(_SHARED_CACHE) > 64:
            _SHARED_CACHE.clear()
        hit = _SHARED_CACHE[key] = compute()
    return hit


def compute_score_grid(species: SpeciesProfile, dt: datetime, weights: dict | None = None) -> dict:
    grid: MorphologyGrid = load_morphology()
    w = weights if weights is not None else WEIGHTS

    morfologia = _spatial_term(species)

    stagionale = np.full(grid.shape, species.seasonal_score(dt.month), dtype=np.float32)
    orario = np.full(grid.shape, species.hourly_score(dt.hour), dtype=np.float32)
    pressione = _shared("traffic", dt, lambda: traffic_pressure(grid, dt))
    traffico_term = (1 - pressione) * species.disturbance_sensitivity

    try:
        conditions = get_conditions(dt)
        meteo = _shared("meteo", dt, lambda: meteo_score_grid(grid, conditions))
        meteo_available = True
    except MeteoUnavailable:
        # Meteo non raggiungibile o fuori dalla finestra di previsione: score
        # neutro esplicitamente segnalato come tale (mai spacciato per dato reale).
        conditions = None
        meteo = np.full(grid.shape, 0.5, dtype=np.float32)
        meteo_available = False

    time_weights = {k: w[k] for k in ("w2_stagionale", "w3_orario", "w4_traffico", "w5_meteo_mare")}
    total_weight = sum(time_weights.values())
    tempo = (
        time_weights["w2_stagionale"] * stagionale
        + time_weights["w3_orario"] * orario
        + time_weights["w4_traffico"] * traffico_term
        + time_weights["w5_meteo_mare"] * meteo
    ) / max(total_weight, 1e-6)
    score_0_100 = np.clip(100 * morfologia * (0.55 + 0.45 * tempo), 0, 100)

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
    # Soglie calibrate su feedback diretto dell'utente (esperienza reale in
    # barca sulla costiera Punta Mesco-Punta di Montenero): erano piu' severe
    # (70/50/30), poi ritarate 55/40/25 quando la formula e' passata da somma a prodotto
    # (il posto decide, il momento modula): il rosso e' ora selettivo, ~1-3% del mare. Qui cambia solo l'ETICHETTA associata a un punteggio, non il
    # punteggio numerico stesso, che resta calcolato come prima.
    if np.isnan(value):
        return "n/d"
    if value >= 55:
        return "molto probabile"
    if value >= 40:
        return "buono"
    if value >= 25:
        return "da provare"
    return "sconsigliato"
