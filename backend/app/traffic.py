"""Pressione di traffico marittimo stimata: traghetti (dato reale/orario
fisso) + boat tour e diporto (euristica dichiarata come stima, non misura —
vedi sezione 5b del progetto). Nessuna integrazione AIS in questo MVP.
"""

import json
from datetime import datetime
from functools import lru_cache

import numpy as np
import rasterio

from .config import (
    BOAT_TOUR_COAST_BAND_M,
    BOAT_TOUR_HOURS,
    FERRY_IMPACT_RADIUS_M,
    FERRY_IMPACT_WINDOW_MIN,
    FERRY_SCHEDULE_PATH,
)
from .morphology import MorphologyGrid


@lru_cache(maxsize=1)
def _load_ferry_schedule() -> dict:
    with open(FERRY_SCHEDULE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _season_covers(season: dict, dt: datetime) -> bool:
    fm, fd = (int(x) for x in season["valid_from"].split("-"))
    tm, td = (int(x) for x in season["valid_to"].split("-"))
    frm = dt.replace(month=fm, day=fd, hour=0, minute=0)
    to = dt.replace(month=tm, day=td, hour=23, minute=59)
    return frm <= dt <= to


def ferry_passages_in_window(start: datetime, end: datetime) -> list[dict]:
    """Passaggi traghetto (stop + orario) che cadono dentro [start, end], solo se
    la data rientra in una stagione con orari caricati."""
    schedule = _load_ferry_schedule()
    active_seasons = [s for s in schedule["seasons"] if _season_covers(s, start)]
    results = []
    for season in active_seasons:
        for run in season["runs"]:
            for stop, time_str in run.items():
                h, m = (int(x) for x in time_str.split(":"))
                passage = start.replace(hour=h, minute=m, second=0, microsecond=0)
                if start <= passage <= end:
                    results.append({"stop": stop, "time": time_str})
    return results


def _lonlat_grid(grid: MorphologyGrid) -> tuple[np.ndarray, np.ndarray]:
    rows, cols = grid.shape
    xs = np.arange(cols)
    ys = np.arange(rows)
    lon, _ = rasterio.transform.xy(grid.transform, np.zeros_like(xs), xs)
    _, lat = rasterio.transform.xy(grid.transform, ys, np.zeros_like(ys))
    lon_grid, lat_grid = np.meshgrid(np.array(lon), np.array(lat))
    return lon_grid, lat_grid


def _meters_distance(lon_grid: np.ndarray, lat_grid: np.ndarray, point: tuple[float, float]) -> np.ndarray:
    plon, plat = point
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * np.cos(np.radians(plat))
    dx = (lon_grid - plon) * m_per_deg_lon
    dy = (lat_grid - plat) * m_per_deg_lat
    return np.sqrt(dx**2 + dy**2)


def _ferry_pressure(grid: MorphologyGrid, lon_grid: np.ndarray, lat_grid: np.ndarray, dt: datetime) -> np.ndarray:
    schedule = _load_ferry_schedule()
    pressure = np.zeros(grid.shape, dtype=np.float32)
    active_seasons = [s for s in schedule["seasons"] if _season_covers(s, dt)]
    if not active_seasons:
        return pressure

    stop_coords = schedule["stop_coords"]
    for season in active_seasons:
        for run in season["runs"]:
            for stop, time_str in run.items():
                h, m = (int(x) for x in time_str.split(":"))
                passage = dt.replace(hour=h, minute=m, second=0, microsecond=0)
                diff_min = abs((dt - passage).total_seconds() / 60)
                if diff_min > FERRY_IMPACT_WINDOW_MIN:
                    continue
                coords = stop_coords.get(stop)
                if not coords:
                    continue
                dist = _meters_distance(lon_grid, lat_grid, tuple(coords))
                intensity = (1 - diff_min / FERRY_IMPACT_WINDOW_MIN) * np.clip(
                    1 - dist / FERRY_IMPACT_RADIUS_M, 0, 1
                )
                pressure = np.maximum(pressure, intensity)
    return pressure


def _boat_tour_pressure(grid: MorphologyGrid, dt: datetime) -> np.ndarray:
    near_coast = np.clip(1 - grid.distance_to_coast_m / BOAT_TOUR_COAST_BAND_M, 0, 1)
    in_peak_hours = any(start <= dt.hour < end for start, end in BOAT_TOUR_HOURS)
    base = 0.6 if in_peak_hours else 0.15
    # Stagionalita' grezza: piu' turismo via mare in stagione calda (giu-set).
    seasonal_factor = 1.0 if dt.month in (6, 7, 8, 9) else 0.4
    return (base * seasonal_factor * near_coast).astype(np.float32)


def _diporto_pressure(grid: MorphologyGrid, dt: datetime) -> np.ndarray:
    near_coast = np.clip(1 - grid.distance_to_coast_m / (BOAT_TOUR_COAST_BAND_M * 2), 0, 1)
    weekend_factor = 1.0 if dt.weekday() >= 5 else 0.5
    seasonal_factor = 1.0 if dt.month in (6, 7, 8, 9) else 0.25
    base = 0.35
    return (base * weekend_factor * seasonal_factor * near_coast).astype(np.float32)


def traffic_pressure(grid: MorphologyGrid, dt: datetime) -> np.ndarray:
    """Pressione di traffico stimata 0..1 per cella, combinando i tre sotto-livelli."""
    lon_grid, lat_grid = _lonlat_grid(grid)
    ferry = _ferry_pressure(grid, lon_grid, lat_grid, dt)
    boat_tour = _boat_tour_pressure(grid, dt)
    diporto = _diporto_pressure(grid, dt)
    combined = ferry + boat_tour * 0.7 + diporto * 0.5
    return np.clip(combined, 0, 1).astype(np.float32)
