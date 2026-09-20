from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
# Griglia fine (~38 m, dati reali Regione Liguria sotto costa + EMODnet al
# largo) se costruita con scripts/build_fine_bathymetry.py; altrimenti EMODnet
# grezza (~115 m), che sotto costa e' troppo grossolana.
_FINE_BATHY = BASE_DIR / "data" / "bathymetry" / "amp_bathy_fine.tif"
BATHYMETRY_PATH = _FINE_BATHY if _FINE_BATHY.exists() else BASE_DIR / "data" / "bathymetry" / "amp_bathy.tif"
SPECIES_PROFILES_PATH = BASE_DIR / "data" / "species_profiles.json"
BAIT_PROFILES_PATH = BASE_DIR / "data" / "bait_profiles.json"
FERRY_SCHEDULE_PATH = BASE_DIR / "data" / "ferry_schedule.json"

# Centro dell'area operativa, usato come punto di richiesta per le API
# meteo/mare (l'area e' piccola, ~15km: le condizioni sono ragionevolmente
# uniformi, la variazione locale la fa l'esposizione della cella, non la
# posizione del punto di richiesta).
AREA_CENTER_LAT = 44.13
AREA_CENTER_LON = 9.675

# Pesi della formula di scoring (sezione 6 del progetto). Costanti esposte
# qui, non sparse nel codice, cosi' si possono ritarare con l'esperienza
# in barca senza toccare la logica.
WEIGHTS = {
    "w1_morfologia": 0.35,
    "w2_stagionale": 0.20,
    "w3_orario": 0.20,
    "w4_traffico": 0.20,
    "w5_meteo_mare": 0.10,  # ora integrato (Step 5): onda + esposizione della cella
}

# Raggio (m) entro cui una fermata traghetto sulla rotta genera pressione,
# e finestra (min) prima/dopo l'orario di passaggio in cui l'effetto e' massimo.
FERRY_IMPACT_RADIUS_M = 350
FERRY_IMPACT_WINDOW_MIN = 20

# Profondita' oltre la quale l'area non e' piu' rilevante per la traina
# lenta a vivo su specie costiere/strutturate (sezione 3 del progetto: fino
# a circa -150/-200m). Usato per non far vincere gli score sul largo abissale.
DEPTH_FULL_RELEVANCE_M = 150
DEPTH_ZERO_RELEVANCE_M = 300

# Fasce orarie euristiche per boat tour (section 5b.2 del progetto): non e' un
# dato misurato, va sempre etichettato come stima nell'interfaccia.
BOAT_TOUR_HOURS = [(10, 13), (15, 18)]
BOAT_TOUR_COAST_BAND_M = 300
