"""Meteo/mare in tempo reale — sezione 5e del progetto.

Vento e stato del mare da Open-Meteo (gratuito, nessuna chiave richiesta).
Corrente superficiale (Copernicus Marine) non integrata in questo MVP:
richiede registrazione e un client piu' pesante, rimandata a un secondo
momento come gia' previsto dal progetto originale.

Il dato modula lo score morfologico, non lo sovrascrive: mare mosso da una
direzione penalizza le celle ESPOSTE a quella direzione, non tutta l'area
allo stesso modo — vedi score_meteo_mare() in scoring.py.
"""

import json
from datetime import datetime
from functools import lru_cache
from urllib.parse import urlencode
from urllib.request import urlopen

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


def _fetch_json(url: str, params: dict) -> dict:
    full_url = f"{url}?{urlencode(params)}"
    with urlopen(full_url, timeout=8) as resp:
        return json.load(resp)


@lru_cache(maxsize=64)
def _fetch_hourly_cached(date_hour_bucket: str) -> dict:
    """Cache-key sull'ora arrotondata: evita di richiamare le API esterne
    a ogni singola richiesta di scoring (che puo' capitare piu' volte al
    minuto durante il tuning dei pesi)."""
    params = {
        "latitude": AREA_CENTER_LAT,
        "longitude": AREA_CENTER_LON,
        "hourly": "wave_height,wave_direction,wave_period,sea_surface_temperature",
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
