"""External integrations router (Open-Meteo) — Owner: Persona B (feat/backend-b)."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/external")


@router.get("/weather")
async def get_campus_weather() -> dict[str, str]:
    raise APIError(
        status_code=501,
        code="INTERNAL_ERROR",
        message="Pendiente de implementación por Persona B (ver docs/openapi.yaml).",
    )
