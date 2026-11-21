"""Incidents CRUD router — Owner: Persona A (feat/backend-a)."""

from typing import Literal

from fastapi import APIRouter, Depends, Query

from app.core.auth import AuthenticatedUser, get_current_user
from app.schemas.incidents import (
    CreateIncidentRequest,
    Incident,
    IncidentsListResponse,
    UpdateIncidentRequest,
)
from app.services import incidents_service

router = APIRouter(prefix="/incidents")


@router.get("", response_model=IncidentsListResponse, operation_id="listIncidents")
def list_incidents(
    status: Literal["active", "resolved", "all"] = Query(default="active"),
) -> IncidentsListResponse:
    return incidents_service.list_incidents(status=status)


@router.post(
    "",
    status_code=201,
    response_model=Incident,
    operation_id="createIncident",
)
def create_incident(
    payload: CreateIncidentRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Incident:
    return incidents_service.create_incident(payload=payload, user=current_user)


@router.patch(
    "/{incidentId}",
    response_model=Incident,
    operation_id="updateIncident",
)
def update_incident(
    incidentId: str,
    payload: UpdateIncidentRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> Incident:
    return incidents_service.update_incident(
        incident_id=incidentId,
        payload=payload,
        user=current_user,
    )
