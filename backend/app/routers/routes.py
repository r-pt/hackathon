"""Weighted graph routing router (A* / Dijkstra) — Owner: Persona B (feat/backend-b)."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/routes")


@router.post("/calculate")
async def calculate_route() -> dict[str, str]:
    raise APIError(
        status_code=501,
        code="INTERNAL_ERROR",
        message="Pendiente de implementación por Persona B (ver docs/openapi.yaml).",
    )
