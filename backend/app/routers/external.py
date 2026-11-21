"""External integrations router (Open-Meteo) — Owner: Persona B (feat/backend-b)."""

from fastapi import APIRouter

from app.schemas.external import WeatherResponse
from app.services.weather_service import get_campus_weather

router = APIRouter(prefix="/external")


@router.get("/weather", response_model=WeatherResponse)
async def get_weather() -> WeatherResponse:
    """Return current campus weather from Open-Meteo (with 5-min cache and safe fallback)."""
    return await get_campus_weather()
