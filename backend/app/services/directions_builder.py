"""Human-readable directions, metrics, and avoided conflicts builder — Owner: Persona B.

Builds:
- RouteMetrics (with profile-specific walking speed + elevator wait time)
- RouteStep list with landmark-enriched Spanish instructions
- AvoidedConflict list comparing the ideal incident-free path vs the actual path
"""

from __future__ import annotations

from app.schemas.routes import (
    AvoidedConflict,
    GraphEdge,
    GraphIncident,
    GraphNode,
    RouteMetrics,
    RouteStep,
)

NORMAL_SPEED_M_PER_S = 1.35
REDUCED_MOBILITY_SPEED_M_PER_S = 1.0
ELEVATOR_WAIT_SECONDS = 25.0


def build_metrics(
    *,
    path_node_ids: list[str],
    traversed_edges: list[GraphEdge],
    nodes_by_id: dict[str, GraphNode],
    reduced_mobility: bool,
) -> RouteMetrics:
    """Compute distance, profile-aware travel time, floors traversed, and accessibility flags."""
    total_distance_m = sum(edge.distance_m for edge in traversed_edges)
    elevator_segments = sum(1 for edge in traversed_edges if edge.edge_type == "elevator")

    speed = REDUCED_MOBILITY_SPEED_M_PER_S if reduced_mobility else NORMAL_SPEED_M_PER_S
    travel_seconds = (total_distance_m / speed) + (elevator_segments * ELEVATOR_WAIT_SECONDS)
    estimated_time_min = round(travel_seconds / 60.0, 1)

    floors_traversed: list[int] = []
    for node_id in path_node_ids:
        floor = nodes_by_id[node_id].floor
        if floor not in floors_traversed:
            floors_traversed.append(floor)

    return RouteMetrics(
        total_distance_m=total_distance_m,
        estimated_time_min=estimated_time_min,
        floors_traversed=floors_traversed,
        uses_elevator=elevator_segments > 0,
        uses_ramp=any(edge.edge_type == "ramp" for edge in traversed_edges),
        uses_stairs=any(edge.edge_type == "stairs" for edge in traversed_edges),
    )


def _format_step_instruction(
    *,
    step_index: int,
    total_steps: int,
    from_node: GraphNode,
    to_node: GraphNode,
    edge: GraphEdge,
) -> str:
    covered_tag = "cubierta" if edge.is_covered else "al aire libre"
    is_first = step_index == 0
    is_last = step_index == total_steps - 1

    if edge.edge_type == "elevator":
        direction = (
            "Sube"
            if (to_node.floor, to_node.z) >= (from_node.floor, from_node.z)
            else "Baja"
        )
        return (
            f"{direction} en {from_node.name} hasta el Piso {to_node.floor} "
            f"({to_node.name})."
        )

    if edge.edge_type == "stairs":
        direction = (
            "Sube"
            if (to_node.floor, to_node.z) >= (from_node.floor, from_node.z)
            else "Baja"
        )
        if from_node.floor == to_node.floor:
            return (
                f"{direction} por las escaleras desde {from_node.name} "
                f"({edge.distance_m} m) hasta {to_node.name}."
            )
        return (
            f"{direction} por {from_node.name} ({edge.distance_m} m) hasta el "
            f"Piso {to_node.floor}."
        )

    if edge.edge_type == "ramp":
        if from_node.node_type == "ramp" and to_node.node_type != "ramp":
            return (
                f"Toma {from_node.name} ({edge.distance_m} m, {covered_tag}) "
                f"hacia {to_node.name}."
            )
        prefix = f"Desde {from_node.name}, toma" if is_first else "Toma"
        if to_node.node_type != "ramp":
            return (
                f"{prefix} la rampa ({edge.distance_m} m, {covered_tag}) "
                f"hacia {to_node.name}."
            )
        return (
            f"{prefix} {to_node.name} ({edge.distance_m} m, {covered_tag}) "
            f"hacia {to_node.building}."
        )

    if edge.edge_type == "outdoor":
        prefix = f"Desde {from_node.name}, camina" if is_first else "Camina"
        landmark_hint = f" ({to_node.landmark})" if to_node.landmark else ""
        return (
            f"{prefix} {edge.distance_m} m por el tramo exterior hasta "
            f"{to_node.name}{landmark_hint}."
        )

    # Default: corridor
    if is_last:
        landmark_hint = f" — {to_node.landmark}" if to_node.landmark else ""
        return f"Avanza {edge.distance_m} m hasta llegar a {to_node.name}{landmark_hint}."

    if is_first:
        return (
            f"Desde {from_node.name}, avanza {edge.distance_m} m por el pasillo "
            f"hasta {to_node.name}."
        )

    corridor_label = "pasillo cubierto" if edge.is_covered else "pasillo"
    return f"Continúa {edge.distance_m} m por el {corridor_label} hasta {to_node.name}."


def build_steps(
    *,
    path_node_ids: list[str],
    traversed_edges: list[GraphEdge],
    edge_weights: list[float],
    nodes_by_id: dict[str, GraphNode],
) -> list[RouteStep]:
    """Build ordered turn-by-turn navigation steps matching RouteStep schema."""
    steps: list[RouteStep] = []
    total_steps = len(traversed_edges)

    for idx, (edge, weight) in enumerate(zip(traversed_edges, edge_weights)):
        from_node = nodes_by_id[path_node_ids[idx]]
        to_node = nodes_by_id[path_node_ids[idx + 1]]
        instruction = _format_step_instruction(
            step_index=idx,
            total_steps=total_steps,
            from_node=from_node,
            to_node=to_node,
            edge=edge,
        )
        steps.append(
            RouteStep(
                order=idx + 1,
                from_node_id=from_node.id,
                to_node_id=to_node.id,
                floor=to_node.floor,
                edge_type=edge.edge_type,
                distance_m=edge.distance_m,
                edge_weight=round(weight, 2),
                instruction=instruction,
            )
        )

    return steps


def _resolve_incident_target_name(
    incident: GraphIncident,
    nodes_by_id: dict[str, GraphNode],
    edges_by_id: dict[str, GraphEdge],
) -> str:
    if incident.target_type == "node" and incident.node_id:
        node = nodes_by_id.get(incident.node_id)
        return node.name if node else incident.node_id
    if incident.target_type == "edge" and incident.edge_id:
        edge = edges_by_id.get(incident.edge_id)
        if edge:
            u = nodes_by_id.get(edge.from_node_id)
            v = nodes_by_id.get(edge.to_node_id)
            if u and v:
                return f"Tramo {u.name} → {v.name}"
        return incident.edge_id
    return "Punto del campus"


def build_avoided_conflicts(
    *,
    active_incidents: list[GraphIncident],
    ideal_node_ids: list[str],
    ideal_edge_ids: list[str],
    actual_node_ids: list[str],
    actual_edge_ids: list[str],
    nodes_by_id: dict[str, GraphNode],
    edges_by_id: dict[str, GraphEdge],
) -> list[AvoidedConflict]:
    """Identify active incidents that intersected the ideal path and were avoided."""
    ideal_nodes = set(ideal_node_ids)
    ideal_edges = set(ideal_edge_ids)
    actual_nodes = set(actual_node_ids)
    actual_edges = set(actual_edge_ids)

    avoided: list[AvoidedConflict] = []

    for inc in active_incidents:
        hit_ideal = (
            (inc.target_type == "node" and inc.node_id in ideal_nodes)
            or (inc.target_type == "edge" and inc.edge_id in ideal_edges)
        )
        if not hit_ideal:
            continue

        still_used = (
            (inc.target_type == "node" and inc.node_id in actual_nodes)
            or (inc.target_type == "edge" and inc.edge_id in actual_edges)
        )
        if still_used:
            continue

        target_name = _resolve_incident_target_name(inc, nodes_by_id, edges_by_id)
        avoided.append(
            AvoidedConflict(
                incident_id=inc.id,
                target_name=target_name,
                conflict_type=inc.conflict_type,
                reason=(
                    f"Evitado automáticamente por incidencia activa ({inc.description}); "
                    "se recalculó una ruta alternativa segura."
                ),
            )
        )

    return avoided
