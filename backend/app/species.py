import json
from dataclasses import dataclass
from functools import lru_cache

from .config import SPECIES_PROFILES_PATH


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
    notes: str

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


@lru_cache(maxsize=1)
def load_species_profiles() -> dict[str, SpeciesProfile]:
    with open(SPECIES_PROFILES_PATH, encoding="utf-8") as f:
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
            notes=data["notes"],
        )
    return profiles
