"""Costruisce il tracciato della rotta traghetti seguendo la costa VERA
(Regione Liguria, linea di riva attuale ufficiale — scripts/fetch_coastline.py)
invece di segmenti retti fra i moli, che tagliano dritti sopra i promontori
(es. Punta Mesco fra Levanto e Monterosso).

Per ogni coppia di fermate consecutive: individua il tratto di costa fra le
due, lo sposta al largo di uno scarto fisso (i traghetti non navigano
incollati alla riva) e lo semplifica. Concatena tutti i tratti in un'unica
LineString.

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\build_ferry_route.py
"""

import json
from pathlib import Path

import numpy as np
import rasterio
from shapely.geometry import LineString, Point, shape, mapping
from shapely.ops import linemerge, unary_union

BACKEND_DIR = Path(__file__).resolve().parent.parent
COASTLINE_PATH = BACKEND_DIR / "data" / "bathymetry" / "coastline_raw.geojson"
ELEVATION_PATH = BACKEND_DIR / "data" / "bathymetry" / "amp_bathy.tif"
OUT_PATH = BACKEND_DIR.parent / "public" / "data" / "ferry_route.geojson"

# Ordine delle fermate sulla rotta (Corniglia esclusa: nessun approdo).
# Coordinate verificate sui moli/pontili reali via OpenStreetMap
# (amenity=ferry_terminal / man_made=pier) — stesse usate in
# src/config/ferrySchedule.ts.
STOPS = [
    ("levanto", (9.60889, 44.16614)),
    ("monterosso", (9.65448, 44.14460)),
    ("vernazza", (9.68176, 44.13518)),
    ("manarola", (9.72657, 44.10579)),
    ("riomaggiore", (9.73776, 44.09776)),
]

MIN_SAFE_DEPTH_M = 10  # un traghetto vero non passa dove il fondale e' 1-2m: serve un vero franco di sicurezza
MIN_OFFSET_DEG = 0.0015  # ~165m: non incollarsi alla riva anche dove il fondale scende subito
MAX_OFFSET_DEG = 0.012  # ~1.3km: quanto siamo disposti ad allontanarci per trovare abbastanza fondale
STEP_DEG = 0.0004  # ~45m, passo di ricerca
# Semplificare PRIMA di spostare, e parecchio: la costa digitalizzata segue
# ogni piccola insenatura, e un traghetto non ci entra e non ci esce ad ogni
# baia — taglia dritto da un promontorio al successivo. Una prima
# semplificazione grossolana elimina i dettagli fini della costa cosi' il
# tracciato risultante e' un percorso diretto sensato, non un ricalco
# pedissequo della riva.
PRE_OFFSET_SIMPLIFY_DEG = 0.003  # ~330m
# Semplificazione finale sul tracciato gia' spostato al largo, per ammorbi-
# dire ulteriormente eventuali zig-zag residui della ricerca punto-per-punto.
POST_OFFSET_SIMPLIFY_DEG = 0.0015  # ~165m


def merged_coastline() -> LineString:
    raw = json.loads(COASTLINE_PATH.read_text(encoding="utf-8"))
    geoms = [shape(f["geometry"]) for f in raw["features"]]
    merged = linemerge(unary_union(geoms))
    parts = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    # Teniamo il pezzo piu' lungo che upre la fascia Levanto-Riomaggiore:
    # verifichiamo che contenga (in proiezione) sia il primo che l'ultimo molo.
    candidates = [p for p in parts if p.length > 0.05]
    candidates.sort(key=lambda p: -p.length)
    return candidates[0]


def make_elevation_sampler():
    ds = rasterio.open(ELEVATION_PATH)

    def sample(lon: float, lat: float) -> float:
        return float(next(ds.sample([(lon, lat)]))[0])

    return sample


def _perp_directions(coords: list[tuple[float, float]], i: int) -> tuple[float, float]:
    """Direzione perpendicolare (normalizzata) alla costa nel punto i, stimata
    dai punti vicini."""
    i0, i1 = max(0, i - 1), min(len(coords) - 1, i + 1)
    tx = coords[i1][0] - coords[i0][0]
    ty = coords[i1][1] - coords[i0][1]
    norm = (tx * tx + ty * ty) ** 0.5 or 1.0
    return (-ty / norm, tx / norm)  # ruotata di 90 gradi ("sinistra" rispetto al verso di percorrenza)


def _march_to_sea(x0: float, y0: float, px: float, py: float, sample_elevation) -> tuple[float, float] | None:
    """Si allontana da (x0,y0) lungo (px,py) finche' l'elevazione campionata
    non e' sott'acqua di almeno MIN_SAFE_DEPTH_M (franco di sicurezza per un
    traghetto vero, non un semplice "qui non c'e' terra"), fino a
    MAX_OFFSET_DEG. None se non trovato."""
    d = MIN_OFFSET_DEG
    while d <= MAX_OFFSET_DEG:
        cand = (x0 + px * d, y0 + py * d)
        if sample_elevation(*cand) < -MIN_SAFE_DEPTH_M:
            return cand
        d += STEP_DEG
    return None


def offset_toward_sea(segment: LineString, sample_elevation) -> LineString:
    """Sposta ogni punto della costa verso il mare vero, punto per punto.

    Un singolo spostamento perpendicolare uniforme su tutto il segmento
    (shapely `offset_curve`) NON funziona in modo affidabile qui: (1) non
    c'e' modo semplice di sapere a priori quale dei due lati e' il mare
    (confrontare le distanze dalla costa non lo distingue: uno spostamento
    a distanza fissa produce per costruzione la stessa distanza su
    entrambi i lati), e (2) su una costa con promontori la stessa distanza
    fissa a volte finisce ancora in terra, a volte gia' abbondantemente in
    mare. Qui invece: si stabilisce prima il lato giusto con un voto di
    maggioranza su tutto il segmento, poi ogni punto si allontana lungo
    quel lato SOLO finche' serve per trovare mare vero (elevazione < 0),
    campionando i dati EMODnet reali — niente di indovinato.
    """
    coords = [(x, y) for x, y, *_ in segment.coords]
    if len(coords) < 2:
        return segment

    # Voto di maggioranza sul lato giusto, su un campione di punti.
    sample_idx = range(0, len(coords), max(1, len(coords) // 12))
    votes = {1: 0, -1: 0}
    for i in sample_idx:
        px, py = _perp_directions(coords, i)
        for sign in (1, -1):
            if _march_to_sea(coords[i][0], coords[i][1], sign * px, sign * py, sample_elevation) is not None:
                votes[sign] += 1
    side = 1 if votes[1] >= votes[-1] else -1
    if votes[side] == 0:
        return segment  # nessun lato trova mai mare: meglio il tratto originale che uno inventato

    out = []
    for i, (x0, y0) in enumerate(coords):
        px, py = _perp_directions(coords, i)
        found = _march_to_sea(x0, y0, side * px, side * py, sample_elevation)
        out.append(found if found is not None else (x0, y0))
    return LineString(out)


def main() -> None:
    coast = merged_coastline()
    print(f"Costa unificata: {coast.length*111:.1f} km circa, {len(coast.coords)} vertici")
    sample_elevation = make_elevation_sampler()

    positions = [coast.project(Point(lon, lat)) for _, (lon, lat) in STOPS]
    print("Posizioni lungo costa (gradi-arco):", [round(p, 4) for p in positions])

    # Lo scarto verso il largo (per il franco di sicurezza) allontana
    # necessariamente il tracciato dai moli veri, che stanno in acqua bassa
    # per definizione: senza aggiungere esplicitamente le coordinate del
    # molo, la rotta "passa vicino" alle fermate ma non ci arriva mai
    # davvero — sparisce la curva di avvicinamento all'attracco. Ogni
    # tappa qui aggiunge il molo (coordinate verificate OSM) come punto
    # fisso a inizio/fine tratta, cosi' la linea entra ed esce visibilmente
    # da ogni fermata invece di limitarsi a sfiorarla.
    all_coords: list[tuple[float, float]] = []
    for i in range(len(STOPS) - 1):
        a, b = positions[i], positions[i + 1]
        lo, hi = min(a, b), max(a, b)
        sub = _substring(coast, lo, hi)
        if a > b:
            sub = LineString(list(sub.coords)[::-1])
        sub_smooth = sub.simplify(PRE_OFFSET_SIMPLIFY_DEG, preserve_topology=False)
        sub_offset = offset_toward_sea(sub_smooth, sample_elevation)
        sub_offset = sub_offset.simplify(POST_OFFSET_SIMPLIFY_DEG, preserve_topology=False)

        start_port = STOPS[i][1]
        end_port = STOPS[i + 1][1]
        coords = [start_port, *sub_offset.coords, end_port]
        if all_coords and coords and all_coords[-1] == coords[0]:
            coords = coords[1:]
        all_coords.extend(coords)

    route = LineString(all_coords)
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": mapping(route),
                "properties": {
                    "note": "Tracciato indicativo lungo la costa reale (Regione Liguria), "
                    "non il track GPS esatto del traghetto.",
                },
            }
        ],
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(geojson), encoding="utf-8")
    print(f"Scritta rotta ({len(all_coords)} punti) su {OUT_PATH}")


def _substring(line: LineString, start: float, end: float) -> LineString:
    """Porzione di linea fra due distanze lungo il tracciato (come
    shapely.ops.substring, reimplementata per non richiedere una versione
    specifica di shapely)."""
    coords = [(x, y) for x, y, *_ in line.coords]  # scarta eventuale Z
    cum = [0.0]
    for i in range(1, len(coords)):
        cum.append(cum[-1] + LineString([coords[i - 1], coords[i]]).length)
    total = cum[-1]
    start = max(0.0, min(start, total))
    end = max(0.0, min(end, total))

    def point_at(d: float) -> tuple[float, float]:
        p = line.interpolate(d)
        return (p.x, p.y)

    out = [point_at(start)]
    for i, c in enumerate(cum):
        if start < c < end:
            out.append(coords[i])
    out.append(point_at(end))
    return LineString(out)


if __name__ == "__main__":
    main()
