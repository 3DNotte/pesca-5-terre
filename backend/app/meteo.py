"""Meteo/mare in tempo reale — sezione 5e del progetto.

Vento e stato del mare da Open-Meteo (gratuito, nessuna chiave richiesta).
Corrente superficiale: modello SMOC di Meteo-France via Open-Meteo (~8 km,
oraria). Stima a griglia larga, NON una misura: sotto costa e' indicativa.
Upgrade previsto: Copernicus Marine Med (~4 km, richiede account) e/o
radar HF CNR-ISMAR se copre l'area.

Il dato modula lo score morfologico, non lo sovrascrive: mare mosso da una
direzione penalizza le celle ESPOSTE a quella direzione, non tutta l'area
allo stesso modo — vedi score_meteo_mare() in scoring.py.
"""

import json
from datetime import datetime
from functools import lru_cache
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np

from .config import AREA_CENTER_LAT, AREA_CENTER_LON
from .morphology import MorphologyGrid

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"

# Oltre questa altezza d'onda (m) consideriamo la traina lenta poco praticabile
# ovunque, indipendentemente dall'esposizione della cella.
WAVE_HEIGHT_ROUGH_M = 1.5


class MeteoUnavailable(Exception):
    pass


# Proxy con cache su Cloudflare (worker/index.ts): Open-Meteo limita per IP e gli
# IP condivisi di Render gratuito ricevono 429. Si prova prima la chiamata
# diretta (da casa/sviluppo funziona), poi il proxy.
PROXY_BASE = "https://pesca-5-terre.tuturial.workers.dev"
PROXY_PATHS = {MARINE_URL: "/api/om/marine", WEATHER_URL: "/api/om/forecast"}


def _fetch_json(url: str, params: dict) -> dict:
    query = urlencode(params)
    try:
        with urlopen(f"{url}?{query}", timeout=8) as resp:
            return json.load(resp)
    except Exception:
        proxy_path = PROXY_PATHS.get(url)
        if proxy_path is None:
            raise
        # Cloudflare rifiuta (403) lo user-agent predefinito di Python-urllib.
        req = Request(f"{PROXY_BASE}{proxy_path}?{query}", headers={"User-Agent": "Pesca5Terre-backend/1.0"})
        with urlopen(req, timeout=15) as resp:
            return json.load(resp)


@lru_cache(maxsize=64)
def _fetch_hourly_cached(date_hour_bucket: str) -> dict:
    """Cache-key sull'ora arrotondata: evita di richiamare le API esterne
    a ogni singola richiesta di scoring (che puo' capitare piu' volte al
    minuto durante il tuning dei pesi)."""
    params = {
        "latitude": AREA_CENTER_LAT,
        "longitude": AREA_CENTER_LON,
        "hourly": "wave_height,wave_direction,wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl",
        "timezone": "Europe/Rome",
        "forecast_days": 5,
        "past_days": 1,
    }
    marine = _fetch_json(MARINE_URL, params)

    wind_params = {
        "latitude": AREA_CENTER_LAT,
        "longitude": AREA_CENTER_LON,
        "hourly": "wind_speed_10m,wind_direction_10m",
        "timezone": "Europe/Rome",
        "forecast_days": 5,
        "past_days": 1,
    }
    wind = _fetch_json(WEATHER_URL, wind_params)

    return {"marine": marine, "wind": wind}


def _nearest_hour_index(times: list[str], dt: datetime) -> int | None:
    target = dt.strftime("%Y-%m-%dT%H:00")
    if target in times:
        return times.index(target)
    return None


def get_conditions(dt: datetime) -> dict:
    """Condizioni meteo-mare per l'ora piu' vicina a dt. Solleva MeteoUnavailable
    se il servizio non e' raggiungibile o l'orario e' fuori dalla finestra di
    previsione (oltre ~5 giorni nel futuro, o oltre 1 giorno nel passato)."""
    bucket = dt.strftime("%Y-%m-%d-%H")  # ora esatta: cache naturale per richieste ripetute
    try:
        data = _fetch_hourly_cached(bucket[:10])  # cache per giorno, riusata per tutte le ore
    except Exception as exc:  # rete assente, timeout, servizio giu'
        raise MeteoUnavailable(str(exc)) from exc

    marine_hourly = data["marine"]["hourly"]
    wind_hourly = data["wind"]["hourly"]

    idx = _nearest_hour_index(marine_hourly["time"], dt)
    if idx is None:
        raise MeteoUnavailable(f"Nessuna previsione disponibile per {dt.isoformat()}")

    wind_idx = _nearest_hour_index(wind_hourly["time"], dt)

    return {
        "wave_height_m": marine_hourly["wave_height"][idx],
        "wave_direction_deg": marine_hourly["wave_direction"][idx],
        "wave_period_s": marine_hourly["wave_period"][idx],
        "sea_surface_temp_c": marine_hourly["sea_surface_temperature"][idx],
        "wind_speed_kmh": wind_hourly["wind_speed_10m"][wind_idx] if wind_idx is not None else None,
        "wind_direction_deg": wind_hourly["wind_direction_10m"][wind_idx] if wind_idx is not None else None,
        "time": marine_hourly["time"][idx],
        "source": "Open-Meteo Marine + Weather API",
    }


def meteo_score_grid(grid: MorphologyGrid, conditions: dict) -> np.ndarray:
    """Score 0..1 per cella: 1 = mare piatto o cella riparata dalla direzione
    d'onda attuale, verso 0 quanto piu' l'onda e' alta E la cella e' esposta
    proprio a quella direzione. Modula, non sovrascrive, il resto della
    formula (sezione 5e/6 del progetto)."""
    wave_height = conditions["wave_height_m"] or 0.0
    wave_direction = conditions["wave_direction_deg"]

    height_factor = np.clip(wave_height / WAVE_HEIGHT_ROUGH_M, 0, 1)

    if wave_direction is None or height_factor == 0:
        return np.ones(grid.shape, dtype=np.float32)

    angle_diff = np.abs(((grid.aspect_deg - wave_direction) + 180) % 360 - 180)
    exposure = (np.cos(np.radians(angle_diff)) + 1) / 2  # 1 = pienamente esposta, 0 = ridossata

    score = 1 - height_factor * exposure
    return np.clip(score, 0, 1).astype(np.float32)


KMH_TO_KNOTS = 0.539957
MIN_TIDE_SWING_CM = 5


def _tide_extrema(times: list[str], levels: list, start: int, end: int) -> list[dict]:
    """Alta/bassa marea nella finestra [start, end). Il livello del modello ha
    piccole oscillazioni che non sono maree: tengo solo gli estremi che
    distano almeno MIN_TIDE_SWING_CM dall'estremo precedente (alternati)."""
    raw = []
    for i in range(max(start, 1), min(end, len(levels) - 1)):
        a, b, c = levels[i - 1], levels[i], levels[i + 1]
        if None in (a, b, c):
            continue
        if b > a and b >= c:
            raw.append({"time": times[i], "type": "alta", "level_cm": round(b * 100)})
        elif b < a and b <= c:
            raw.append({"time": times[i], "type": "bassa", "level_cm": round(b * 100)})
    out: list[dict] = []
    for e in raw:
        if out and out[-1]["type"] == e["type"]:
            # stesso tipo consecutivo: tengo il piu' estremo
            better = e["level_cm"] > out[-1]["level_cm"] if e["type"] == "alta" else e["level_cm"] < out[-1]["level_cm"]
            if better:
                out[-1] = e
        elif out and abs(e["level_cm"] - out[-1]["level_cm"]) < MIN_TIDE_SWING_CM:
            continue  # oscillazione trascurabile, non e' un'inversione di marea
        else:
            out.append(e)
    return out


def get_sea_details(dt: datetime, hours: int = 12, tide_hours: int = 30) -> dict:
    """Corrente superficiale (nodi, direzione VERSO cui scorre) per le prossime
    `hours` ore + marea (livello del mare in cm rispetto alla media, comprende
    la marea astronomica) per `tide_hours` ore. Stime da modello, non misure."""
    try:
        data = _fetch_hourly_cached(dt.strftime("%Y-%m-%d"))
    except Exception as exc:
        raise MeteoUnavailable(str(exc)) from exc
    hourly = data["marine"]["hourly"]
    idx = _nearest_hour_index(hourly["time"], dt)
    if idx is None:
        raise MeteoUnavailable(f"Nessuna previsione per {dt.isoformat()}")

    current = []
    for i in range(idx, min(idx + hours + 1, len(hourly["time"]))):
        v = hourly["ocean_current_velocity"][i]
        d = hourly["ocean_current_direction"][i]
        if v is None or d is None:
            continue
        current.append({"time": hourly["time"][i], "speed_kn": round(v * KMH_TO_KNOTS, 2), "direction_deg": d})

    raw_levels = hourly["sea_level_height_msl"]
    # Il modello ha un offset costante (circa -50 cm sul Mar Ligure, dovuto al
    # riferimento verticale): lo tolgo rispetto alla media dei giorni disponibili,
    # cosi' il valore indica "sopra/sotto il livello medio del periodo".
    valid = [v for v in raw_levels if v is not None]
    mean_level = sum(valid) / len(valid) if valid else 0.0
    levels = [None if v is None else v - mean_level for v in raw_levels]
    tide = []
    for i in range(idx, min(idx + tide_hours + 1, len(levels))):
        if levels[i] is not None:
            tide.append({"time": hourly["time"][i], "level_cm": round(levels[i] * 100)})
    trend = None
    if idx + 1 < len(levels) and levels[idx] is not None and levels[idx + 1] is not None:
        diff = levels[idx + 1] - levels[idx]
        trend = "in salita" if diff > 0.002 else "in discesa" if diff < -0.002 else "stazionaria"
    extrema = _tide_extrema(hourly["time"], levels, idx + 1, idx + tide_hours)

    return {
        "current": current,
        "tide": {"points": tide, "trend": trend, "extrema": extrema},
        "source": "Open-Meteo Marine (modello SMOC Meteo-France, ~8 km) - stime, non misure",
    }
