"""Pydantic schemas for external integrations — Owner: Persona B (feat/backend-b).

Matches docs/openapi.yaml (Source of Truth) for GET /api/v1/external/weather.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

WeatherCondition = Literal["clear", "cloudy", "rain", "storm", "unknown"]


class WeatherResponse(BaseModel):
    """Response body for GET /api/v1/external/weather."""

    temperature_c: float
    precipitation_mm: float
    condition: WeatherCondition
    rain_alert: bool
    source: str = "open-meteo"
    fallback_used: bool = False
    fetched_at: datetime
