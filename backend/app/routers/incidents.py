"""Incidencias — Dueño: Persona A."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/incidents")


def _todo() -> APIError:
    return APIError(status_code=501, code="INTERNAL_ERROR", message="Pendiente: Persona A")


@router.get("")
async def list_incidents(status: str = "active") -> dict:
    raise _todo()


@router.post("", status_code=201)
async def create_incident() -> dict:
    raise _todo()


@router.patch("/{incident_id}")
async def update_incident(incident_id: str) -> dict:
    raise _todo()
