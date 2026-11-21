"""Mapa y ubicaciones del campus — Dueño: Persona A."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/campus")


def _todo() -> APIError:
    return APIError(status_code=501, code="INTERNAL_ERROR", message="Pendiente: Persona A")


@router.get("/map")
async def get_campus_map(floor: int | None = None) -> dict:
    raise _todo()


@router.get("/locations")
async def list_campus_locations(search: str | None = None, floor: int | None = None) -> dict:
    raise _todo()
