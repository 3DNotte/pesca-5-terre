"""Genera una texture di rilievo ombreggiato (hillshade) del fondale, in stile
Google Maps/Google Earth: le pendenze del fondo marino vengono illuminate da
una direzione simulata, dando un effetto 3D al posto del riempimento piatto.

FONTE DEL RILIEVO — due dataset combinati, non uno solo:
1. PRIMARIA, dove disponibile: backend/data/bathymetry/liguria_detailed_points.npz
   (~940 000 punti lon/lat/profondita', da scripts/fetch_liguria_detailed_isobaths.py)
   — isobate ufficiali Regione Liguria (WFS M2112:L7174) derivate da un rilievo
   MULTIBEAM REALE del 2012 a griglia 1x1m. Qui il rilievo rappresenta il
   fondale vero, non un'approssimazione: e' la risposta concreta alla domanda
   "c'e' un dato online piu' accurato" — si', per la fascia costiera fino a
   circa -60m c'e', e lo usiamo.
2. FALLBACK, dove la fascia 1 non arriva (oltre la fascia rilevata, e su
   terra): backend/data/bathymetry/amp_bathy.tif, EMODnet, ~115m/pixel. Li'
   resta un'approssimazione dichiarata (nessuna fonte gratuita piu' fine
   disponibile per quell'area/profondita' — verificato altrove in questo
   progetto).

Il confine tra le due fonti e' netto (nessun blend geografico), quindi puo'
esserci un piccolo salto di dettaglio al bordo della fascia rilevata — non
nascosto, e' la conseguenza onesta di due fonti con risoluzione diversa.

Uso: dalla cartella backend/, con il venv attivo:
    .venv\\Scripts\\python.exe scripts\\generate_hillshade.py
"""

import json
import time
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from scipy.interpolate import LinearNDInterpolator
from scipy.ndimage import uniform_filter, zoom

BACKEND_DIR = Path(__file__).resolve().parent.parent
TIF_PATH = BACKEND_DIR / "data" / "bathymetry" / "amp_bathy.tif"
POINTS_PATH = BACKEND_DIR / "data" / "bathymetry" / "liguria_detailed_points.npz"
PNG_OUT = BACKEND_DIR.parent / "public" / "data" / "bathymetry_hillshade.png"
BOUNDS_OUT = BACKEND_DIR.parent / "public" / "data" / "bathymetry_hillshade_bounds.json"
# Overlay ad alta risoluzione, ritagliato SOLO dove i punti reali Regione
# Liguria esistono davvero (niente fallback qui: fuori da la' il pixel resta
# trasparente e si vede lo strato principale sotto, gia' generato sopra).
# E' spezzato in tessere piccole (non un rettangolo unico): la fascia coperta
# segue la costa in diagonale, un rettangolo unico che la racchiude sarebbe
# quasi tutto vuoto E supererebbe il limite di dimensione texture della GPU
# (~8-16k px per lato secondo la scheda video). Le tessere senza dato reale
# non vengono proprio scritte.
DETAIL_DIR = BACKEND_DIR.parent / "public" / "data" / "hillshade_detail"
DETAIL_MANIFEST_OUT = BACKEND_DIR.parent / "public" / "data" / "hillshade_detail_tiles.json"
DETAIL_RES_M = 2  # ancora una sotto-campionatura del dato vero (1x1m, multibeam 2012), non un ingrandimento
DETAIL_TILE_M = 2500  # lato di ogni tessera in metri -> 1250px per lato a 2m/pixel, ben sotto ogni limite GPU
# Area operativa dell'app (src/config/area.ts, AREA_BOUNDS) -- le tessere fuori
# da qui non servirebbero all'utente e non vengono generate.
APP_AREA_BOUNDS = ((9.53, 44.04), (9.82, 44.23))

# Niente rampa colore per profondita': un blu uniforme fa da base, cosi'
# tutto il contrasto visibile viene dal rilievo (luce/ombra). La profondita'
# resta leggibile dalle isobate/etichette disegnate sopra.
BASE_COLOR = (72, 140, 196)

SUN_AZIMUTH_DEG = 315.0  # nord-ovest, come le mappe di rilievo classiche
SUN_ALTITUDE_DEG = 45.0
VERTICAL_EXAGGERATION = 5.0  # ridotta rispetto a prima (8.0): ora il rilievo nella fascia costiera e' vero, non serve gonfiarlo tanto
SHADING_INTENSITY = 385  # +75% rispetto alla baseline originale (220): ampiezza max (livelli RGB) di luce/ombra
TARGET_RES_M = 6  # risoluzione del DEM composito nella fascia coperta da Regione Liguria (sorgente vera: 1x1m) -- alzata da 10 a 6 per ridurre la pixelizzazione a zoom alto: e' ancora una sotto-campionatura del dato vero (1m), non un'invenzione
MAX_TRIANGLE_EDGE_M = 120  # lato massimo di un triangolo di interpolazione accettato: oltre, e' un ponte tra tratti scollegati


def compute_hillshade(
    elevation: np.ndarray, dx_m: float, dy_m: float, sea: np.ndarray, stretch: tuple[float, float] | None = None
) -> tuple[np.ndarray, tuple[float, float]]:
    z = elevation * VERTICAL_EXAGGERATION
    dzdx = np.gradient(z, axis=1) / dx_m
    dzdy = -np.gradient(z, axis=0) / dy_m  # righe crescono verso sud, y geografica verso nord
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)

    az = np.radians(SUN_AZIMUTH_DEG)
    alt = np.radians(SUN_ALTITUDE_DEG)
    shade = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    shade = np.clip(shade, 0.0, 1.0)

    # Stiriamo il contrasto sui percentili calcolati SOLO sui pixel di mare,
    # cosi' i bordi terra/mare (pendenza artificiale, non reale) non falsano
    # la scala. Se viene passato uno 'stretch' gia' calcolato (dal layer
    # principale) lo riusiamo cosi' com'e', cosi' l'overlay di dettaglio ha
    # esattamente lo stesso contrasto/luminosita' e non si vede la cucitura.
    lo, hi = stretch if stretch is not None else np.percentile(shade[sea], [2, 98])
    if hi > lo:
        shade = np.clip((shade - lo) / (hi - lo), 0.0, 1.0)
    return shade, (lo, hi)


def main() -> None:
    t0 = time.time()
    with rasterio.open(TIF_PATH) as ds:
        elevation = ds.read(1).astype(float)
        bounds = ds.bounds
    rows, cols = elevation.shape
    print(f"EMODnet (fallback): {rows}x{cols} (~115m/pixel)")

    # --- 1. Estensione armonica di EMODnet sopra terra, a risoluzione
    # originale (economica): serve solo a dare un fallback liscio dove ne'
    # Regione Liguria ne' il mare EMODnet hanno dati (cioe' sotto la costa).
    sea0 = elevation < 0
    depth0 = np.where(sea0, -elevation, 0.0)
    depth_field = depth0.copy()
    for _ in range(400):
        depth_field = np.where(sea0, depth0, uniform_filter(depth_field, size=3))

    # --- 2. Griglia fine di destinazione, alla risoluzione reale dei dati
    # Regione Liguria (non un ingrandimento arbitrario di EMODnet).
    center_lat = (bounds.bottom + bounds.top) / 2
    deg_lat_m = 111_320.0
    deg_lon_m = 111_320.0 * np.cos(np.radians(center_lat))
    width_m = (bounds.right - bounds.left) * deg_lon_m
    height_m = (bounds.top - bounds.bottom) * deg_lat_m
    hi_cols = max(int(width_m / TARGET_RES_M), cols)
    hi_rows = max(int(height_m / TARGET_RES_M), rows)
    print(f"Griglia composita: {hi_rows}x{hi_cols} ({hi_rows*hi_cols/1e6:.1f} Mpixel, ~{TARGET_RES_M}m/pixel)")

    zoom_rc = (hi_rows / rows, hi_cols / cols)
    depth_fallback_hi = zoom(depth_field, zoom_rc, order=3)  # liscio per costruzione, spline sicura
    sea_frac_hi = zoom(sea0.astype(float), zoom_rc, order=1)  # mai overshoot, resta in [0,1]

    # --- 3. Interpolazione dei punti REALI Regione Liguria (multibeam 1x1m,
    # 2012) sulla stessa griglia fine. LinearNDInterpolator restituisce NaN
    # fuori dall'inviluppo convesso dei punti: e' esattamente il segnale che
    # ci serve per sapere "qui il dato vero non arriva, usa il fallback".
    pts = np.load(POINTS_PATH)
    print(f"Punti Regione Liguria: {len(pts['lon'])}")
    interp = LinearNDInterpolator(np.column_stack([pts["lon"], pts["lat"]]), pts["depth"])
    lon_fine = np.linspace(bounds.left, bounds.right, hi_cols)
    lat_fine = np.linspace(bounds.top, bounds.bottom, hi_rows)  # decrescente, come le righe (nord->sud)
    LON, LAT = np.meshgrid(lon_fine, lat_fine)
    depth_liguria_hi = interp(LON, LAT)

    # I punti sono vertici di linee di isobata (intervallo 1m), non un
    # tappeto continuo: interpolare TRA due linee adiacenti e' corretto (e'
    # il senso stesso di una ricostruzione da isobate), ma la triangolazione
    # di Delaunay "tappa" volentieri anche i buchi VERI tra tratti separati
    # del rilievo con triangoli lunghi e sottili — un ponte inventato, non
    # rilievo vero. La distanza dal punto piu' vicino da sola non li
    # distingue (tra due linee adiacenti su un fondale poco ripido la
    # distanza orizzontale puo' gia' essere ampia, ed e' comunque dato
    # legittimo). Il test corretto e' sulla dimensione del TRIANGOLO che
    # contiene ciascuna cella: un lato molto piu' lungo del previsto e'
    # la firma di un ponte fasullo tra tratti non collegati.
    xy_pts_m = np.column_stack([pts["lon"] * deg_lon_m, pts["lat"] * deg_lat_m])
    tri = interp.tri
    tri_pts_m = xy_pts_m[tri.simplices]  # (n_triangoli, 3, 2)
    edges = tri_pts_m[:, [0, 1, 2]] - tri_pts_m[:, [1, 2, 0]]
    max_edge_m = np.hypot(edges[..., 0], edges[..., 1]).max(axis=1)
    triangle_ok = max_edge_m < MAX_TRIANGLE_EDGE_M

    simplex_idx = tri.find_simplex(np.column_stack([LON.ravel(), LAT.ravel()]))
    inside = simplex_idx >= 0
    ok_flat = np.zeros(simplex_idx.shape, dtype=bool)
    ok_flat[inside] = triangle_ok[simplex_idx[inside]]

    liguria_valid = ~np.isnan(depth_liguria_hi) & ok_flat.reshape(LON.shape)
    coverage_pct = 100 * liguria_valid.mean()
    print(f"Copertura dati reali Regione Liguria nell'area (dopo filtro buchi): {coverage_pct:.0f}% dei pixel di mare")

    # --- 4. Composito: dato reale dove c'e', fallback liscio altrove
    # (mare EMODnet al largo, o estensione armonica sotto la costa).
    depth_hi = np.where(liguria_valid, depth_liguria_hi, depth_fallback_hi)
    sea_hi = liguria_valid | (sea_frac_hi > 0.5)

    dy_m = (bounds.top - bounds.bottom) / hi_rows * deg_lat_m
    dx_m = (bounds.right - bounds.left) / hi_cols * deg_lon_m

    shade, stretch = compute_hillshade(-depth_hi, dx_m, dy_m, sea_hi)
    # Aggiustamento ADDITIVO (non moltiplicativo) sopra un colore uniforme:
    # tutto il segnale visivo e' il rilievo, indipendente dalla luminosita'
    # del colore di base.
    shade_offset = (shade - 0.5) * SHADING_INTENSITY

    rgb = np.broadcast_to(np.array(BASE_COLOR, dtype=float), (hi_rows, hi_cols, 3))
    rgb_shaded = np.clip(rgb + shade_offset[..., None], 0, 255).astype(np.uint8)

    # Alpha: 255 dove abbiamo dato reale Regione Liguria (sempre mare, per
    # costruzione) o dove EMODnet dice mare (interpolazione lineare, mai
    # overshoot); 0 su terra.
    alpha = np.clip(np.maximum(liguria_valid.astype(float), sea_frac_hi) * 255, 0, 255).astype(np.uint8)

    rgba = np.dstack([rgb_shaded, alpha])
    img = Image.fromarray(rgba, mode="RGBA")

    PNG_OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(PNG_OUT)
    size_mb = PNG_OUT.stat().st_size / 1e6
    print(f"Scritta texture rilievo {img.size} ({size_mb:.1f} MB) su {PNG_OUT} in {time.time()-t0:.1f}s")

    corners = [
        [bounds.left, bounds.top],
        [bounds.right, bounds.top],
        [bounds.right, bounds.bottom],
        [bounds.left, bounds.bottom],
    ]
    BOUNDS_OUT.write_text(json.dumps({"coordinates": corners}), encoding="utf-8")
    print(f"Scritti angoli geografici su {BOUNDS_OUT}")

    generate_detail_overlay(pts, interp, tri, triangle_ok, deg_lon_m, deg_lat_m, stretch)


def generate_detail_overlay(pts, interp, tri, triangle_ok, deg_lon_m, deg_lat_m, stretch) -> None:
    """Overlay ad altissima risoluzione (2m/pixel), a tessere. Ogni tessera
    copre un quadrato di DETAIL_TILE_M metri; viene scritta solo se contiene
    davvero dato Regione Liguria (altrimenti sarebbe un file vuoto). Dentro
    ogni tessera, fuori dall'inviluppo triangolato dei punti reali il pixel
    resta trasparente: nessun fallback qui, e' un overlay puramente additivo
    sopra il layer principale gia' scritto sopra."""
    t0 = time.time()
    (area_lon_min, area_lat_min), (area_lon_max, area_lat_max) = APP_AREA_BOUNDS
    lon_min = max(float(pts["lon"].min()), area_lon_min)
    lon_max = min(float(pts["lon"].max()), area_lon_max)
    lat_min = max(float(pts["lat"].min()), area_lat_min)
    lat_max = min(float(pts["lat"].max()), area_lat_max)

    tile_deg_lon = DETAIL_TILE_M / deg_lon_m
    tile_deg_lat = DETAIL_TILE_M / deg_lat_m
    n_cols_tiles = max(int(np.ceil((lon_max - lon_min) / tile_deg_lon)), 1)
    n_rows_tiles = max(int(np.ceil((lat_max - lat_min) / tile_deg_lat)), 1)
    px_per_tile = int(DETAIL_TILE_M / DETAIL_RES_M)
    print(f"Overlay dettaglio: griglia di tessere {n_rows_tiles}x{n_cols_tiles}, {px_per_tile}px per lato a ~{DETAIL_RES_M}m/pixel")

    DETAIL_DIR.mkdir(parents=True, exist_ok=True)
    tiles_manifest = []
    n_written = 0

    for ti in range(n_rows_tiles):
        t_lat_max = lat_max - ti * tile_deg_lat
        t_lat_min = max(t_lat_max - tile_deg_lat, lat_min)
        for tj in range(n_cols_tiles):
            t_lon_min = lon_min + tj * tile_deg_lon
            t_lon_max = min(t_lon_min + tile_deg_lon, lon_max)

            lon_d = np.linspace(t_lon_min, t_lon_max, px_per_tile)
            lat_d = np.linspace(t_lat_max, t_lat_min, px_per_tile)  # decrescente, nord->sud come le righe immagine
            LON_D, LAT_D = np.meshgrid(lon_d, lat_d)
            depth_d = interp(LON_D, LAT_D)

            simplex_d = tri.find_simplex(np.column_stack([LON_D.ravel(), LAT_D.ravel()]))
            inside_d = simplex_d >= 0
            ok_d_flat = np.zeros(simplex_d.shape, dtype=bool)
            ok_d_flat[inside_d] = triangle_ok[simplex_d[inside_d]]
            valid_d = ~np.isnan(depth_d) & ok_d_flat.reshape(LON_D.shape)

            if not valid_d.any():
                continue  # nessun dato reale in questa tessera: non scriviamo un file vuoto

            dy_d_m = (t_lat_max - t_lat_min) / px_per_tile * deg_lat_m
            dx_d_m = (t_lon_max - t_lon_min) / px_per_tile * deg_lon_m

            # Le celle non valide (fuori inviluppo) sono trasparenti (alpha=0)
            # quindi il valore di rilievo li' e' irrilevante: usiamo 0 solo per
            # evitare NaN nel gradiente, non per rappresentare un fondale vero.
            elevation_d = -np.where(valid_d, depth_d, 0.0)
            shade_d, _ = compute_hillshade(elevation_d, dx_d_m, dy_d_m, valid_d, stretch=stretch)
            shade_d_offset = (shade_d - 0.5) * SHADING_INTENSITY

            rgb_d = np.broadcast_to(np.array(BASE_COLOR, dtype=float), (px_per_tile, px_per_tile, 3))
            rgb_d_shaded = np.clip(rgb_d + shade_d_offset[..., None], 0, 255).astype(np.uint8)
            alpha_d = np.where(valid_d, 255, 0).astype(np.uint8)
            rgba_d = np.dstack([rgb_d_shaded, alpha_d])

            filename = f"tile_{ti}_{tj}.png"
            Image.fromarray(rgba_d, mode="RGBA").save(DETAIL_DIR / filename)
            tiles_manifest.append(
                {
                    "file": filename,
                    "coordinates": [
                        [t_lon_min, t_lat_max],
                        [t_lon_max, t_lat_max],
                        [t_lon_max, t_lat_min],
                        [t_lon_min, t_lat_min],
                    ],
                }
            )
            n_written += 1

    DETAIL_MANIFEST_OUT.write_text(json.dumps({"tiles": tiles_manifest}), encoding="utf-8")
    print(f"Scritte {n_written}/{n_rows_tiles*n_cols_tiles} tessere di dettaglio (le altre erano senza dato reale) in {time.time()-t0:.1f}s")
    print(f"Manifest tessere su {DETAIL_MANIFEST_OUT}")


if __name__ == "__main__":
    main()
