"""Service layer for campus incidents CRUD backed by Supabase."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.auth import AuthenticatedUser, get_or_create_user_profile
from app.core.errors import APIError
from app.db.supabase import get_supabase, get_user_supabase
from app.schemas.incidents import (
    CreateIncidentRequest,
    Incident,
    IncidentsListResponse,
    UpdateIncidentRequest,
)

VALID_STATUS_FILTERS = frozenset({"active", "resolved", "all"})
INCIDENT_COLUMNS = (
    "id, target_type, node_id, edge_id, conflict_type, severity, "
    "status, description, reported_at, resolved_at"
)


def list_incidents(status: str = "active") -> IncidentsListResponse:
    """List incidents filtered by status ('active', 'resolved', or 'all')."""
    if status not in VALID_STATUS_FILTERS:
        raise APIError(
            status_code=400,
            code="VALIDATION_ERROR",
            message="El filtro 'status' debe ser 'active', 'resolved' o 'all'.",
            details={"status": status},
        )

    supabase = get_supabase()
    query = supabase.table("incidents").select(INCIDENT_COLUMNS)
    if status != "all":
        query = query.eq("status", status)

    response = query.order("reported_at", desc=True).execute()
    items = [Incident.model_validate(row) for row in (response.data or [])]
    return IncidentsListResponse(items=items)


def _ensure_target_exists(
    payload: CreateIncidentRequest,
    access_token: str | None = None,
) -> None:
    supabase = get_user_supabase(access_token)

    if payload.target_type == "node":
        response = (
            supabase.table("nodes")
            .select("id")
            .eq("id", payload.node_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            raise APIError(
                status_code=400,
                code="VALIDATION_ERROR",
                message=f"El nodo '{payload.node_id}' no existe en el grafo del campus.",
                details={"node_id": payload.node_id},
            )
    else:
        response = (
            supabase.table("edges")
            .select("id")
            .eq("id", payload.edge_id)
            .limit(1)
            .execute()
        )
        if not response.data:
            raise APIError(
                status_code=400,
                code="VALIDATION_ERROR",
                message=f"La arista '{payload.edge_id}' no existe en el grafo del campus.",
                details={"edge_id": payload.edge_id},
            )


def create_incident(
    payload: CreateIncidentRequest,
    user: AuthenticatedUser,
) -> Incident:
    """Validate target node/edge, ensure reporter profile, and create incident."""
    _ensure_target_exists(payload, user.access_token)
    get_or_create_user_profile(user)

    now_iso = datetime.now(timezone.utc).isoformat()
    incident_id = f"inc-{uuid4().hex[:8]}"

    record: dict[str, Any] = {
        "id": incident_id,
        "target_type": payload.target_type,
        "node_id": payload.node_id if payload.target_type == "node" else None,
        "edge_id": payload.edge_id if payload.target_type == "edge" else None,
        "conflict_type": payload.conflict_type,
        "severity": payload.severity,
        "status": "active",
        "description": payload.description,
        "reported_by": user.id,
        "reported_at": now_iso,
        "resolved_at": None,
    }

    supabase = get_user_supabase(user.access_token)
    response = supabase.table("incidents").insert(record).execute()
    rows = response.data or []
    created = rows[0] if rows else record
    return Incident.model_validate(created)


def update_incident(
    incident_id: str,
    payload: UpdateIncidentRequest,
    user: AuthenticatedUser,
) -> Incident:
    """Update status, severity, or description of an existing incident."""
    if (
        payload.status is None
        and payload.severity is None
        and payload.description is None
    ):
        raise APIError(
            status_code=400,
            code="VALIDATION_ERROR",
            message="Debes enviar al menos un campo para actualizar.",
        )

    supabase = get_user_supabase(user.access_token)
    existing_resp = (
        supabase.table("incidents")
        .select(INCIDENT_COLUMNS)
        .eq("id", incident_id)
        .limit(1)
        .execute()
    )
    if not existing_resp.data:
        raise APIError(
            status_code=404,
            code="NOT_FOUND",
            message=f"No se encontró la incidencia '{incident_id}'.",
            details={"incident_id": incident_id},
        )

    updates: dict[str, Any] = {}
    if payload.status is not None:
        updates["status"] = payload.status
        if payload.status == "resolved":
            updates["resolved_at"] = datetime.now(timezone.utc).isoformat()
        elif payload.status == "active":
            updates["resolved_at"] = None

    if payload.severity is not None:
        updates["severity"] = payload.severity

    if payload.description is not None:
        updates["description"] = payload.description

    update_resp = (
        supabase.table("incidents")
        .update(updates)
        .eq("id", incident_id)
        .execute()
    )
    rows = update_resp.data or []
    updated = rows[0] if rows else {**existing_resp.data[0], **updates}
    return Incident.model_validate(updated)
