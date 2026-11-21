"""Open-Meteo live weather integration with 5-min cache and silent fallback — Owner: Persona B.

Default coordinates: UTFSM Casa Central, Valparaíso (-33.0344, -71.5950),
overridable via CAMPUS_LAT and CAMPUS_LON environment variables.
"""

from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime, timezone
from weakref import WeakKeyDictionary

import httpx

from app.core.config import get_settings
from app.schemas.external import WeatherCondition, WeatherResponse

CACHE_TTL_SECONDS = 300.0
FALLBACK_CACHE_TTL_SECONDS = 15.0
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT_SECONDS = 3.0

_cached_weather: WeatherResponse | None = None
_cached_at_monotonic: float = 0.0
_weather_locks: WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Lock] = (
    WeakKeyDictionary()
)


def _get_weather_lock() -> asyncio.Lock:
    loop = asyncio.get_running_loop()
    lock = _weather_locks.get(loop)
    if lock is None:
        lock = asyncio.Lock()
        _weather_locks[loop] = lock
    return lock


def _is_cache_valid(now_mono: float) -> bool:
    if _cached_weather is None:
        return False
    ttl = FALLBACK_CACHE_TTL_SECONDS if _cached_weather.fallback_used else CACHE_TTL_SECONDS
    return (now_mono - _cached_at_monotonic) < ttl


def clear_weather_cache() -> None:
    """Reset in-memory weather cache (useful for tests)."""
    global _cached_weather, _cached_at_monotonic
    _cached_weather = None
    _cached_at_monotonic = 0.0


def map_wmo_code_to_condition(wmo_code: int | None) -> WeatherCondition:
    """Map Open-Meteo WMO weather interpretation codes to contract WeatherCondition."""
    if wmo_code is None:
        return "unknown"
    if wmo_code in (0, 1):
        return "clear"
    if wmo_code in (2, 3, 45, 48):
        return "cloudy"
    if wmo_code >= 95:
        return "storm"
    if 51 <= wmo_code <= 86:
        return "rain"
    return "unknown"


def _build_fallback_weather() -> WeatherResponse:
    return WeatherResponse(
        temperature_c=20.0,
        precipitation_mm=0.0,
        condition="unknown",
        rain_alert=False,
        source="open-meteo",
        fallback_used=True,
        fetched_at=datetime.now(timezone.utc),
    )


def _get_coordinates() -> tuple[float, float]:
    settings = get_settings()
    raw_lat = os.getenv("CAMPUS_LAT")
    raw_lon = os.getenv("CAMPUS_LON")
    try:
        lat = float(raw_lat) if raw_lat not in (None, "") else settings.campus_lat
        lon = float(raw_lon) if raw_lon not in (None, "") else settings.campus_lon
        return lat, lon
    except ValueError:
        return settings.campus_lat, settings.campus_lon


async def get_campus_weather() -> WeatherResponse:
    """Fetch current campus weather from Open-Meteo with 5-minute caching and safe fallback."""
    global _cached_weather, _cached_at_monotonic

    if _is_cache_valid(time.monotonic()):
        assert _cached_weather is not None
        return _cached_weather

    async with _get_weather_lock():
        if _is_cache_valid(time.monotonic()):
            assert _cached_weather is not None
            return _cached_weather

        lat, lon = _get_coordinates()
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,precipitation,weather_code",
        }

        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                response = await client.get(OPEN_METEO_URL, params=params)
                response.raise_for_status()
                payload = response.json()

            current = payload.get("current", {})
            temperature_c = float(current.get("temperature_2m", 20.0))
            precipitation_mm = float(current.get("precipitation", 0.0))
            raw_code = current.get("weather_code")
            wmo_code = int(raw_code) if raw_code is not None else None

            condition = map_wmo_code_to_condition(wmo_code)
            rain_alert = precipitation_mm > 0.0 or (wmo_code is not None and wmo_code >= 51)

            weather = WeatherResponse(
                temperature_c=round(temperature_c, 1),
                precipitation_mm=round(precipitation_mm, 2),
                condition=condition,
                rain_alert=rain_alert,
                source="open-meteo",
                fallback_used=False,
                fetched_at=datetime.now(timezone.utc),
            )
        except Exception:
            weather = _build_fallback_weather()

        _cached_weather = weather
        _cached_at_monotonic = time.monotonic()
        return weather
