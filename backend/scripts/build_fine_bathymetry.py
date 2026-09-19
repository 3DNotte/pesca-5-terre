"""Costruisce la griglia batimetrica FINE usata dal motore di scoring.

Perche': lo scoring lavorava sulla griglia EMODnet a ~115 m/pixel. Sotto
costa e' inutilizzabile: il pixel a riva mescola terra e mare e dice "2 m"
anche dove, su questa costa che cade a picco, a 100-200 m ci sono 20-30 m.
Il "sotto costa" e' esattamente dove sta la pesca che interessa.

Qui si combina, come gia' fa generate_hillshade.py per la texture:
1. dati REALI Regione Liguria (multibeam 2012, vertici di isobate) dove
   coprono, interpolati sulla griglia fine (scartando i triangoli "ponte"
   tra tratti scollegati);
2. EMODnet (~115 m) ovunque altrove, riportato alla stessa griglia.
Convenzione come amp_bathy.tif: elevazione negativa = mare, positiva = terra.

Risoluzione: FACTOR x piu' fine di EMODnet (3 -> ~38 m/pixel): un compromesso
tra dettaglio sotto costa e dimensione della risposta dell'API. Non e' la
risoluzione del rilievo (1 m): e' una sotto-campionatura.

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\build_fine_bathymetry.py
"""

import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import uniform_filter, zoom

BACKEND_DIR = Path(__file__).resolve().parent.parent
TIF_PATH = BACKEND_DIR / "data" / "bathymetry" / "amp_bathy.tif"
POINTS_PATH = BACKEND_DIR / "data" / "bathymetry" / "liguria_detailed_points.npz"
OUT_PATH = BACKEND_DIR / "data" / "bathymetry" / "amp_bathy_fine.tif"

FACTOR = 3
MAX_TRIANGLE_EDGE_M = 120  # come in generate_hillshade.py: oltre e' un ponte tra tratti scollegati
LAND_ELEVATION_M = 5.0  # valore fittizio positivo sulla terra (conta solo il segno)


def main() -> None:
    t0 = time.time()
    with rasterio.open(TIF_PATH) as ds:
        elevation = ds.read(1).astype(float)
        bounds = ds.bounds
        crs = ds.crs
    rows, cols = elevation.shape
    hi_rows, hi_cols = rows * FACTOR, cols * FACTOR

    center_lat = (bounds.bottom + bounds.top) / 2
    deg_lat_m = 111_320.0
    deg_lon_m = 111_320.0 * np.cos(np.radians(center_lat))

    sea0 = elevation < 0
    depth0 = np.where(sea0, -elevation, 0.0)
    depth_field = depth0.copy()
    for _ in range(400):  # estensione armonica sopra terra, come nello script hillshade
        depth_field = np.where(sea0, depth0, uniform_filter(depth_field, size=3))

    zoom_rc = (hi_rows / rows, hi_cols / cols)
    depth_fallback = zoom(depth_field, zoom_rc, order=3)
    sea_frac = zoom(sea0.astype(float), zoom_rc, order=1)

    pts = np.load(POINTS_PATH)
    interp = LinearNDInterpolator(np.column_stack([pts["lon"], pts["lat"]]), pts["depth"])
    lon_fine = bounds.left + (np.arange(hi_cols) + 0.5) * (bounds.right - bounds.left) / hi_cols
    lat_fine = bounds.top - (np.arange(hi_rows) + 0.5) * (bounds.top - bounds.bottom) / hi_rows
    LON, LAT = np.meshgrid(lon_fine, lat_fine)
    depth_liguria = interp(LON, LAT)

    xy_m = np.column_stack([pts["lon"] * deg_lon_m, pts["lat"] * deg_lat_m])
    tri = interp.tri
    tri_pts = xy_m[tri.simplices]
    edges = tri_pts[:, [0, 1, 2]] - tri_pts[:, [1, 2, 0]]
    triangle_ok = np.hypot(edges[..., 0], edges[..., 1]).max(axis=1) < MAX_TRIANGLE_EDGE_M
    simplex = tri.find_simplex(np.column_stack([LON.ravel(), LAT.ravel()]))
    ok = np.zeros(simplex.shape, dtype=bool)
    inside = simplex >= 0
    ok[inside] = triangle_ok[simplex[inside]]
    liguria_valid = ~np.isnan(depth_liguria) & ok.reshape(LON.shape)
    print(f"Copertura dati reali Regione Liguria: {100 * liguria_valid.mean():.0f}% dei pixel")

    depth = np.where(liguria_valid, depth_liguria, depth_fallback)
    sea = liguria_valid | (sea_frac > 0.5)
    # Regione Liguria puo' avere profondita' ~0 alla riva: le tratto come mare
    # (sea True) ma con almeno 0.5 m, cosi' la maschera resta coerente.
    fine = np.where(sea, -np.maximum(depth, 0.5), LAND_ELEVATION_M).astype(np.float32)

    transform = from_bounds(bounds.left, bounds.bottom, bounds.right, bounds.top, hi_cols, hi_rows)
    with rasterio.open(
        OUT_PATH,
        "w",
        driver="GTiff",
        height=hi_rows,
        width=hi_cols,
        count=1,
        dtype="float32",
        crs=crs,
        transform=transform,
        compress="deflate",
    ) as dst:
        dst.write(fine, 1)
    print(f"Scritta {OUT_PATH} ({hi_rows}x{hi_cols}, {OUT_PATH.stat().st_size/1e6:.1f} MB) in {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
