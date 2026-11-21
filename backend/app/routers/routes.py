"""Rutas A*/Dijkstra — Dueño: Persona B."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/routes")


@router.post("/calculate")
async def calculate_route() -> dict:
    raise APIError(status_code=501, code="INTERNAL_ERROR", message="Pendiente: Persona B")
