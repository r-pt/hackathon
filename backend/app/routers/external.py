"""Integración externa Open-Meteo — Dueño: Persona B."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/external")


@router.get("/weather")
async def get_campus_weather() -> dict:
    raise APIError(status_code=501, code="INTERNAL_ERROR", message="Pendiente: Persona B")
