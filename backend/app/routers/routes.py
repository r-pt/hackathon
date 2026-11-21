"""Weighted graph routing router (A* / Dijkstra) — Owner: Persona B (feat/backend-b)."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.schemas.routes import (
    CalculateRouteRequest,
    CalculateRouteResponse,
    GraphEdge,
    GraphIncident,
    GraphNode,
    WeatherCondition,
)
from app.services.graph_fixture import get_sample_graph
from app.services.routing_engine import calculate_route_plan
from app.services.weather_service import get_campus_weather

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/routes")


def _parse_supabase_rows(
    nodes_rows: list[dict[str, Any]],
    edges_rows: list[dict[str, Any]],
    incidents_rows: list[dict[str, Any]],
) -> tuple[list[GraphNode], list[GraphEdge], list[GraphIncident]]:
    nodes = [GraphNode.model_validate(row) for row in nodes_rows]
    edges = [GraphEdge.model_validate(row) for row in edges_rows]
    incidents = [GraphIncident.model_validate(row) for row in incidents_rows]
    return nodes, edges, incidents


def load_campus_graph() -> tuple[list[GraphNode], list[GraphEdge], list[GraphIncident]]:
    """Load graph and active incidents from Supabase (Persona A) with local fixture fallback.

    Before Persona A merges `app.db.supabase.get_supabase()` in Hora 2 (or if Supabase env
    variables are not configured locally), this transparently falls back to `graph_fixture.py`.
    """
    try:
        from app.db.supabase import get_supabase  # type: ignore[import-not-found]

        supabase = get_supabase()
        nodes_resp = supabase.table("nodes").select("*").execute()
        edges_resp = supabase.table("edges").select("*").execute()
        incidents_resp = (
            supabase.table("incidents").select("*").eq("status", "active").execute()
        )

        nodes_data = getattr(nodes_resp, "data", None) or []
        edges_data = getattr(edges_resp, "data", None) or []
        incidents_data = getattr(incidents_resp, "data", None) or []

        if nodes_data and edges_data:
            return _parse_supabase_rows(nodes_data, edges_data, incidents_data)
    except Exception as exc:
        logger.debug("Using local graph fixture fallback (Supabase unavailable: %s)", exc)

    return get_sample_graph()


@router.post("/calculate", response_model=CalculateRouteResponse)
async def calculate_route(payload: CalculateRouteRequest) -> CalculateRouteResponse:
    """Calculate optimal route A->B using weighted A* or Dijkstra."""
    nodes, edges, incidents = load_campus_graph()

    weather_condition: WeatherCondition = "clear"
    live_rain_alert = False

    if payload.use_live_weather:
        weather = await get_campus_weather()
        weather_condition = weather.condition
        live_rain_alert = weather.rain_alert
    elif payload.simulate_rain:
        weather_condition = "rain"

    if payload.simulate_rain:
        weather_condition = "rain"

    rain_avoidance_active = (
        payload.prefer_covered
        or payload.simulate_rain
        or (payload.use_live_weather and live_rain_alert)
    )

    return calculate_route_plan(
        request=payload,
        nodes=nodes,
        edges=edges,
        incidents=incidents,
        weather_condition=weather_condition,
        rain_avoidance_active=rain_avoidance_active,
    )
