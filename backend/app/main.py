from datetime import datetime, timedelta

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .config import WEIGHTS
from .meteo import MeteoUnavailable, get_conditions
from .morphology import MorphologyGrid, load_morphology
from .scoring import classify_score, compute_score_grid
from .species import SpeciesProfile, load_species_profiles
from .traffic import ferry_passages_in_window

app = FastAPI(title="Pesca 5 Terre — motore di scoring")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    # In piu' di "localhost": qualunque IP di rete locale (per aprire l'app dal
    # cellulare sulla stessa Wi-Fi/LAN del PC), e il dominio di produzione su
    # Cloudflare Workers (pesca-5-terre.tuturial.workers.dev).
    allow_origin_regex=r"http://(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):5173|https://pesca-5-terre\.tuturial\.workers\.dev",
    allow_methods=["GET"],
    allow_headers=["*"],
)

FERRY_STOP_LABELS_IT = {
    "levanto": "Levanto",
    "monterosso": "Monterosso al Mare",
    "vernazza": "Vernazza",
    "manarola": "Manarola",
    "riomaggiore": "Riomaggiore",
}


def _grid_bounds(grid: MorphologyGrid) -> list[float]:
    return [
        grid.transform.c,
        grid.transform.f + grid.transform.e * grid.shape[0],
        grid.transform.c + grid.transform.a * grid.shape[1],
        grid.transform.f,
    ]


def _top_spots(score: np.ndarray, grid: MorphologyGrid, top_n: int) -> list[dict]:
    finite_mask = np.isfinite(score)
    flat_idx = np.argsort(np.where(finite_mask, score, -np.inf).ravel())[::-1][:top_n]
    rows, cols = np.unravel_index(flat_idx, score.shape)
    spots = []
    for r, c in zip(rows, cols):
        value = float(score[r, c])
        if not np.isfinite(value):
            continue
        lon, lat = grid.transform * (c + 0.5, r + 0.5)
        spots.append(
            {
                "lon": lon,
                "lat": lat,
                "score": round(value, 1),
                "classification": classify_score(value),
                "depth_m": round(float(-grid.elevation[r, c]), 1),
            }
        )
    return spots


def _grid_payload(score: np.ndarray, grid: MorphologyGrid) -> dict:
    finite_mask = np.isfinite(score)
    return {
        "width": grid.shape[1],
        "height": grid.shape[0],
        "bounds": _grid_bounds(grid),
        "values": np.where(finite_mask, np.round(score, 1), None).tolist(),
    }


@app.get("/api/species")
def list_species():
    profiles = load_species_profiles()
    return [
        {
            "key": p.key,
            "label": p.label,
            "disturbance_sensitivity": p.disturbance_sensitivity,
            "structure_affinity": p.structure_affinity,
            "notes": p.notes,
        }
        for p in profiles.values()
    ]


@app.get("/api/weights")
def get_weights():
    """Pesi di default della formula (sezione 6), per inizializzare l'UI di tuning."""
    return WEIGHTS


@app.get("/api/score")
def get_score(
    species: str = Query(..., description="Chiave specie, es. dentice"),
    at: str | None = Query(None, description="ISO datetime, default ora corrente"),
    top_n: int = Query(5, ge=1, le=20),
    w1_morfologia: float | None = Query(None, ge=0, le=1),
    w2_stagionale: float | None = Query(None, ge=0, le=1),
    w3_orario: float | None = Query(None, ge=0, le=1),
    w4_traffico: float | None = Query(None, ge=0, le=1),
    w5_meteo_mare: float | None = Query(None, ge=0, le=1),
):
    profiles = load_species_profiles()
    if species not in profiles:
        raise HTTPException(404, f"Specie sconosciuta: {species}. Disponibili: {list(profiles)}")

    overrides = {
        "w1_morfologia": w1_morfologia,
        "w2_stagionale": w2_stagionale,
        "w3_orario": w3_orario,
        "w4_traffico": w4_traffico,
        "w5_meteo_mare": w5_meteo_mare,
    }
    weights = {key: (val if val is not None else WEIGHTS[key]) for key, val in overrides.items()}

    dt = datetime.fromisoformat(at) if at else datetime.now()
    result = compute_score_grid(profiles[species], dt, weights)
    grid = load_morphology()
    score = result["score"]

    return {
        "species": species,
        "datetime": dt.isoformat(),
        "weights": weights,
        "meteo": {"available": result["meteo_available"], "conditions": result["conditions"]},
        "grid": _grid_payload(score, grid),
        "top_spots": _top_spots(score, grid, top_n),
    }


def _describe_spot(
    profile: SpeciesProfile,
    grid: MorphologyGrid,
    result: dict,
    row: int,
    col: int,
    dt: datetime,
) -> str:
    depth = -grid.elevation[row, col]
    slope = float(grid.slope_score[row, col])
    shoal = float(grid.shoal_score[row, col])
    traffic = float(result["components"]["pressione_traffico"][row, col])
    meteo_mare = float(result["components"]["meteo_mare"][row, col])
    seasonal = profile.seasonal_score(dt.month)
    hourly = profile.hourly_score(dt.hour)

    if shoal > 0.5:
        morph_desc = "una secca"
    elif slope > 0.5:
        morph_desc = "una scarpata pronunciata"
    else:
        morph_desc = "un fondale strutturato"

    if seasonal > 0.7:
        season_desc = "in piena stagione"
    elif seasonal > 0.4:
        season_desc = "in stagione intermedia"
    else:
        season_desc = "fuori dal periodo migliore per la specie"

    hour_desc = "in una fascia oraria ottimale" if hourly > 0.7 else "in una fascia oraria discreta"

    if traffic < 0.2:
        traffic_desc = "traffico turistico atteso molto basso"
    elif traffic < 0.5:
        traffic_desc = "traffico turistico moderato"
    else:
        traffic_desc = "possibile traffico elevato: meglio valutare zone piu' riparate"

    sea_desc = ""
    if result.get("meteo_available") and result.get("conditions"):
        cond = result["conditions"]
        wave_h = cond["wave_height_m"]
        if meteo_mare > 0.75:
            sea_desc = f" Mare {'poco mosso' if wave_h < 0.5 else 'sostenuto ma zona riparata'} ({wave_h:.1f}m)."
        elif meteo_mare > 0.4:
            sea_desc = f" Onda di {wave_h:.1f}m, zona parzialmente esposta."
        else:
            sea_desc = f" Attenzione: onda di {wave_h:.1f}m proprio sull'esposizione di questa zona."

    return (
        f"{profile.label} {season_desc}, {hour_desc}: {morph_desc} a circa "
        f"{depth:.0f}m di profondita', {traffic_desc}.{sea_desc}"
    )


@app.get("/api/wizard")
def wizard(
    start: str = Query(..., description="Inizio finestra, ISO datetime"),
    end: str = Query(..., description="Fine finestra, ISO datetime"),
    species: list[str] = Query(default=[], description="Specie da valutare; vuoto = tutte (sorprendimi)"),
    bottom_fishing: bool = Query(True, description="Puoi presentare l'esca vicino al fondo?"),
    top_n: int = Query(3, ge=1, le=5),
):
    profiles = load_species_profiles()
    dt_start = datetime.fromisoformat(start)
    dt_end = datetime.fromisoformat(end)
    if dt_end <= dt_start:
        raise HTTPException(400, "L'orario di fine deve essere successivo all'inizio")

    candidates = species if species else list(profiles.keys())
    for key in candidates:
        if key not in profiles:
            raise HTTPException(404, f"Specie sconosciuta: {key}. Disponibili: {list(profiles)}")

    span_seconds = (dt_end - dt_start).total_seconds()
    n_samples = 4 if span_seconds > 3600 else 2
    sample_times = [
        dt_start + timedelta(seconds=span_seconds * i / (n_samples - 1)) for i in range(n_samples)
    ]

    weights = dict(WEIGHTS)
    if not bottom_fishing:
        # Meno rilevante la morfologia profonda se non si puo' lavorare vicino al fondo:
        # si sposta il peso implicito verso stagionalita'/orario/traffico.
        weights["w1_morfologia"] *= 0.4

    grid = load_morphology()

    best_score = -np.inf
    best: tuple[str, datetime, dict] | None = None
    for species_key in candidates:
        profile = profiles[species_key]
        for dt in sample_times:
            result = compute_score_grid(profile, dt, weights)
            score = result["score"]
            local_max = float(np.nanmax(score)) if np.isfinite(score).any() else -np.inf
            if local_max > best_score:
                best_score = local_max
                best = (species_key, dt, result)

    if best is None:
        raise HTTPException(500, "Impossibile calcolare un consiglio per la finestra scelta")

    species_key, best_dt, result = best
    profile = profiles[species_key]
    score = result["score"]
    top_spots = _top_spots(score, grid, top_n)

    finite_mask = np.isfinite(score)
    flat_idx = np.argsort(np.where(finite_mask, score, -np.inf).ravel())[::-1][:1]
    row0, col0 = np.unravel_index(flat_idx[0], score.shape)
    motivation = _describe_spot(profile, grid, result, row0, col0, best_dt)

    passages = ferry_passages_in_window(dt_start, dt_end)
    ferry_warnings = [
        f"Passaggio traghetto a {FERRY_STOP_LABELS_IT.get(p['stop'], p['stop'])} alle {p['time']}, "
        f"dentro la tua finestra."
        for p in passages
    ]

    return {
        "species": species_key,
        "species_label": profile.label,
        "datetime": best_dt.isoformat(),
        "time_window": {"start": dt_start.isoformat(), "end": dt_end.isoformat()},
        "bottom_fishing": bottom_fishing,
        "weights": weights,
        "meteo": {"available": result["meteo_available"], "conditions": result["conditions"]},
        "motivation": motivation,
        "ferry_warnings": ferry_warnings,
        "grid": _grid_payload(score, grid),
        "top_spots": top_spots,
    }


@app.get("/api/meteo")
def meteo(at: str | None = Query(None, description="ISO datetime, default ora corrente")):
    """Condizioni meteo-mare attuali/previste, indipendenti dal calcolo dello score
    — utile per un pannello informativo in mappa (sezione 5e del progetto)."""
    dt = datetime.fromisoformat(at) if at else datetime.now()
    try:
        return {"available": True, "conditions": get_conditions(dt)}
    except MeteoUnavailable as exc:
        return {"available": False, "conditions": None, "error": str(exc)}


@app.get("/api/health")
def health():
    return {"status": "ok"}
