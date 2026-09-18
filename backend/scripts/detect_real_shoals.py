"""Rileva le secche VERE dalla geometria reale delle isobate, come punti
GeoJSON distinti dai pin che l'utente aggiunge a mano in app ("+ Aggiungi
punto").

Perche' non un'interpolazione a griglia: i punti Regione Liguria sono
vertici di LINEE di isobata (una ogni metro), non un grigliato continuo —
coprono solo il 3% circa dei pixel di un'area interpolata (stesso limite gia'
documentato in generate_hillshade.py). Cercare "massimi locali" su una
superficie interpolata da linee cosi' sottili produce quasi solo artefatti
della curvatura della linea stessa (verificato: 3400+ falsi positivi su un
primo tentativo), non vere secche.

Il metodo corretto lavora invece DIRETTAMENTE sulla geometria delle linee
vere, come farebbe un comandante leggendo una carta nautica cartacea: una
secca appare come un ANELLO CHIUSO di una linea di profondita' minore,
annidato dentro anelli chiusi via via piu' profondi, isolato (non attaccato
alla costa). Si tiene solo l'anello piu' interno/piu' basso di ogni gruppo
annidato — quello e' il punto piu' alto della secca.

Fallback al largo oltre la fascia coperta da Regione Liguria: griglia
EMODnet (115m/pixel, grossolana), stesso approccio a griglia gia' verificato
funzionare li' (l'area validamente coperta e' piena, non sottile come le
isobate — il problema di cui sopra non si presenta).

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\detect_real_shoals.py
Rigenera public/data/real_shoals.geojson.
"""

import json
from pathlib import Path

import numpy as np
import rasterio
from scipy.ndimage import maximum_filter, uniform_filter
from shapely.geometry import Polygon
from shapely.strtree import STRtree

BACKEND_DIR = Path(__file__).resolve().parent.parent
TIF_PATH = BACKEND_DIR / "data" / "bathymetry" / "amp_bathy.tif"
ISOBATHS_PATH = BACKEND_DIR / "data" / "bathymetry" / "liguria_isobaths_detailed.geojson"
GEOJSON_OUT = BACKEND_DIR.parent / "public" / "data" / "real_shoals.geojson"

# Il dato sorgente Regione Liguria copre un tratto di costa piu' ampio di
# quello operativo dell'app (src/config/area.ts, AREA_BOUNDS): senza questo
# filtro comparirebbero secche vere ma fuori zona (es. Golfo della Spezia).
APP_AREA_BOUNDS = ((9.53, 44.04), (9.82, 44.23))

MIN_RING_AREA_M2 = 300  # sotto, e' rumore di digitalizzazione, non una secca reale
MAX_RING_AREA_M2 = 500_000  # 0.5 kmq: oltre e' un bacino/pianoro, non una secca isolata
MAX_DEPTH_M = 90  # oltre, fuori dal range pratico delle specie sottocosta modellate in questa app

# Fallback al largo (EMODnet, grossolano) — stesso metodo a griglia della
# prima versione di questo script, valido li' perche' l'area coperta e'
# piena e continua, non sottile come le isobate.
COARSE_NEIGHBORHOOD_PX = 9  # ~1035m a 115m/pixel
COARSE_PEAK_FOOTPRINT_PX = 5  # ~575m
COARSE_SHOAL_SCORE_MIN = 0.55
COARSE_MAX_DEPTH_M = 150
DEDUP_RADIUS_M = 300  # scarta un punto EMODnet troppo vicino a una secca gia' trovata dagli anelli


def _deg_per_meter(lat_deg: float) -> tuple[float, float]:
    deg_lat_m = 1 / 111_320.0
    deg_lon_m = 1 / (111_320.0 * np.cos(np.radians(lat_deg)))
    return deg_lon_m, deg_lat_m


def detect_ring_shoals() -> list[dict]:
    with open(ISOBATHS_PATH, encoding="utf-8") as f:
        data = json.load(f)

    center_lat = 44.13  # per la conversione gradi->metri, l'area e' piccola: non serve piu' precisione
    deg_lon_m, deg_lat_m = _deg_per_meter(center_lat)

    # Costruisce un poligono (in metri, per calcolare aree vere) per ogni
    # anello chiuso, con la sua profondita' etichettata.
    rings: list[dict] = []
    for feat in data["features"]:
        coords = feat["geometry"]["coordinates"]
        depth = feat["properties"].get("depth")
        if depth is None or depth > MAX_DEPTH_M:
            continue
        if len(coords) < 4 or coords[0][:2] != coords[-1][:2]:
            continue  # non e' un anello chiuso
        coords_m = [(lon / deg_lon_m, lat / deg_lat_m) for lon, lat, *_ in coords]
        poly = Polygon(coords_m)
        if not poly.is_valid or poly.area < MIN_RING_AREA_M2 or poly.area > MAX_RING_AREA_M2:
            continue
        rings.append({"depth": depth, "poly": poly, "centroid_m": poly.centroid})

    print(f"Anelli chiusi candidati (area/profondita' valide): {len(rings)}")

    # Tiene solo l'anello piu' interno di ogni gruppo annidato: quello con
    # nessun altro anello DI PROFONDITA' MINORE (piu' basso, quindi piu' in
    # cima alla secca) il cui centroide cade al suo interno.
    all_polys = [r["poly"] for r in rings]
    tree = STRtree(all_polys)
    is_summit = [True] * len(rings)
    for i, r in enumerate(rings):
        candidate_idx = tree.query(r["poly"])
        for j in candidate_idx:
            j = int(j)
            if j == i or rings[j]["depth"] >= r["depth"]:
                continue
            if r["poly"].contains(rings[j]["centroid_m"]):
                is_summit[i] = False
                break

    summits = [r for r, keep in zip(rings, is_summit) if keep]
    print(f"Secche (anelli piu' interni, sottocosta): {len(summits)}")

    features = []
    (area_lon_min, area_lat_min), (area_lon_max, area_lat_max) = APP_AREA_BOUNDS
    features = []
    out_of_area = 0
    for r in summits:
        cx, cy = r["centroid_m"].x, r["centroid_m"].y
        lon, lat = cx * deg_lon_m, cy * deg_lat_m
        if not (area_lon_min <= lon <= area_lon_max and area_lat_min <= lat <= area_lat_max):
            out_of_area += 1
            continue
        features.append({"lon": lon, "lat": lat, "depth_m": float(r["depth"]), "source": "regione_liguria_isobate"})
    print(f"Scartate {out_of_area} secche fuori dall'area operativa dell'app")
    return features


def detect_coarse_shoals(exclude: list[dict]) -> list[dict]:
    """Fallback al largo: griglia EMODnet, esclusi i punti troppo vicini a
    una secca gia' trovata negli anelli di isobate reali."""
    with rasterio.open(TIF_PATH) as ds:
        elevation = ds.read(1).astype(np.float32)
        transform = ds.transform
        bounds = ds.bounds

    sea_mask = elevation < 0
    depth = np.clip(-elevation, 0, None)
    center_lat = (bounds.top + bounds.bottom) / 2
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * np.cos(np.radians(center_lat))

    neighborhood_avg = uniform_filter(np.where(sea_mask, elevation, 0.0), size=COARSE_NEIGHBORHOOD_PX)
    shoal_raw = np.where(sea_mask, neighborhood_avg - elevation, 0.0)
    shoal_raw = np.clip(shoal_raw, 0, None)
    p95 = np.percentile(shoal_raw[sea_mask], 95) if sea_mask.any() else 1.0
    shoal_score = np.clip(shoal_raw / max(p95, 1e-6), 0, 1)

    local_max = maximum_filter(shoal_score, size=COARSE_PEAK_FOOTPRINT_PX, mode="nearest")
    is_peak = (
        sea_mask
        & (shoal_score == local_max)
        & (shoal_score >= COARSE_SHOAL_SCORE_MIN)
        & (depth <= COARSE_MAX_DEPTH_M)
    )

    exclude_lonlat = np.array([[f["lon"], f["lat"]] for f in exclude]) if exclude else np.empty((0, 2))

    rows, cols = np.where(is_peak)
    features = []
    skipped = 0
    for r, c in zip(rows, cols):
        lon, lat = rasterio.transform.xy(transform, r, c)
        if len(exclude_lonlat):
            dx = (exclude_lonlat[:, 0] - lon) * m_per_deg_lon
            dy = (exclude_lonlat[:, 1] - lat) * m_per_deg_lat
            if np.min(np.hypot(dx, dy)) < DEDUP_RADIUS_M:
                skipped += 1
                continue
        features.append(
            {
                "lon": float(lon),
                "lat": float(lat),
                "depth_m": round(float(depth[r, c]), 1),
                "source": "emodnet",
            }
        )
    print(f"Secche al largo (EMODnet, fallback): {len(features)} ({skipped} scartate come duplicati)")
    return features


def main() -> None:
    fine = detect_ring_shoals()
    coarse = detect_coarse_shoals(exclude=fine)
    all_shoals = fine + coarse

    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [f["lon"], f["lat"]]},
                "properties": {"depth_m": f["depth_m"], "source": f["source"]},
            }
            for f in all_shoals
        ],
    }
    GEOJSON_OUT.parent.mkdir(parents=True, exist_ok=True)
    GEOJSON_OUT.write_text(json.dumps(geojson), encoding="utf-8")
    print(f"Totale {len(all_shoals)} secche reali scritte su {GEOJSON_OUT}")


if __name__ == "__main__":
    main()
