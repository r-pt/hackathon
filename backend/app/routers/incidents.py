"""Incidents CRUD router — Owner: Persona A (feat/backend-a)."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/incidents")


@router.get("")
async def list_incidents(status: str = "active") -> dict[str, str]:
    _ = status
    raise APIError(
        status_code=501,
        code="INTERNAL_ERROR",
        message="Pendiente de implementación por Persona A (ver docs/openapi.yaml).",
    )


@router.post("", status_code=201)
async def create_incident() -> dict[str, str]:
    raise APIError(
        status_code=501,
        code="INTERNAL_ERROR",
        message="Pendiente de implementación por Persona A (ver docs/openapi.yaml).",
    )


@router.patch("/{incident_id}")
async def update_incident(incident_id: str) -> dict[str, str]:
    _ = incident_id
    raise APIError(
        status_code=501,
        code="INTERNAL_ERROR",
        message="Pendiente de implementación por Persona A (ver docs/openapi.yaml).",
    )
