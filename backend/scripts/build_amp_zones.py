"""Costruisce i poligoni ESATTI delle zone A e B dell'Area Marina Protetta
Cinque Terre, dalle coordinate ufficiali pubblicate nel Decreto Ministeriale
20 luglio 2011, n. 189 (Gazzetta Ufficiale, Serie Generale n. 266 del
15/11/2011 — Allegato, Art. 4 "Zonazione dell'area marina protetta").

Le coordinate nel decreto sono in gradi e primi decimali (WGS84) e
definiscono solo il lato VERSO IL MARE di ciascuna zona: i punti marcati
"(in costa)" sono gli estremi dove il confine tocca la riva. Il lato verso
terra e' quindi la costa vera fra quei due punti — qui presa dagli stessi
dati ufficiali di costa gia' usati per la rotta traghetti
(fetch_coastline.py), non da un segmento retto.

Zona C non e' inclusa: il decreto la definisce come "il residuo tratto di
mare all'interno del perimetro dell'area marina protetta, come delimitato
all'articolo 4 del decreto istitutivo" (il decreto ORIGINARIO del 1997) —
un perimetro esterno che non e' stato reperito in forma di coordinate
verificabili. Aggiungerla richiederebbe altrimenti indovinare un confine,
cosa che non ha senso per un limite legale di pesca.

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\build_amp_zones.py
"""

import json
import re
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon, mapping, shape
from shapely.ops import linemerge, unary_union

BACKEND_DIR = Path(__file__).resolve().parent.parent
COASTLINE_PATH = BACKEND_DIR / "data" / "bathymetry" / "coastline_raw.geojson"
OUT_PATH = BACKEND_DIR.parent / "public" / "data" / "amp_zones.geojson"

SOURCE = (
    "Decreto Ministeriale 20 luglio 2011, n. 189 (G.U. Serie Generale n. 266 "
    "del 15/11/2011), Allegato — Art. 4"
)

# Punti trascritti letteralmente dal testo del decreto (grado, primi.centesimi).
# fmt: off
ZONE_A_PUNTA_MESCO = [
    ("E1", "44 08.65 N", "009 37.42 E"),
    ("E",  "44 08.46 N", "009 37.24 E"),
    ("F",  "44 08.05 N", "009 37.58 E"),
    ("G",  "44 07.88 N", "009 38.29 E"),
    ("H",  "44 08.16 N", "009 38.55 E"),
    ("H1", "44 08.25 N", "009 38.34 E"),
]
ZONE_A_CAPO_MONTE_NEGRO = [
    ("T1", "44 05.62 N", "009 44.32 E"),
    ("T",  "44 05.53 N", "009 44.17 E"),
    ("U",  "44 05.34 N", "009 44.48 E"),
    ("U1", "44 05.53 N", "009 44.45 E"),
]
ZONE_B_PUNTA_MESCO = [
    ("L1", "44 08.98 N", "009 37.10 E"),
    ("L",  "44 08.79 N", "009 36.86 E"),
    ("M",  "44 07.81 N", "009 37.67 E"),
    ("N",  "44 07.81 N", "009 38.32 E"),
    ("P",  "44 08.51 N", "009 38.94 E"),
    ("P1", "44 08.68 N", "009 38.58 E"),
]
ZONE_B_CAPO_MONTENEGRO = [
    ("Q1", "44 05.79 N", "009 44.38 E"),
    ("Q",  "44 05.79 N", "009 44.07 E"),
    ("R",  "44 05.47 N", "009 43.67 E"),
    ("S",  "44 05.04 N", "009 44.31 E"),
    ("S1", "44 05.52 N", "009 44.94 E"),
]
# fmt: on


def dm_to_decimal(dm: str) -> float:
    """'44 08.65 N' -> 44.144166..."""
    m = re.match(r"(\d+)\s+(\d+\.\d+)\s*([NSEW])", dm.strip())
    if not m:
        raise ValueError(f"formato coordinata non riconosciuto: {dm!r}")
    deg, minutes, hemi = m.groups()
    value = float(deg) + float(minutes) / 60
    if hemi in ("S", "W"):
        value = -value
    return value


def points_to_lonlat(points: list[tuple[str, str, str]]) -> list[tuple[float, float]]:
    return [(dm_to_decimal(lon), dm_to_decimal(lat)) for _, lat, lon in points]


def merged_coastline() -> LineString:
    raw = json.loads(COASTLINE_PATH.read_text(encoding="utf-8"))
    geoms = [shape(f["geometry"]) for f in raw["features"]]
    merged = linemerge(unary_union(geoms))
    parts = list(merged.geoms) if hasattr(merged, "geoms") else [merged]
    candidates = [p for p in parts if p.length > 0.05]
    candidates.sort(key=lambda p: -p.length)
    return candidates[0]


def _substring(line: LineString, start: float, end: float) -> LineString:
    coords = [(x, y) for x, y, *_ in line.coords]
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


def build_zone_polygon(seaward_points: list[tuple[float, float]], coast: LineString) -> Polygon:
    """Chiude il lato mare (i punti del decreto) con il lato costa vera fra
    il primo e l'ultimo punto (entrambi "in costa" nel testo del decreto)."""
    first, last = seaward_points[0], seaward_points[-1]
    pos_first = coast.project(Point(*first))
    pos_last = coast.project(Point(*last))
    lo, hi = min(pos_first, pos_last), max(pos_first, pos_last)
    coast_piece = _substring(coast, lo, hi)
    coast_coords = [(x, y) for x, y, *_ in coast_piece.coords]
    # Il pezzo di costa va ricongiunto nel verso giusto: dall'ultimo punto
    # mare al primo, cosi' il poligono si chiude senza auto-intersecarsi.
    if pos_first > pos_last:
        coast_coords = coast_coords[::-1]
    if Point(*coast_coords[0]).distance(Point(*last)) > Point(*coast_coords[-1]).distance(Point(*last)):
        coast_coords = coast_coords[::-1]
    ring = list(seaward_points) + coast_coords
    return Polygon(ring)


def main() -> None:
    coast = merged_coastline()
    # Zona B prima (sta "circostante" la A, per stessa definizione del
    # decreto): la mettiamo per prima nella FeatureCollection cosi' la A
    # si disegna sopra e resta visibile invece di sparire sotto il
    # riempimento della B che la contiene.
    zones = [
        ("B", "Zona B — Punta Mesco (riserva generale)", ZONE_B_PUNTA_MESCO),
        ("B", "Zona B — Capo Montenegro (riserva generale)", ZONE_B_CAPO_MONTENEGRO),
        ("A", "Zona A — Punta Mesco (riserva integrale)", ZONE_A_PUNTA_MESCO),
        ("A", "Zona A — Capo Monte Negro (riserva integrale)", ZONE_A_CAPO_MONTE_NEGRO),
    ]
    features = []
    for zone_id, name, points in zones:
        seaward = points_to_lonlat(points)
        poly = build_zone_polygon(seaward, coast)
        if not poly.is_valid:
            poly = poly.buffer(0)
        features.append(
            {
                "type": "Feature",
                "geometry": mapping(poly),
                "properties": {"zone": zone_id, "name": name, "source": SOURCE},
            }
        )
        print(f"{name}: area {poly.area*111*111*abs(__import__('math').cos(__import__('math').radians(44.1))):.3f} km2 (stima)")

    geojson = {"type": "FeatureCollection", "features": features}
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(geojson), encoding="utf-8")
    print(f"Scritte {len(features)} zone su {OUT_PATH}")


if __name__ == "__main__":
    main()
