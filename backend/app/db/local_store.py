"""Thread-safe in-memory campus store for local/demo mode without Supabase.

ONLY used when `not get_settings().is_supabase_configured`.
Seeds the UTFSM Casa Central 6-building campus preset (20 nodes, 30 edges,
and initial incident `cc-inc-1`) from `graph_fixture.get_casa_central_graph()`,
plus a single demo student profile, so Persona A endpoints and Persona B's
routing engine share live mutable state.
"""

from __future__ import annotations

import threading
import unicodedata
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.errors import APIError
from app.schemas.auth import UpdatePreferencesRequest, UserProfile
from app.schemas.campus import (
    CampusBuilding,
    CampusEdge,
    CampusMapResponse,
    CampusNode,
    LocationItem,
    LocationsResponse,
    ViewBox,
)
from app.schemas.incidents import (
    CreateIncidentRequest,
    Incident,
    IncidentsListResponse,
    UpdateIncidentRequest,
)
from app.schemas.routes import GraphEdge, GraphIncident, GraphNode
from app.services.graph_fixture import get_casa_central_graph

SCHEMA_VERSION = 6
CAMPUS_NAME = "UTFSM Casa Central — Campus Simulado"
DEFAULT_VIEWBOX = ViewBox(width=1600, height=1050)
DEFAULT_FLOORS = [1, 2]
VALID_STATUS_FILTERS = frozenset({"active", "resolved", "all"})
MAX_LOCAL_INCIDENTS = 100

DEMO_USER_ID = "00000000-0000-0000-0000-000000000001"
DEMO_USER_EMAIL = "demo@campusroute.edu"
DEMO_USER_FULL_NAME = "Estudiante Demo"

_lock = threading.Lock()
_buildings: list[CampusBuilding] = []
_nodes: list[GraphNode] = []
_edges: list[GraphEdge] = []
_incidents: list[Incident] = []
_demo_profile: UserProfile | None = None


def _normalize_text(value: str) -> str:
    """Lowercase text and strip accents for forgiving case-insensitive search."""
    decomposed = unicodedata.normalize("NFKD", value.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _seed_buildings() -> list[CampusBuilding]:
    return [
        CampusBuilding(
            id="bld-p",
            name="Edificio P (Federación)",
            x=700,
            y=60,
            width=170,
            height=100,
            floors=1,
            color="#0891B2",
        ),
        CampusBuilding(
            id="bld-c",
            name="Edificio C (Placeres)",
            x=690,
            y=320,
            width=180,
            height=105,
            floors=1,
            color="#4F46E5",
        ),
        CampusBuilding(
            id="bld-m",
            name="Edificio M (Informática)",
            x=140,
            y=420,
            width=180,
            height=115,
            floors=1,
            color="#D97706",
        ),
        CampusBuilding(
            id="bld-b",
            name="Edificio B (Biblioteca)",
            x=980,
            y=520,
            width=210,
            height=120,
            floors=2,
            color="#059669",
        ),
        CampusBuilding(
            id="bld-a",
            name="Edificio A (Ingeniería)",
            x=520,
            y=650,
            width=210,
            height=125,
            floors=2,
            color="#2563EB",
        ),
        CampusBuilding(
            id="bld-f",
            name="Edificio F (Sur-Oriente)",
            x=1180,
            y=790,
            width=190,
            height=115,
            floors=1,
            color="#7C3AED",
        ),
    ]


def _seed_demo_profile() -> UserProfile:
    return UserProfile(
        id=DEMO_USER_ID,
        email=DEMO_USER_EMAIL,
        full_name=DEMO_USER_FULL_NAME,
        reduced_mobility=True,
        prefer_covered=False,
    )


def _seed_state_unlocked() -> None:
    global _buildings, _nodes, _edges, _incidents, _demo_profile
    nodes, edges, incidents = get_casa_central_graph()
    _buildings = _seed_buildings()
    _nodes = nodes
    _edges = edges
    _incidents = [Incident.model_validate(inc.model_dump()) for inc in incidents]
    _demo_profile = _seed_demo_profile()


def reset_local_store() -> None:
    """Reset the in-memory store back to its initial fixture state."""
    with _lock:
        _seed_state_unlocked()


# Initialize default seed on module import.
reset_local_store()


def get_local_campus_map(floor: int | None = None) -> CampusMapResponse:
    """Return the local 2.5D campus graph and active incidents, optionally filtered by floor."""
    with _lock:
        buildings = sorted(
            (b.model_copy() for b in _buildings),
            key=lambda b: b.id,
        )
        all_nodes = sorted(
            (CampusNode.model_validate(n.model_dump()) for n in _nodes),
            key=lambda n: (n.floor, n.id),
        )
        edges = sorted(
            (CampusEdge.model_validate(e.model_dump()) for e in _edges),
            key=lambda e: e.id,
        )
        active_incidents = sorted(
            (inc.model_copy() for inc in _incidents if inc.status == "active"),
            key=lambda inc: _ensure_utc(inc.reported_at),
            reverse=True,
        )

    floors = sorted({node.floor for node in all_nodes}) or list(DEFAULT_FLOORS)

    if floor is not None:
        nodes = [node for node in all_nodes if node.floor == floor]
        node_ids = {node.id for node in nodes}
        edges = [
            edge
            for edge in edges
            if edge.from_node_id in node_ids and edge.to_node_id in node_ids
        ]
        edge_ids = {edge.id for edge in edges}
        active_incidents = [
            incident
            for incident in active_incidents
            if (incident.target_type == "node" and incident.node_id in node_ids)
            or (incident.target_type == "edge" and incident.edge_id in edge_ids)
        ]
    else:
        nodes = all_nodes

    return CampusMapResponse(
        campus_name=CAMPUS_NAME,
        viewbox=DEFAULT_VIEWBOX,
        floors=floors,
        buildings=buildings,
        nodes=nodes,
        edges=edges,
        active_incidents=active_incidents,
    )


def list_local_locations(
    search: str | None = None,
    floor: int | None = None,
) -> LocationsResponse:
    """List selectable local origin/destination nodes with optional search and floor filters."""
    with _lock:
        items = [
            LocationItem(
                id=node.id,
                name=node.name,
                building=node.building,
                floor=node.floor,
                node_type=node.node_type,
                landmark=node.landmark,
            )
            for node in _nodes
            if node.is_destination and (floor is None or node.floor == floor)
        ]

    if search is not None and search.strip():
        raw_term = search.strip().lower()
        normalized_term = _normalize_text(raw_term)
        filtered_items: list[LocationItem] = []
        for item in items:
            fields = (item.name, item.building, item.landmark)
            if any(
                raw_term in field.lower() or normalized_term in _normalize_text(field)
                for field in fields
            ):
                filtered_items.append(item)
        items = filtered_items

    items.sort(key=lambda item: (item.floor, item.name.lower(), item.id))
    return LocationsResponse(items=items)


def list_local_incidents(status: str = "active") -> IncidentsListResponse:
    """List local incidents filtered by status ('active', 'resolved', or 'all')."""
    if status not in VALID_STATUS_FILTERS:
        raise APIError(
            status_code=400,
            code="VALIDATION_ERROR",
            message="El filtro 'status' debe ser 'active', 'resolved' o 'all'.",
            details={"status": status},
        )

    with _lock:
        items = [
            inc.model_copy()
            for inc in _incidents
            if status == "all" or inc.status == status
        ]

    items.sort(key=lambda inc: _ensure_utc(inc.reported_at), reverse=True)
    return IncidentsListResponse(items=items)


def create_local_incident(payload: CreateIncidentRequest) -> Incident:
    """Validate target node/edge and insert a new incident into the local store."""
    with _lock:
        if payload.target_type == "node":
            if not any(node.id == payload.node_id for node in _nodes):
                raise APIError(
                    status_code=400,
                    code="VALIDATION_ERROR",
                    message=f"El nodo '{payload.node_id}' no existe en el grafo del campus.",
                    details={"node_id": payload.node_id},
                )
        else:
            if not any(edge.id == payload.edge_id for edge in _edges):
                raise APIError(
                    status_code=400,
                    code="VALIDATION_ERROR",
                    message=f"La arista '{payload.edge_id}' no existe en el grafo del campus.",
                    details={"edge_id": payload.edge_id},
                )

        incident = Incident(
            id=f"inc-{uuid4().hex[:8]}",
            target_type=payload.target_type,
            node_id=payload.node_id if payload.target_type == "node" else None,
            edge_id=payload.edge_id if payload.target_type == "edge" else None,
            conflict_type=payload.conflict_type,
            severity=payload.severity,
            status="active",
            description=payload.description,
            reported_at=datetime.now(timezone.utc),
            resolved_at=None,
        )
        while len(_incidents) >= MAX_LOCAL_INCIDENTS:
            resolved_idx = next(
                (idx for idx, existing in enumerate(_incidents) if existing.status == "resolved"),
                None,
            )
            _incidents.pop(resolved_idx if resolved_idx is not None else 0)

        _incidents.append(incident)
        return incident.model_copy()


def update_local_incident(
    incident_id: str,
    payload: UpdateIncidentRequest,
) -> Incident:
    """Update status, severity, or description of an existing local incident."""
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

    with _lock:
        for idx, existing in enumerate(_incidents):
            if existing.id != incident_id:
                continue

            updates: dict[str, Any] = {}
            if payload.status is not None:
                updates["status"] = payload.status
                if payload.status == "resolved":
                    updates["resolved_at"] = datetime.now(timezone.utc)
                elif payload.status == "active":
                    updates["resolved_at"] = None

            if payload.severity is not None:
                updates["severity"] = payload.severity

            if payload.description is not None:
                updates["description"] = payload.description

            updated = existing.model_copy(update=updates)
            _incidents[idx] = updated
            return updated.model_copy()

    raise APIError(
        status_code=404,
        code="NOT_FOUND",
        message=f"No se encontró la incidencia '{incident_id}'.",
        details={"incident_id": incident_id},
    )


def get_local_graph() -> tuple[list[GraphNode], list[GraphEdge], list[GraphIncident]]:
    """Return copies of (nodes, edges, active_incidents) for the routing engine."""
    with _lock:
        nodes = [node.model_copy() for node in _nodes]
        edges = [edge.model_copy() for edge in _edges]
        active_incidents = [
            GraphIncident.model_validate(inc.model_dump())
            for inc in _incidents
            if inc.status == "active"
        ]
    return nodes, edges, active_incidents


def get_local_demo_profile() -> UserProfile:
    """Return a copy of the in-memory demo student profile."""
    with _lock:
        assert _demo_profile is not None
        return _demo_profile.model_copy()


def update_local_demo_preferences(payload: UpdatePreferencesRequest) -> UserProfile:
    """Update reduced_mobility and/or prefer_covered on the local demo profile."""
    global _demo_profile
    if payload.reduced_mobility is None and payload.prefer_covered is None:
        raise APIError(
            status_code=400,
            code="VALIDATION_ERROR",
            message="Debes enviar al menos una preferencia para actualizar.",
        )

    with _lock:
        assert _demo_profile is not None
        updates: dict[str, Any] = {}
        if payload.reduced_mobility is not None:
            updates["reduced_mobility"] = payload.reduced_mobility
        if payload.prefer_covered is not None:
            updates["prefer_covered"] = payload.prefer_covered
        _demo_profile = _demo_profile.model_copy(update=updates)
        return _demo_profile.model_copy()
