"""Morfologia del fondale: pendenza, secche e distanza dalla costa.

Dati reali da EMODnet Bathymetry (WCS GetCoverage, risoluzione nativa
~115m), non stimati. Elevazione positiva = terra, negativa = profondita'
in mare, coerente con la convenzione del layer "Atlas" gia' usato in mappa.
"""

from dataclasses import dataclass
from functools import lru_cache

import numpy as np
import rasterio
from scipy.ndimage import distance_transform_edt, uniform_filter

from .config import BATHYMETRY_PATH, DEPTH_FULL_RELEVANCE_M, DEPTH_ZERO_RELEVANCE_M


@dataclass
class MorphologyGrid:
    elevation: np.ndarray  # metri, positivo=terra, negativo=mare
    sea_mask: np.ndarray  # True dove e' mare
    slope_score: np.ndarray  # 0..1, pendenza normalizzata (scarpate)
    shoal_score: np.ndarray  # 0..1, prossimita' a un minimo locale di profondita' (secca)
    distance_to_coast_m: np.ndarray
    depth_relevance: np.ndarray  # 0..1, sfuma a 0 oltre la profondita' rilevante per la traina costiera
    aspect_deg: np.ndarray  # direzione bussola (0=N) verso cui la cella "si apre" sul mare aperto
    transform: rasterio.Affine
    crs: str
    shape: tuple[int, int]
    res_deg: tuple[float, float]


def _pixel_size_meters(res_deg: tuple[float, float], lat_deg: float) -> tuple[float, float]:
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * np.cos(np.radians(lat_deg))
    return abs(res_deg[0]) * m_per_deg_lon, abs(res_deg[1]) * m_per_deg_lat


@lru_cache(maxsize=1)
def load_morphology() -> MorphologyGrid:
    with rasterio.open(BATHYMETRY_PATH) as ds:
        elevation = ds.read(1).astype(np.float32)
        transform = ds.transform
        crs = str(ds.crs)
        shape = ds.shape
        res_deg = ds.res
        bounds = ds.bounds

    sea_mask = elevation < 0

    # Rilevanza per profondita': piena fino a DEPTH_FULL_RELEVANCE_M, sfuma
    # linearmente a 0 oltre DEPTH_ZERO_RELEVANCE_M. Evita che il largo
    # abissale (fuori portata della traina lenta costiera) vinca lo score
    # solo perche' ha pendenze ripide in valore assoluto.
    depth = np.clip(-elevation, 0, None)  # metri, positivo in mare
    depth_relevance = 1.0 - np.clip(
        (depth - DEPTH_FULL_RELEVANCE_M) / (DEPTH_ZERO_RELEVANCE_M - DEPTH_FULL_RELEVANCE_M), 0, 1
    )
    depth_relevance = np.where(sea_mask, depth_relevance, 0.0).astype(np.float32)

    center_lat = (bounds.top + bounds.bottom) / 2
    px_x_m, px_y_m = _pixel_size_meters(res_deg, center_lat)

    # Pendenza: gradiente della profondita' in m/m, poi normalizzato.
    # Sul mare le scarpate/scalini di risalita hanno gradiente marcato;
    # sulla terra il valore non e' rilevante (mascherato dopo).
    gy, gx = np.gradient(elevation, px_y_m, px_x_m)
    slope = np.sqrt(gx**2 + gy**2)
    slope_sea = np.where(sea_mask, slope, 0.0)
    # Normalizzazione robusta sul solo intorno costiero rilevante (depth_relevance>0.3):
    # cosi' le scarpate del largo abissale, ripide ma irrilevanti per la traina
    # costiera, non schiacciano la scala.
    relevant_mask = sea_mask & (depth_relevance > 0.3)
    p95 = np.percentile(slope_sea[relevant_mask], 95) if relevant_mask.any() else 1.0
    slope_score = np.clip(slope_sea / max(p95, 1e-6), 0, 1)

    # Esposizione: direzione (bussola, 0=N) verso cui la cella "guarda" il
    # mare aperto, dedotta dal gradiente di elevazione. Il gradiente punta
    # verso terra (elevazione crescente); il mare aperto e' nella direzione
    # opposta. Usata per modulare l'impatto del moto ondoso per direzione
    # (sezione 5e: "mare mosso da libeccio penalizza le zone esposte a ovest").
    seaward_east = -gx
    seaward_north = gy  # gy e' ∂z/∂sud (asse riga cresce verso sud) -> ∂z/∂nord = -gy
    aspect_deg = np.degrees(np.arctan2(seaward_east, seaward_north)) % 360

    # Secche: punti dove il fondale e' PIU' ALTO (meno profondo) del suo
    # intorno immediato, pur restando in mare — minimo locale di profondita'.
    # Intorno di ~1 km espresso in metri (non in pixel): la griglia puo'
    # essere a 115 m (EMODnet) o ~38 m (fine), il significato deve restare lo stesso.
    px_m = (px_x_m + px_y_m) / 2
    neighborhood_px = max(int(round(1035 / px_m)) // 2 * 2 + 1, 3)
    neighborhood_avg = uniform_filter(np.where(sea_mask, elevation, 0.0), size=neighborhood_px)
    shoal_raw = np.where(sea_mask, neighborhood_avg - elevation, 0.0)  # >0 se piu' alto della media locale
    shoal_raw = np.clip(shoal_raw, 0, None)
    p95_shoal = np.percentile(shoal_raw[sea_mask], 95) if sea_mask.any() else 1.0
    shoal_score = np.clip(shoal_raw / max(p95_shoal, 1e-6), 0, 1)

    # Distanza dalla costa: transform distance su maschera terra/mare.
    dist_px = distance_transform_edt(sea_mask)
    px_diag_m = (px_x_m + px_y_m) / 2
    distance_to_coast_m = dist_px * px_diag_m

    return MorphologyGrid(
        elevation=elevation,
        sea_mask=sea_mask,
        slope_score=slope_score.astype(np.float32),
        shoal_score=shoal_score.astype(np.float32),
        distance_to_coast_m=distance_to_coast_m.astype(np.float32),
        depth_relevance=depth_relevance,
        aspect_deg=aspect_deg.astype(np.float32),
        transform=transform,
        crs=crs,
        shape=shape,
        res_deg=res_deg,
    )


def morphology_score(grid: MorphologyGrid) -> np.ndarray:
    """Combina pendenza (scarpate) e secche in un punteggio unico 0..1,
    smorzato dalla rilevanza di profondita' (fuori range = non utile)."""
    base = np.clip(0.6 * grid.slope_score + 0.4 * grid.shoal_score, 0, 1)
    return base * grid.depth_relevance
