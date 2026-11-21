// Mirrors docs/openapi.yaml (source of truth).

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'NO_ACCESSIBLE_ROUTE'
  | 'ROUTE_NOT_FOUND'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL_ERROR'

export interface ErrorDetails {
  blocking_incident_ids?: string[]
  [key: string]: unknown
}

export interface ErrorResponse {
  error: { code: ErrorCode; message: string; details?: ErrorDetails }
}

export interface UserProfile {
  id: string
  email: string
  full_name: string
  reduced_mobility: boolean
  prefer_covered: boolean
}

export interface UpdatePreferencesRequest {
  reduced_mobility?: boolean
  prefer_covered?: boolean
}

export type NodeType = 'entrance' | 'room' | 'corridor' | 'elevator' | 'stairs' | 'ramp'
export type EdgeType = 'corridor' | 'stairs' | 'elevator' | 'ramp' | 'outdoor'
export type ConflictType =
  | 'elevator_broken'
  | 'stairs_blocked'
  | 'ramp_obstructed'
  | 'corridor_closed'
  | 'crowd_congestion'
export type IncidentSeverity = 'blocking' | 'warning'
export type IncidentStatus = 'active' | 'resolved'
export type SearchAlgorithm = 'astar' | 'dijkstra'

export interface CampusBuilding {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  floors: number
  color: string
}

export interface CampusNode {
  id: string
  name: string
  building: string
  floor: number
  node_type: NodeType
  x: number
  y: number
  /** meters; 0 = floor 1, 4 = floor 2 */
  z: number
  is_destination: boolean
  landmark: string
}

export interface CampusEdge {
  id: string
  from_node_id: string
  to_node_id: string
  distance_m: number
  base_weight: number
  edge_type: EdgeType
  is_accessible: boolean
  is_covered: boolean
  bidirectional: boolean
}

export interface Incident {
  id: string
  target_type: 'node' | 'edge'
  node_id?: string | null
  edge_id?: string | null
  conflict_type: ConflictType
  severity: IncidentSeverity
  status: IncidentStatus
  description: string
  reported_at: string
  resolved_at?: string | null
}

export interface CreateIncidentRequest {
  target_type: 'node' | 'edge'
  node_id?: string | null
  edge_id?: string | null
  conflict_type: ConflictType
  severity: IncidentSeverity
  /** 3-280 chars */
  description: string
}

export interface UpdateIncidentRequest {
  status?: IncidentStatus
  severity?: IncidentSeverity
  /** 3-280 chars */
  description?: string
}

export interface IncidentsListResponse {
  items: Incident[]
}

export interface CampusMapResponse {
  campus_name: string
  viewbox: { width: number; height: number }
  floors: number[]
  buildings: CampusBuilding[]
  nodes: CampusNode[]
  edges: CampusEdge[]
  active_incidents: Incident[]
}

export interface LocationItem {
  id: string
  name: string
  building: string
  floor: number
  node_type: NodeType
  landmark: string
}

export interface LocationsResponse {
  items: LocationItem[]
}

export interface CalculateRouteRequest {
  origin_node_id: string
  destination_node_id: string
  reduced_mobility: boolean
  prefer_covered?: boolean
  use_live_weather?: boolean
  simulate_rain?: boolean
  algorithm?: SearchAlgorithm
  simulated_blocked_node_ids?: string[]
  simulated_blocked_edge_ids?: string[]
}

export interface RouteStep {
  order: number
  from_node_id: string
  to_node_id: string
  floor: number
  edge_type: EdgeType
  distance_m: number
  edge_weight: number
  instruction: string
}

export interface AvoidedConflict {
  incident_id: string
  target_name: string
  conflict_type: ConflictType
  reason: string
}

export interface RouteMetrics {
  total_distance_m: number
  estimated_time_min: number
  floors_traversed: number[]
  uses_elevator: boolean
  uses_ramp: boolean
  uses_stairs: boolean
}

export interface GraphStats {
  algorithm_used: SearchAlgorithm
  total_weight: number
  nodes_explored: number
}

export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'storm' | 'unknown'

export interface CalculateRouteResponse {
  origin_node_id: string
  destination_node_id: string
  reduced_mobility: boolean
  accessibility_verified: boolean
  weather_applied: { condition: WeatherCondition; rain_avoidance_active: boolean }
  metrics: RouteMetrics
  graph_stats: GraphStats
  path_node_ids: string[]
  path_edge_ids: string[]
  steps: RouteStep[]
  avoided_conflicts: AvoidedConflict[]
}

export interface WeatherResponse {
  temperature_c: number
  precipitation_mm: number
  condition: WeatherCondition
  rain_alert: boolean
  source: string
  fallback_used: boolean
  fetched_at: string
}
