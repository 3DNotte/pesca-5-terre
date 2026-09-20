import json
from dataclasses import dataclass
from functools import lru_cache

from .config import BAIT_PROFILES_PATH, SPECIES_PROFILES_PATH


@dataclass
class HourlyBand:
    start: int
    end: int
    score: float


@dataclass
class SpeciesProfile:
    key: str
    label: str
    seasonality_by_month: list[float]  # 12 valori, indice 0 = gennaio
    hourly_bands: list[HourlyBand]
    disturbance_sensitivity: float
    structure_affinity: float
    # Range di profondita' realistico (metri, positivi) in cui la specie vive
    # davvero secondo le fonti consultate. None per i pelagici puri (tonni,
    # lampuga) la cui posizione dipende da rotte/correnti/oggetti galleggianti,
    # non dal fondale — per loro la profondita' non va vincolata.
    depth_range_m: tuple[float, float] | None
    notes: str
    # 'predator' = specie target; 'bait' = esca da catturare. gear_fit: quanto
    # ogni attrezzo e' adatto a catturare l'esca (0..1, stima da pratica di pesca).
    kind: str = "predator"
    gear_fit: dict[str, float] | None = None

    def seasonal_score(self, month: int) -> float:
        return self.seasonality_by_month[month - 1]

    def hourly_score(self, hour: int) -> float:
        for band in self.hourly_bands:
            if band.start <= band.end:
                if band.start <= hour < band.end:
                    return band.score
            else:  # fascia che attraversa la mezzanotte, es. 21-5
                if hour >= band.start or hour < band.end:
                    return band.score
        return 0.4


def _load_file(path, default_kind: str) -> dict[str, SpeciesProfile]:
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    profiles = {}
    for key, data in raw.items():
        profiles[key] = SpeciesProfile(
            key=key,
            label=data["label"],
            seasonality_by_month=data["seasonality_by_month"],
            hourly_bands=[HourlyBand(**b) for b in data["hourly_bands"]],
            disturbance_sensitivity=data["disturbance_sensitivity"],
            structure_affinity=data["structure_affinity"],
            depth_range_m=tuple(data["depth_range_m"]) if data.get("depth_range_m") else None,
            notes=data["notes"],
            kind=data.get("kind", default_kind),
            gear_fit=data.get("gear_fit"),
        )
    return profiles


@lru_cache(maxsize=1)
def load_species_profiles() -> dict[str, SpeciesProfile]:
    """Predatori + esche (chiave `kind`); i due file non hanno chiavi in comune."""
    return {**_load_file(SPECIES_PROFILES_PATH, "predator"), **_load_file(BAIT_PROFILES_PATH, "bait")}
