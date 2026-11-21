"""Pydantic schemas for weighted graph routing — Owner: Persona B (feat/backend-b).

Matches docs/openapi.yaml (Source of Truth) for POST /api/v1/routes/calculate.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

NodeType = Literal["entrance", "room", "corridor", "elevator", "stairs", "ramp"]
EdgeType = Literal["corridor", "stairs", "elevator", "ramp", "outdoor"]
ConflictType = Literal[
    "elevator_broken",
    "stairs_blocked",
    "ramp_obstructed",
    "corridor_closed",
    "crowd_congestion",
]
IncidentSeverity = Literal["blocking", "warning"]
IncidentStatus = Literal["active", "resolved"]
SearchAlgorithm = Literal["astar", "dijkstra"]
WeatherCondition = Literal["clear", "cloudy", "rain", "storm", "unknown"]


class GraphNode(BaseModel):
    """Internal/shared representation of a campus graph node (x, y, z)."""

    id: str
    name: str
    building: str
    floor: int = Field(ge=1)
    node_type: NodeType
    x: int
    y: int
    z: int
    is_destination: bool = False
    landmark: str = ""


class GraphEdge(BaseModel):
    """Internal/shared representation of a weighted campus graph edge."""

    id: str
    from_node_id: str
    to_node_id: str
    distance_m: int = Field(ge=1)
    base_weight: float = Field(ge=0.1)
    edge_type: EdgeType
    is_accessible: bool
    is_covered: bool
    bidirectional: bool = True


class GraphIncident(BaseModel):
    """Internal/shared representation of an active or resolved incident."""

    id: str
    target_type: Literal["node", "edge"]
    node_id: str | None = None
    edge_id: str | None = None
    conflict_type: ConflictType
    severity: IncidentSeverity
    status: IncidentStatus
    description: str
    reported_at: datetime | str | None = None
    resolved_at: datetime | str | None = None


class CalculateRouteRequest(BaseModel):
    """Request body for POST /api/v1/routes/calculate."""

    origin_node_id: str
    destination_node_id: str
    reduced_mobility: bool = False
    prefer_covered: bool = False
    use_live_weather: bool = True
    simulate_rain: bool = False
    algorithm: SearchAlgorithm = "astar"
    simulated_blocked_node_ids: list[str] = Field(default_factory=list)
    simulated_blocked_edge_ids: list[str] = Field(default_factory=list)


class WeatherApplied(BaseModel):
    """Weather context applied during route weight calculation."""

    condition: WeatherCondition
    rain_avoidance_active: bool


class RouteStep(BaseModel):
    """Single human-readable navigation step along the optimal route."""

    order: int = Field(ge=1)
    from_node_id: str
    to_node_id: str
    floor: int = Field(ge=1)
    edge_type: EdgeType
    distance_m: int = Field(ge=1)
    edge_weight: float
    instruction: str


class AvoidedConflict(BaseModel):
    """Incident automatically avoided by the routing engine."""

    incident_id: str
    target_name: str
    conflict_type: ConflictType
    reason: str


class RouteMetrics(BaseModel):
    """Summary metrics for the computed route."""

    total_distance_m: int = Field(ge=0)
    estimated_time_min: float = Field(ge=0.0)
    floors_traversed: list[int]
    uses_elevator: bool
    uses_ramp: bool
    uses_stairs: bool


class GraphStats(BaseModel):
    """Search algorithm telemetry for UI/demo comparison (A* vs Dijkstra)."""

    algorithm_used: SearchAlgorithm
    total_weight: float = Field(ge=0.0)
    nodes_explored: int = Field(ge=0)


class CalculateRouteResponse(BaseModel):
    """Response body for POST /api/v1/routes/calculate."""

    origin_node_id: str
    destination_node_id: str
    reduced_mobility: bool
    accessibility_verified: bool
    weather_applied: WeatherApplied
    metrics: RouteMetrics
    graph_stats: GraphStats
    path_node_ids: list[str]
    path_edge_ids: list[str]
    steps: list[RouteStep]
    avoided_conflicts: list[AvoidedConflict]
