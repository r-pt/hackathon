"""Campus map & locations router — Owner: Persona A (feat/backend-a)."""

from fastapi import APIRouter, Query

from app.schemas.campus import CampusMapResponse, LocationsResponse
from app.services import campus_service

router = APIRouter(prefix="/campus")


@router.get("/map", response_model=CampusMapResponse, operation_id="getCampusMap")
def get_campus_map(
    floor: int | None = Query(default=None, ge=1),
) -> CampusMapResponse:
    """Return the 2.5D campus graph and active incidents, optionally filtered by floor."""
    return campus_service.get_campus_map(floor=floor)


@router.get(
    "/locations",
    response_model=LocationsResponse,
    operation_id="listCampusLocations",
)
def list_campus_locations(
    search: str | None = Query(default=None),
    floor: int | None = Query(default=None, ge=1),
) -> LocationsResponse:
    """Return selectable campus origin/destination locations."""
    return campus_service.list_campus_locations(search=search, floor=floor)
