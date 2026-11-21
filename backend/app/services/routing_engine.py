"""Weighted graph routing engine (A* / Dijkstra) — Owner: Persona B (feat/backend-b).

Pure, database-independent pathfinding supporting:
- Hard blocks from active blocking incidents & simulated blocked nodes/edges
- Reduced mobility filtering (excludes stairs and non-accessible edges)
- Dynamic edge weight penalties: warning incidents (x1.8) and rain avoidance (x2.5)
- Admissible 3D Euclidean heuristic for A* and zero heuristic for Dijkstra
"""

from __future__ import annotations

import heapq
import math
from dataclasses import dataclass

from app.core.config import get_settings
from app.core.errors import APIError
from app.schemas.routes import (
    CalculateRouteRequest,
    CalculateRouteResponse,
    GraphEdge,
    GraphIncident,
    GraphNode,
    GraphStats,
    SearchAlgorithm,
    WeatherApplied,
    WeatherCondition,
)
from app.services.directions_builder import (
    build_avoided_conflicts,
    build_metrics,
    build_steps,
)

WARNING_WEIGHT_MULTIPLIER = 1.8
RAIN_WEIGHT_MULTIPLIER = 2.5
Z_HEURISTIC_FACTOR = 3.0


@dataclass(frozen=True)
class SearchResult:
    path_node_ids: list[str]
    path_edge_ids: list[str]
    edge_weights: list[float]
    total_weight: float
    nodes_explored: int


def _euclidean_3d(a: GraphNode, b: GraphNode) -> float:
    dx = a.x - b.x
    dy = a.y - b.y
    dz = (a.z - b.z) * Z_HEURISTIC_FACTOR
    return math.sqrt(dx * dx + dy * dy + dz * dz)


def _compute_admissible_scale(
    nodes_by_id: dict[str, GraphNode],
    edges: list[GraphEdge],
) -> float:
    """Scale factor ensuring the 3D Euclidean heuristic never overestimates edge weights.

    When node coordinates are in SVG canvas units (e.g., docs/openapi.yaml) rather than
    meters, scaling by the minimum weight-to-Euclidean ratio keeps A* strictly admissible
    so it always matches Dijkstra's optimal weight while guiding the search.
    """
    min_ratio = 1.0
    for edge in edges:
        u = nodes_by_id.get(edge.from_node_id)
        v = nodes_by_id.get(edge.to_node_id)
        if u is None or v is None:
            continue
        dist_3d = _euclidean_3d(u, v)
        if dist_3d > 0:
            base_cost = edge.distance_m * edge.base_weight
            ratio = base_cost / dist_3d
            if ratio < min_ratio:
                min_ratio = ratio
    return min_ratio


def _build_adjacency(
    nodes_by_id: dict[str, GraphNode],
    edges: list[GraphEdge],
    blocked_nodes: set[str],
    blocked_edges: set[str],
    warning_nodes: set[str],
    warning_edges: set[str],
    reduced_mobility: bool,
    rain_avoidance_active: bool,
    *,
    enable_floor_stairs: bool = True,
    enable_elevation_stairs: bool = True,
    stair_step_penalty_seconds: float = 0.7,
    elevation_slope_penalty_factor: float = 1.5,
) -> dict[str, list[tuple[str, GraphEdge, float]]]:
    adjacency: dict[str, list[tuple[str, GraphEdge, float]]] = {}

    for edge in edges:
        if edge.id in blocked_edges:
            continue
        if edge.from_node_id in blocked_nodes or edge.to_node_id in blocked_nodes:
            continue
        if reduced_mobility and (edge.edge_type == "stairs" or not edge.is_accessible):
            continue

        u = nodes_by_id.get(edge.from_node_id)
        v = nodes_by_id.get(edge.to_node_id)
        dz = abs(u.z - v.z) if (u is not None and v is not None) else 0
        is_floor_change = (u.floor != v.floor) if (u is not None and v is not None) else False

        if edge.edge_type == "stairs":
            if is_floor_change and not enable_floor_stairs:
                continue
            if not is_floor_change and dz > 0 and not enable_elevation_stairs:
                continue

        weight = float(edge.distance_m) * float(edge.base_weight)

        if dz > 0 and edge.edge_type != "elevator" and elevation_slope_penalty_factor > 0:
            weight += dz * elevation_slope_penalty_factor

        if edge.edge_type == "stairs" and stair_step_penalty_seconds > 0:
            estimated_steps = (
                max(1, dz * 5) if dz > 0 else max(1, round(edge.distance_m * 0.5))
            )
            weight += estimated_steps * stair_step_penalty_seconds * 0.5

        has_warning = (
            edge.id in warning_edges
            or edge.from_node_id in warning_nodes
            or edge.to_node_id in warning_nodes
        )
        if has_warning:
            weight *= WARNING_WEIGHT_MULTIPLIER

        if rain_avoidance_active and not edge.is_covered:
            weight *= RAIN_WEIGHT_MULTIPLIER

        weight = round(weight, 4)

        adjacency.setdefault(edge.from_node_id, []).append((edge.to_node_id, edge, weight))
        if edge.bidirectional:
            adjacency.setdefault(edge.to_node_id, []).append((edge.from_node_id, edge, weight))

    return adjacency


def run_shortest_path(
    *,
    nodes_by_id: dict[str, GraphNode],
    edges: list[GraphEdge],
    origin_node_id: str,
    destination_node_id: str,
    algorithm: SearchAlgorithm,
    blocked_nodes: set[str],
    blocked_edges: set[str],
    warning_nodes: set[str],
    warning_edges: set[str],
    reduced_mobility: bool,
    rain_avoidance_active: bool,
    enable_floor_stairs: bool | None = None,
    enable_elevation_stairs: bool | None = None,
    stair_step_penalty_seconds: float | None = None,
    elevation_slope_penalty_factor: float | None = None,
) -> SearchResult | None:
    """Run A* or Dijkstra on the filtered weighted graph."""
    if origin_node_id in blocked_nodes or destination_node_id in blocked_nodes:
        return None

    settings = get_settings()
    resolved_floor_stairs = (
        settings.enable_floor_stairs
        if enable_floor_stairs is None
        else enable_floor_stairs
    )
    resolved_elevation_stairs = (
        settings.enable_elevation_stairs
        if enable_elevation_stairs is None
        else enable_elevation_stairs
    )
    resolved_stair_penalty = (
        settings.stair_step_penalty_seconds
        if stair_step_penalty_seconds is None
        else stair_step_penalty_seconds
    )
    resolved_slope_factor = (
        settings.elevation_slope_penalty_factor
        if elevation_slope_penalty_factor is None
        else elevation_slope_penalty_factor
    )

    adjacency = _build_adjacency(
        nodes_by_id=nodes_by_id,
        edges=edges,
        blocked_nodes=blocked_nodes,
        blocked_edges=blocked_edges,
        warning_nodes=warning_nodes,
        warning_edges=warning_edges,
        reduced_mobility=reduced_mobility,
        rain_avoidance_active=rain_avoidance_active,
        enable_floor_stairs=resolved_floor_stairs,
        enable_elevation_stairs=resolved_elevation_stairs,
        stair_step_penalty_seconds=resolved_stair_penalty,
        elevation_slope_penalty_factor=resolved_slope_factor,
    )

    goal_node = nodes_by_id[destination_node_id]
    heuristic_scale = (
        _compute_admissible_scale(nodes_by_id, edges) if algorithm == "astar" else 0.0
    )

    def heuristic(node_id: str) -> float:
        if algorithm == "dijkstra":
            return 0.0
        return heuristic_scale * _euclidean_3d(nodes_by_id[node_id], goal_node)

    # Priority queue items: (f_score, g_score, node_id)
    open_heap: list[tuple[float, float, str]] = [
        (heuristic(origin_node_id), 0.0, origin_node_id)
    ]
    g_scores: dict[str, float] = {origin_node_id: 0.0}
    came_from: dict[str, tuple[str, GraphEdge, float]] = {}
    closed: set[str] = set()
    nodes_explored = 0

    while open_heap:
        _f_score, current_g, current_id = heapq.heappop(open_heap)
        if current_id in closed:
            continue

        closed.add(current_id)
        nodes_explored += 1

        if current_id == destination_node_id:
            path_nodes: list[str] = [current_id]
            path_edges: list[str] = []
            edge_weights: list[float] = []

            cursor = current_id
            while cursor in came_from:
                prev_id, edge, weight = came_from[cursor]
                path_nodes.append(prev_id)
                path_edges.append(edge.id)
                edge_weights.append(round(weight, 2))
                cursor = prev_id

            path_nodes.reverse()
            path_edges.reverse()
            edge_weights.reverse()

            return SearchResult(
                path_node_ids=path_nodes,
                path_edge_ids=path_edges,
                edge_weights=edge_weights,
                total_weight=round(current_g, 2),
                nodes_explored=nodes_explored,
            )

        for neighbor_id, edge, edge_weight in adjacency.get(current_id, []):
            if neighbor_id in closed:
                continue
            tentative_g = current_g + edge_weight
            if tentative_g < g_scores.get(neighbor_id, math.inf):
                g_scores[neighbor_id] = tentative_g
                came_from[neighbor_id] = (current_id, edge, edge_weight)
                f_score = tentative_g + heuristic(neighbor_id)
                heapq.heappush(open_heap, (f_score, tentative_g, neighbor_id))

    return None


def calculate_route_plan(
    *,
    request: CalculateRouteRequest,
    nodes: list[GraphNode],
    edges: list[GraphEdge],
    incidents: list[GraphIncident],
    weather_condition: WeatherCondition = "clear",
    rain_avoidance_active: bool = False,
    enable_floor_stairs: bool | None = None,
    enable_elevation_stairs: bool | None = None,
    stair_step_penalty_seconds: float | None = None,
    elevation_slope_penalty_factor: float | None = None,
) -> CalculateRouteResponse:
    """Validate inputs, execute weighted search, and assemble the contract response."""
    settings = get_settings()
    resolved_floor_stairs = (
        settings.enable_floor_stairs
        if enable_floor_stairs is None
        else enable_floor_stairs
    )
    resolved_elevation_stairs = (
        settings.enable_elevation_stairs
        if enable_elevation_stairs is None
        else enable_elevation_stairs
    )
    resolved_stair_penalty = (
        settings.stair_step_penalty_seconds
        if stair_step_penalty_seconds is None
        else stair_step_penalty_seconds
    )
    resolved_slope_factor = (
        settings.elevation_slope_penalty_factor
        if elevation_slope_penalty_factor is None
        else elevation_slope_penalty_factor
    )

    if request.origin_node_id == request.destination_node_id:
        raise APIError(
            status_code=400,
            code="VALIDATION_ERROR",
            message="El nodo de origen y el nodo de destino no pueden ser iguales.",
            details={
                "origin_node_id": request.origin_node_id,
                "destination_node_id": request.destination_node_id,
            },
        )

    nodes_by_id = {node.id: node for node in nodes}
    edges_by_id = {edge.id: edge for edge in edges}

    if request.origin_node_id not in nodes_by_id:
        raise APIError(
            status_code=404,
            code="NOT_FOUND",
            message=f"El nodo de origen '{request.origin_node_id}' no existe en el mapa del campus.",
            details={"origin_node_id": request.origin_node_id},
        )

    if request.destination_node_id not in nodes_by_id:
        raise APIError(
            status_code=404,
            code="NOT_FOUND",
            message=f"El nodo de destino '{request.destination_node_id}' no existe en el mapa del campus.",
            details={"destination_node_id": request.destination_node_id},
        )

    active_incidents = [inc for inc in incidents if inc.status == "active"]

    blocked_nodes: set[str] = set(request.simulated_blocked_node_ids)
    blocked_edges: set[str] = set(request.simulated_blocked_edge_ids)
    warning_nodes: set[str] = set()
    warning_edges: set[str] = set()
    blocking_incidents = [inc for inc in active_incidents if inc.severity == "blocking"]

    for inc in active_incidents:
        if inc.severity == "blocking":
            if inc.target_type == "node" and inc.node_id:
                blocked_nodes.add(inc.node_id)
            elif inc.target_type == "edge" and inc.edge_id:
                blocked_edges.add(inc.edge_id)
        elif inc.severity == "warning":
            if inc.target_type == "node" and inc.node_id:
                warning_nodes.add(inc.node_id)
            elif inc.target_type == "edge" and inc.edge_id:
                warning_edges.add(inc.edge_id)

    result = run_shortest_path(
        nodes_by_id=nodes_by_id,
        edges=edges,
        origin_node_id=request.origin_node_id,
        destination_node_id=request.destination_node_id,
        algorithm=request.algorithm,
        blocked_nodes=blocked_nodes,
        blocked_edges=blocked_edges,
        warning_nodes=warning_nodes,
        warning_edges=warning_edges,
        reduced_mobility=request.reduced_mobility,
        rain_avoidance_active=rain_avoidance_active,
        enable_floor_stairs=resolved_floor_stairs,
        enable_elevation_stairs=resolved_elevation_stairs,
        stair_step_penalty_seconds=resolved_stair_penalty,
        elevation_slope_penalty_factor=resolved_slope_factor,
    )

    if result is None:
        probe_nodes = set(request.simulated_blocked_node_ids)
        probe_edges = set(request.simulated_blocked_edge_ids)
        blocking_incident_ids: list[str] = []

        while blocking_incidents:
            probe = run_shortest_path(
                nodes_by_id=nodes_by_id,
                edges=edges,
                origin_node_id=request.origin_node_id,
                destination_node_id=request.destination_node_id,
                algorithm="dijkstra",
                blocked_nodes=probe_nodes,
                blocked_edges=probe_edges,
                warning_nodes=set(),
                warning_edges=set(),
                reduced_mobility=request.reduced_mobility,
                rain_avoidance_active=rain_avoidance_active,
                enable_floor_stairs=resolved_floor_stairs,
                enable_elevation_stairs=resolved_elevation_stairs,
                stair_step_penalty_seconds=resolved_stair_penalty,
                elevation_slope_penalty_factor=resolved_slope_factor,
            )
            if probe is None:
                break
            hit = False
            for inc in blocking_incidents:
                if inc.target_type == "node" and inc.node_id in probe.path_node_ids:
                    probe_nodes.add(inc.node_id)
                    hit = True
                elif inc.target_type == "edge" and inc.edge_id in probe.path_edge_ids:
                    probe_edges.add(inc.edge_id)
                    hit = True
                else:
                    continue
                if inc.id not in blocking_incident_ids:
                    blocking_incident_ids.append(inc.id)
            if not hit:
                break
        if request.reduced_mobility:
            raise APIError(
                status_code=422,
                code="NO_ACCESSIBLE_ROUTE",
                message=(
                    "No hay una ruta accesible disponible entre el origen y el destino "
                    "debido a las incidencias o bloqueos activos."
                ),
                details={"blocking_incident_ids": blocking_incident_ids},
            )
        raise APIError(
            status_code=422,
            code="ROUTE_NOT_FOUND",
            message=(
                "No existe una ruta viable entre el origen y el destino debido a "
                "los bloqueos activos en el campus."
            ),
            details={"blocking_incident_ids": blocking_incident_ids},
        )

    # Compare against the ideal incident-free route to surface genuinely avoided conflicts.
    ideal_result = (
        run_shortest_path(
            nodes_by_id=nodes_by_id,
            edges=edges,
            origin_node_id=request.origin_node_id,
            destination_node_id=request.destination_node_id,
            algorithm="dijkstra",
            blocked_nodes=set(request.simulated_blocked_node_ids),
            blocked_edges=set(request.simulated_blocked_edge_ids),
            warning_nodes=set(),
            warning_edges=set(),
            reduced_mobility=request.reduced_mobility,
            rain_avoidance_active=rain_avoidance_active,
            enable_floor_stairs=resolved_floor_stairs,
            enable_elevation_stairs=resolved_elevation_stairs,
            stair_step_penalty_seconds=resolved_stair_penalty,
            elevation_slope_penalty_factor=resolved_slope_factor,
        )
        if active_incidents
        else None
    )

    traversed_edges = [edges_by_id[edge_id] for edge_id in result.path_edge_ids]
    accessibility_verified = all(
        edge.is_accessible and edge.edge_type != "stairs" for edge in traversed_edges
    )

    metrics = build_metrics(
        path_node_ids=result.path_node_ids,
        traversed_edges=traversed_edges,
        nodes_by_id=nodes_by_id,
        reduced_mobility=request.reduced_mobility,
        stair_step_penalty_seconds=resolved_stair_penalty,
    )

    steps = build_steps(
        path_node_ids=result.path_node_ids,
        traversed_edges=traversed_edges,
        edge_weights=result.edge_weights,
        nodes_by_id=nodes_by_id,
    )

    avoided_conflicts = build_avoided_conflicts(
        active_incidents=active_incidents,
        ideal_node_ids=ideal_result.path_node_ids if ideal_result else [],
        ideal_edge_ids=ideal_result.path_edge_ids if ideal_result else [],
        actual_node_ids=result.path_node_ids,
        actual_edge_ids=result.path_edge_ids,
        nodes_by_id=nodes_by_id,
        edges_by_id=edges_by_id,
    )

    return CalculateRouteResponse(
        origin_node_id=request.origin_node_id,
        destination_node_id=request.destination_node_id,
        reduced_mobility=request.reduced_mobility,
        accessibility_verified=accessibility_verified,
        weather_applied=WeatherApplied(
            condition=weather_condition,
            rain_avoidance_active=rain_avoidance_active,
        ),
        metrics=metrics,
        graph_stats=GraphStats(
            algorithm_used=request.algorithm,
            total_weight=result.total_weight,
            nodes_explored=result.nodes_explored,
        ),
        path_node_ids=result.path_node_ids,
        path_edge_ids=result.path_edge_ids,
        steps=steps,
        avoided_conflicts=avoided_conflicts,
    )
