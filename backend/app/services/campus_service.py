"""Business logic for campus map and destination queries backed by Supabase."""

import unicodedata

from app.core.config import get_settings
from app.core.errors import APIError
from app.db.local_store import get_local_campus_map, list_local_locations
from app.db.supabase import get_supabase
from app.schemas.campus import (
    CampusBuilding,
    CampusEdge,
    CampusMapResponse,
    CampusNode,
    LocationItem,
    LocationsResponse,
    ViewBox,
)
from app.schemas.incidents import Incident

CAMPUS_NAME = "UTFSM Casa Central — Campus Simulado"
DEFAULT_VIEWBOX = ViewBox(width=1000, height=640)
DEFAULT_FLOORS = [1, 2]


def _normalize_text(value: str) -> str:
    """Lowercase text and strip accents for forgiving case-insensitive search."""
    decomposed = unicodedata.normalize("NFKD", value.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def get_campus_map(floor: int | None = None) -> CampusMapResponse:
    """Fetch the 2.5D campus graph and active incidents, optionally filtered by floor."""
    if not get_settings().is_supabase_configured:
        return get_local_campus_map(floor=floor)

    try:
        supabase = get_supabase()

        buildings_res = (
            supabase.table("buildings")
            .select("id, name, x, y, width, height, floors, color")
            .order("id")
            .execute()
        )
        nodes_res = (
            supabase.table("nodes")
            .select(
                "id, name, building, floor, node_type, x, y, z, is_destination, landmark"
            )
            .order("floor")
            .order("id")
            .execute()
        )
        edges_res = (
            supabase.table("edges")
            .select(
                "id, from_node_id, to_node_id, distance_m, base_weight, "
                "edge_type, is_accessible, is_covered, bidirectional"
            )
            .order("id")
            .execute()
        )
        incidents_res = (
            supabase.table("incidents")
            .select(
                "id, target_type, node_id, edge_id, conflict_type, severity, "
                "status, description, reported_at, resolved_at"
            )
            .eq("status", "active")
            .order("reported_at", desc=True)
            .execute()
        )

        buildings = [
            CampusBuilding.model_validate(row) for row in (buildings_res.data or [])
        ]
        all_nodes = [CampusNode.model_validate(row) for row in (nodes_res.data or [])]
        edges = [CampusEdge.model_validate(row) for row in (edges_res.data or [])]
        active_incidents = [
            Incident.model_validate(row) for row in (incidents_res.data or [])
        ]

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
    except APIError:
        raise
    except Exception as exc:
        raise APIError(
            status_code=500,
            code="INTERNAL_ERROR",
            message="No se pudo obtener el mapa del campus desde Supabase.",
        ) from exc


def list_campus_locations(
    search: str | None = None,
    floor: int | None = None,
) -> LocationsResponse:
    """List selectable origin/destination nodes, with optional search and floor filters."""
    if not get_settings().is_supabase_configured:
        return list_local_locations(search=search, floor=floor)

    try:
        supabase = get_supabase()

        query = (
            supabase.table("nodes")
            .select("id, name, building, floor, node_type, landmark")
            .eq("is_destination", True)
        )
        if floor is not None:
            query = query.eq("floor", floor)

        response = query.execute()
        items = [LocationItem.model_validate(row) for row in (response.data or [])]

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
    except APIError:
        raise
    except Exception as exc:
        raise APIError(
            status_code=500,
            code="INTERNAL_ERROR",
            message="No se pudieron obtener las ubicaciones del campus desde Supabase.",
        ) from exc
