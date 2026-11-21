import type {
  AvoidedConflict,
  CalculateRouteRequest,
  CalculateRouteResponse,
  CampusBuilding,
  CampusEdge,
  CampusMapResponse,
  CampusNode,
  CreateIncidentRequest,
  ErrorCode,
  ErrorDetails,
  Incident,
  IncidentsListResponse,
  LocationItem,
  LocationsResponse,
  RouteStep,
  SearchAlgorithm,
  UpdateIncidentRequest,
  UpdatePreferencesRequest,
  UserProfile,
  WeatherResponse,
} from '@/api/types'

export class FallbackApiError extends Error {
  code: ErrorCode
  status: number
  details?: ErrorDetails

  constructor(code: ErrorCode, message: string, status = 500, details?: ErrorDetails) {
    super(message)
    this.name = 'FallbackApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

const BUILDINGS: CampusBuilding[] = [
  {
    id: 'bld-p',
    name: 'Edificio P (Federación)',
    x: 980,
    y: 60,
    width: 200,
    height: 115,
    floors: 1,
    color: '#0891B2',
  },
  {
    id: 'bld-c',
    name: 'Edificio C (Placeres)',
    x: 970,
    y: 380,
    width: 220,
    height: 120,
    floors: 1,
    color: '#4F46E5',
  },
  {
    id: 'bld-m',
    name: 'Edificio M (Informática)',
    x: 140,
    y: 580,
    width: 220,
    height: 130,
    floors: 1,
    color: '#D97706',
  },
  {
    id: 'bld-b',
    name: 'Edificio B (Biblioteca)',
    x: 1340,
    y: 690,
    width: 240,
    height: 140,
    floors: 2,
    color: '#059669',
  },
  {
    id: 'bld-a',
    name: 'Edificio A (Ingeniería)',
    x: 680,
    y: 870,
    width: 240,
    height: 145,
    floors: 2,
    color: '#2563EB',
  },
  {
    id: 'bld-f',
    name: 'Edificio F (Sur-Oriente)',
    x: 1660,
    y: 1070,
    width: 220,
    height: 130,
    floors: 1,
    color: '#7C3AED',
  },
]

const NODES: CampusNode[] = [
  {
    id: 'cc-acceso-espana',
    name: 'Acceso Principal Av. España',
    building: 'Exterior',
    floor: 1,
    node_type: 'entrance',
    x: 1080,
    y: 1320,
    z: 0,
    is_destination: true,
    landmark: 'Escalinata y acceso sur desde Av. España',
  },
  {
    id: 'cc-edificio-a-p1',
    name: 'Edificio A — Hall Central (Piso 1)',
    building: 'Edificio A',
    floor: 1,
    node_type: 'corridor',
    x: 860,
    y: 940,
    z: 4,
    is_destination: true,
    landmark: 'Patio central y accesos a aulas A',
  },
  {
    id: 'cc-ascensor-a-p1',
    name: 'Ascensor Edificio A (Piso 1)',
    building: 'Edificio A',
    floor: 1,
    node_type: 'elevator',
    x: 740,
    y: 940,
    z: 4,
    is_destination: false,
    landmark: 'Costado oeste del hall Edificio A',
  },
  {
    id: 'cc-ascensor-a-p2',
    name: 'Ascensor Edificio A (Piso 2)',
    building: 'Edificio A',
    floor: 2,
    node_type: 'elevator',
    x: 740,
    y: 940,
    z: 8,
    is_destination: true,
    landmark: 'Pasillo superior Edificio A',
  },
  {
    id: 'cc-edificio-b-p1',
    name: 'Edificio B — Patio Interior (Piso 1)',
    building: 'Edificio B',
    floor: 1,
    node_type: 'corridor',
    x: 1420,
    y: 760,
    z: 4,
    is_destination: true,
    landmark: 'Claustro central del Edificio B',
  },
  {
    id: 'cc-ascensor-b-p1',
    name: 'Ascensor Edificio B (Piso 1)',
    building: 'Edificio B',
    floor: 1,
    node_type: 'elevator',
    x: 1530,
    y: 760,
    z: 4,
    is_destination: false,
    landmark: 'Ala oriente Edificio B',
  },
  {
    id: 'cc-ascensor-b-p2',
    name: 'Ascensor Edificio B (Piso 2)',
    building: 'Edificio B',
    floor: 2,
    node_type: 'elevator',
    x: 1530,
    y: 760,
    z: 8,
    is_destination: true,
    landmark: 'Conexión superior Edificio B hacia A y C',
  },
  {
    id: 'cc-edificio-c-p1',
    name: 'Edificio C — Acceso Norte (Av. Placeres)',
    building: 'Edificio C',
    floor: 1,
    node_type: 'entrance',
    x: 1080,
    y: 440,
    z: 4,
    is_destination: true,
    landmark: 'Frente a Avenida Placeres',
  },
  {
    id: 'cc-rampa-b-c',
    name: 'Rampa Accesible B–C',
    building: 'Exterior',
    floor: 1,
    node_type: 'ramp',
    x: 1240,
    y: 580,
    z: 4,
    is_destination: false,
    landmark: 'Rampa techada entre Edificio B y Edificio C',
  },
  {
    id: 'cc-edificio-f',
    name: 'Edificio F (Piso 1)',
    building: 'Edificio F',
    floor: 1,
    node_type: 'room',
    x: 1770,
    y: 1135,
    z: 4,
    is_destination: true,
    landmark: 'Jardines sector sur-oriente',
  },
  {
    id: 'cc-edificio-m',
    name: 'Edificio M (Informática)',
    building: 'Edificio M',
    floor: 1,
    node_type: 'room',
    x: 250,
    y: 645,
    z: 4,
    is_destination: true,
    landmark: 'Costado poniente junto a la cancha',
  },
  {
    id: 'cc-edificio-p',
    name: 'Edificio P (Federación)',
    building: 'Edificio P',
    floor: 1,
    node_type: 'room',
    x: 1080,
    y: 118,
    z: 4,
    is_destination: true,
    landmark: 'Cruzando Av. Placeres por San Guillermo',
  },
  {
    id: 'cc-aula-a201',
    name: 'Aula A-201 — Ingeniería (Piso 2)',
    building: 'Edificio A',
    floor: 2,
    node_type: 'room',
    x: 860,
    y: 940,
    z: 8,
    is_destination: true,
    landmark: 'Sala de clases ala oriente Piso 2 Edificio A',
  },
  {
    id: 'cc-sala-b202',
    name: 'Sala de Estudio B-202 — Biblioteca (Piso 2)',
    building: 'Edificio B',
    floor: 2,
    node_type: 'room',
    x: 1420,
    y: 760,
    z: 8,
    is_destination: true,
    landmark: 'Sala silenciosa de lectura Piso 2 Biblioteca Central',
  },
  {
    id: 'cc-salida-placeres',
    name: 'Salida Norte — Av. Placeres',
    building: 'Exterior',
    floor: 1,
    node_type: 'entrance',
    x: 1420,
    y: 280,
    z: 6,
    is_destination: true,
    landmark: 'Portón peatonal norte hacia Av. Placeres',
  },
  {
    id: 'cc-salida-oriente',
    name: 'Salida Oriente — Portón Av. España',
    building: 'Exterior',
    floor: 1,
    node_type: 'entrance',
    x: 2020,
    y: 1135,
    z: 2,
    is_destination: true,
    landmark: 'Salida peatonal y vehicular sector jardines oriente',
  },
  {
    id: 'cc-explanada-espana',
    name: 'Explanada Monumental Av. España',
    building: 'Red Vial Pavimentada',
    floor: 1,
    node_type: 'corridor',
    x: 1080,
    y: 1135,
    z: 2,
    is_destination: true,
    landmark: 'Explanada pavimentada sur entre Portón Av. España, Frontis Edificio A y Jardines',
  },
  {
    id: 'cc-patio-central',
    name: 'Plaza Central del Claustro (Cruce Pavimentado)',
    building: 'Red Vial Pavimentada',
    floor: 1,
    node_type: 'corridor',
    x: 1080,
    y: 760,
    z: 4,
    is_destination: true,
    landmark: 'Plaza pavimentada central entre Edificio A, Claustro Edificio B y Paseo Poniente',
  },
  {
    id: 'cc-paseo-poniente',
    name: 'Paseo Pavimentado Poniente — Mirador Cancha',
    building: 'Red Vial Pavimentada',
    floor: 1,
    node_type: 'corridor',
    x: 540,
    y: 645,
    z: 4,
    is_destination: true,
    landmark: 'Calzada peatonal pavimentada junto a la cancha hacia Informática (Ed. M), Ed. A y Ed. C',
  },
  {
    id: 'cc-terraza-placeres',
    name: 'Crucero Pavimentado Terraza Placeres',
    building: 'Red Vial Pavimentada',
    floor: 1,
    node_type: 'corridor',
    x: 1080,
    y: 280,
    z: 5,
    is_destination: true,
    landmark: 'Cruce vial pavimentado norte entre Edificio C, Edificio P y Salida Av. Placeres',
  },
]

const EDGES: CampusEdge[] = [
  {
    id: 'cc-e1',
    from_node_id: 'cc-acceso-espana',
    to_node_id: 'cc-edificio-a-p1',
    distance_m: 55,
    base_weight: 1.4,
    edge_type: 'stairs',
    is_accessible: false,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e2',
    from_node_id: 'cc-acceso-espana',
    to_node_id: 'cc-edificio-f',
    distance_m: 95,
    base_weight: 1.15,
    edge_type: 'ramp',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e3',
    from_node_id: 'cc-edificio-f',
    to_node_id: 'cc-edificio-a-p1',
    distance_m: 65,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e4',
    from_node_id: 'cc-edificio-a-p1',
    to_node_id: 'cc-ascensor-a-p1',
    distance_m: 20,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e5',
    from_node_id: 'cc-ascensor-a-p1',
    to_node_id: 'cc-ascensor-a-p2',
    distance_m: 10,
    base_weight: 1.3,
    edge_type: 'elevator',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e6',
    from_node_id: 'cc-edificio-a-p1',
    to_node_id: 'cc-edificio-b-p1',
    distance_m: 40,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e7',
    from_node_id: 'cc-edificio-b-p1',
    to_node_id: 'cc-ascensor-b-p1',
    distance_m: 25,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e8',
    from_node_id: 'cc-ascensor-b-p1',
    to_node_id: 'cc-ascensor-b-p2',
    distance_m: 10,
    base_weight: 1.3,
    edge_type: 'elevator',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e9',
    from_node_id: 'cc-ascensor-a-p2',
    to_node_id: 'cc-ascensor-b-p2',
    distance_m: 45,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e10',
    from_node_id: 'cc-edificio-b-p1',
    to_node_id: 'cc-rampa-b-c',
    distance_m: 30,
    base_weight: 1.15,
    edge_type: 'ramp',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e11',
    from_node_id: 'cc-rampa-b-c',
    to_node_id: 'cc-edificio-c-p1',
    distance_m: 30,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e12',
    from_node_id: 'cc-edificio-c-p1',
    to_node_id: 'cc-edificio-p',
    distance_m: 70,
    base_weight: 1.0,
    edge_type: 'outdoor',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e13',
    from_node_id: 'cc-edificio-c-p1',
    to_node_id: 'cc-edificio-m',
    distance_m: 130,
    base_weight: 1.0,
    edge_type: 'outdoor',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e14',
    from_node_id: 'cc-ascensor-a-p2',
    to_node_id: 'cc-aula-a201',
    distance_m: 22,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e15',
    from_node_id: 'cc-ascensor-b-p2',
    to_node_id: 'cc-sala-b202',
    distance_m: 22,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e16',
    from_node_id: 'cc-edificio-a-p1',
    to_node_id: 'cc-aula-a201',
    distance_m: 14,
    base_weight: 1.35,
    edge_type: 'stairs',
    is_accessible: false,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e17',
    from_node_id: 'cc-edificio-b-p1',
    to_node_id: 'cc-sala-b202',
    distance_m: 14,
    base_weight: 1.35,
    edge_type: 'stairs',
    is_accessible: false,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e18',
    from_node_id: 'cc-edificio-c-p1',
    to_node_id: 'cc-salida-placeres',
    distance_m: 45,
    base_weight: 1.15,
    edge_type: 'ramp',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e19',
    from_node_id: 'cc-edificio-p',
    to_node_id: 'cc-salida-placeres',
    distance_m: 42,
    base_weight: 1.4,
    edge_type: 'stairs',
    is_accessible: false,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e20',
    from_node_id: 'cc-edificio-f',
    to_node_id: 'cc-salida-oriente',
    distance_m: 48,
    base_weight: 1.15,
    edge_type: 'ramp',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e21',
    from_node_id: 'cc-acceso-espana',
    to_node_id: 'cc-explanada-espana',
    distance_m: 32,
    base_weight: 1.0,
    edge_type: 'ramp',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e22',
    from_node_id: 'cc-explanada-espana',
    to_node_id: 'cc-edificio-a-p1',
    distance_m: 38,
    base_weight: 1.05,
    edge_type: 'ramp',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e23',
    from_node_id: 'cc-explanada-espana',
    to_node_id: 'cc-edificio-f',
    distance_m: 52,
    base_weight: 1.0,
    edge_type: 'outdoor',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e24',
    from_node_id: 'cc-edificio-a-p1',
    to_node_id: 'cc-patio-central',
    distance_m: 26,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e25',
    from_node_id: 'cc-patio-central',
    to_node_id: 'cc-edificio-b-p1',
    distance_m: 28,
    base_weight: 1.0,
    edge_type: 'corridor',
    is_accessible: true,
    is_covered: true,
    bidirectional: true,
  },
  {
    id: 'cc-e26',
    from_node_id: 'cc-patio-central',
    to_node_id: 'cc-paseo-poniente',
    distance_m: 48,
    base_weight: 1.0,
    edge_type: 'outdoor',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e27',
    from_node_id: 'cc-paseo-poniente',
    to_node_id: 'cc-edificio-m',
    distance_m: 44,
    base_weight: 1.0,
    edge_type: 'outdoor',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e28',
    from_node_id: 'cc-paseo-poniente',
    to_node_id: 'cc-edificio-c-p1',
    distance_m: 54,
    base_weight: 1.05,
    edge_type: 'ramp',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e29',
    from_node_id: 'cc-edificio-c-p1',
    to_node_id: 'cc-terraza-placeres',
    distance_m: 24,
    base_weight: 1.0,
    edge_type: 'outdoor',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
  {
    id: 'cc-e30',
    from_node_id: 'cc-terraza-placeres',
    to_node_id: 'cc-salida-placeres',
    distance_m: 24,
    base_weight: 1.0,
    edge_type: 'ramp',
    is_accessible: true,
    is_covered: false,
    bidirectional: true,
  },
]

let fallbackIncidents: Incident[] = [
  {
    id: 'cc-inc-1',
    target_type: 'node',
    node_id: 'cc-ascensor-a-p1',
    edge_id: null,
    conflict_type: 'elevator_broken',
    severity: 'blocking',
    status: 'active',
    description: 'Ascensor Edificio A en mantención',
    reported_at: '2026-11-21T10:15:00Z',
    resolved_at: null,
  },
]

let nextIncidentNum = 2

export function syncFallbackIncident(incident: Incident): void {
  const idx = fallbackIncidents.findIndex((i) => i.id === incident.id)
  if (idx >= 0) {
    fallbackIncidents = fallbackIncidents.map((item, i) => (i === idx ? incident : item))
  } else {
    fallbackIncidents = [incident, ...fallbackIncidents]
  }
}

export function getFallbackIncidents(): Incident[] {
  return [...fallbackIncidents]
}

let fallbackProfile: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'demo@campusroute.edu',
  full_name: 'Estudiante Demo',
  reduced_mobility: true,
  prefer_covered: false,
}

const NODE_BY_ID = new Map<string, CampusNode>(NODES.map((n) => [n.id, n]))
const EDGE_BY_ID = new Map<string, CampusEdge>(EDGES.map((e) => [e.id, e]))

interface SearchResult {
  pathNodeIds: string[]
  pathEdgeIds: string[]
  edgeWeights: number[]
  totalWeight: number
  nodesExplored: number
}

const NORMAL_SPEED_M_PER_S = 1.35
const REDUCED_MOBILITY_SPEED_M_PER_S = 1.0
const ELEVATOR_WAIT_SECONDS = 25.0

function parseEnvBool(val: unknown, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase()
    if (lower === 'false' || lower === '0' || lower === 'no') return false
    if (lower === 'true' || lower === '1' || lower === 'yes') return true
  }
  return fallback
}

function parseEnvNumber(val: unknown, fallback: number): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = Number(val)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function getStairElevationConfig() {
  return {
    enableFloorStairs: parseEnvBool(import.meta.env.VITE_ENABLE_FLOOR_STAIRS, true),
    enableElevationStairs: parseEnvBool(import.meta.env.VITE_ENABLE_ELEVATION_STAIRS, true),
    stairStepPenaltySeconds: Math.max(
      0,
      parseEnvNumber(import.meta.env.VITE_STAIR_STEP_PENALTY_SECONDS, 0.7),
    ),
    elevationSlopePenaltyFactor: Math.max(
      0,
      parseEnvNumber(import.meta.env.VITE_ELEVATION_SLOPE_PENALTY_FACTOR, 1.5),
    ),
  }
}

function heuristic3D(a: CampusNode, b: CampusNode, algorithm: SearchAlgorithm): number {
  if (algorithm === 'dijkstra') return 0
  const dx = (a.x - b.x) * 0.15
  const dy = (a.y - b.y) * 0.15
  const dz = (a.z - b.z) * 3
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function runShortestPath(params: {
  originId: string
  destId: string
  reducedMobility: boolean
  rainAvoidance: boolean
  algorithm: SearchAlgorithm
  blockedNodeIds: Set<string>
  blockedEdgeIds: Set<string>
  warningNodeIds: Set<string>
  warningEdgeIds: Set<string>
}): SearchResult | null {
  const {
    originId,
    destId,
    reducedMobility,
    rainAvoidance,
    algorithm,
    blockedNodeIds,
    blockedEdgeIds,
    warningNodeIds,
    warningEdgeIds,
  } = params

  const startNode = NODE_BY_ID.get(originId)
  const goalNode = NODE_BY_ID.get(destId)
  if (!startNode || !goalNode) return null
  if (blockedNodeIds.has(originId) || blockedNodeIds.has(destId)) return null

  const gScore = new Map<string, number>([[originId, 0]])
  const fScore = new Map<string, number>([[originId, heuristic3D(startNode, goalNode, algorithm)]])
  const cameFrom = new Map<string, { prevNodeId: string; edgeId: string; edgeWeight: number }>()
  const openSet = new Set<string>([originId])
  const closedSet = new Set<string>()

  while (openSet.size > 0) {
    let currentId: string | null = null
    let bestF = Infinity
    for (const candidate of openSet) {
      const f = fScore.get(candidate) ?? Infinity
      if (f < bestF) {
        bestF = f
        currentId = candidate
      }
    }

    if (!currentId) break
    if (currentId === destId) {
      const pathNodeIds: string[] = [destId]
      const pathEdgeIds: string[] = []
      const edgeWeights: number[] = []
      let curr = destId
      while (cameFrom.has(curr)) {
        const step = cameFrom.get(curr)!
        pathNodeIds.unshift(step.prevNodeId)
        pathEdgeIds.unshift(step.edgeId)
        edgeWeights.unshift(step.edgeWeight)
        curr = step.prevNodeId
      }
      const totalWeight = Number((gScore.get(destId) ?? 0).toFixed(1))
      return {
        pathNodeIds,
        pathEdgeIds,
        edgeWeights,
        totalWeight,
        nodesExplored: closedSet.size + 1,
      }
    }

    openSet.delete(currentId)
    closedSet.add(currentId)

    for (const edge of EDGES) {
      let neighborId: string | null = null
      if (edge.from_node_id === currentId) {
        neighborId = edge.to_node_id
      } else if (edge.bidirectional && edge.to_node_id === currentId) {
        neighborId = edge.from_node_id
      }
      if (!neighborId || closedSet.has(neighborId)) continue

      if (blockedEdgeIds.has(edge.id) || blockedNodeIds.has(neighborId)) continue
      const neighborNode = NODE_BY_ID.get(neighborId)
      if (!neighborNode) continue

      const currentNode = NODE_BY_ID.get(currentId)
      const dz = currentNode ? Math.abs(currentNode.z - neighborNode.z) : 0
      const isFloorChange = currentNode ? currentNode.floor !== neighborNode.floor : false
      const stairCfg = getStairElevationConfig()

      if (reducedMobility) {
        if (!edge.is_accessible || edge.edge_type === 'stairs') continue
        if (neighborNode.node_type === 'stairs' && neighborId !== destId) continue
      } else if (edge.edge_type === 'stairs') {
        if (isFloorChange && !stairCfg.enableFloorStairs) continue
        if (!isFloorChange && dz > 0 && !stairCfg.enableElevationStairs) continue
      }

      let weight = edge.distance_m * edge.base_weight
      if (rainAvoidance && !edge.is_covered) {
        weight *= 2.5
      }
      if (
        warningEdgeIds.has(edge.id) ||
        warningNodeIds.has(currentId) ||
        warningNodeIds.has(neighborId)
      ) {
        weight *= 1.8
      }
      if (dz > 0 && edge.edge_type !== 'elevator' && stairCfg.elevationSlopePenaltyFactor > 0) {
        weight += dz * stairCfg.elevationSlopePenaltyFactor
      }
      if (edge.edge_type === 'stairs' && stairCfg.stairStepPenaltySeconds > 0) {
        const estimatedSteps =
          dz > 0 ? Math.max(1, dz * 5) : Math.max(1, Math.round(edge.distance_m * 0.5))
        weight += estimatedSteps * stairCfg.stairStepPenaltySeconds * 0.5
      }
      weight = Number(weight.toFixed(1))

      const tentativeG = (gScore.get(currentId) ?? Infinity) + weight
      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, {
          prevNodeId: currentId,
          edgeId: edge.id,
          edgeWeight: weight,
        })
        gScore.set(neighborId, tentativeG)
        fScore.set(neighborId, tentativeG + heuristic3D(neighborNode, goalNode, algorithm))
        openSet.add(neighborId)
      }
    }
  }

  return null
}

function buildStepInstruction(
  fromNode: CampusNode,
  toNode: CampusNode,
  edge: CampusEdge,
): string {
  if (edge.edge_type === 'elevator') {
    const dir = toNode.floor > fromNode.floor || toNode.z > fromNode.z ? 'Sube' : 'Baja'
    return `${dir} en ${fromNode.name} hasta el piso ${toNode.floor}.`
  }
  if (edge.edge_type === 'stairs') {
    const dir = toNode.floor > fromNode.floor || toNode.z > fromNode.z ? 'Sube' : 'Baja'
    const kind = edge.is_covered ? 'cubiertas' : 'exteriores'
    if (fromNode.floor === toNode.floor) {
      return `${dir} por las escaleras ${kind} (${edge.distance_m} m) hasta ${toNode.name}.`
    }
    return `${dir} por las escaleras ${kind} (${edge.distance_m} m) hacia el piso ${toNode.floor} hasta ${toNode.name}.`
  }
  if (edge.edge_type === 'ramp') {
    const coverLabel = edge.is_covered ? 'cubierta' : 'exterior'
    if (toNode.node_type === 'ramp') {
      return `Desde ${fromNode.name}, toma ${toNode.name} (${edge.distance_m} m, ${coverLabel}).`
    }
    if (fromNode.node_type === 'ramp') {
      return `Continúa ${edge.distance_m} m por ${fromNode.name} (${coverLabel}) hasta ${toNode.name}.`
    }
    return `Desde ${fromNode.name}, toma la rampa (${edge.distance_m} m, ${coverLabel}) hacia ${toNode.name}.`
  }
  if (edge.edge_type === 'outdoor') {
    return `Cruza ${edge.distance_m} m por el tramo exterior desde ${fromNode.name} hasta ${toNode.name}.`
  }
  return `Avanza ${edge.distance_m} m por el pasillo cubierto desde ${fromNode.name} hasta ${toNode.name}.`
}

function calculateFallbackRoute(req: CalculateRouteRequest): CalculateRouteResponse {
  if (!req.origin_node_id || !req.destination_node_id) {
    throw new FallbackApiError(
      'VALIDATION_ERROR',
      'Se requieren origin_node_id y destination_node_id.',
      400,
    )
  }
  if (req.origin_node_id === req.destination_node_id) {
    throw new FallbackApiError(
      'VALIDATION_ERROR',
      'El origen y el destino deben ser distintos.',
      400,
    )
  }
  if (!NODE_BY_ID.has(req.origin_node_id) || !NODE_BY_ID.has(req.destination_node_id)) {
    throw new FallbackApiError(
      'NOT_FOUND',
      'Uno de los nodos especificados no existe en el grafo del campus.',
      404,
    )
  }

  const algorithm: SearchAlgorithm = req.algorithm ?? 'astar'
  const reducedMobility = Boolean(req.reduced_mobility)
  const simulateRain = Boolean(req.simulate_rain)
  const preferCovered = Boolean(req.prefer_covered)
  const rainAvoidance = simulateRain || preferCovered

  const activeIncidents = fallbackIncidents.filter((i) => i.status === 'active')
  const blockedNodeIds = new Set<string>(req.simulated_blocked_node_ids ?? [])
  const blockedEdgeIds = new Set<string>(req.simulated_blocked_edge_ids ?? [])
  const warningNodeIds = new Set<string>()
  const warningEdgeIds = new Set<string>()

  for (const inc of activeIncidents) {
    if (inc.severity === 'blocking') {
      if (inc.target_type === 'node' && inc.node_id) blockedNodeIds.add(inc.node_id)
      if (inc.target_type === 'edge' && inc.edge_id) blockedEdgeIds.add(inc.edge_id)
    } else {
      if (inc.target_type === 'node' && inc.node_id) warningNodeIds.add(inc.node_id)
      if (inc.target_type === 'edge' && inc.edge_id) warningEdgeIds.add(inc.edge_id)
    }
  }

  const baselineResult = runShortestPath({
    originId: req.origin_node_id,
    destId: req.destination_node_id,
    reducedMobility,
    rainAvoidance,
    algorithm,
    blockedNodeIds: new Set(),
    blockedEdgeIds: new Set(),
    warningNodeIds: new Set(),
    warningEdgeIds: new Set(),
  })

  const actualResult = runShortestPath({
    originId: req.origin_node_id,
    destId: req.destination_node_id,
    reducedMobility,
    rainAvoidance,
    algorithm,
    blockedNodeIds,
    blockedEdgeIds,
    warningNodeIds,
    warningEdgeIds,
  })

  if (!actualResult) {
    const blockingIncidentIds = activeIncidents
      .filter((i) => i.severity === 'blocking')
      .map((i) => i.id)

    if (reducedMobility) {
      throw new FallbackApiError(
        'NO_ACCESSIBLE_ROUTE',
        'No hay ruta accesible disponible porque los pasos sin escalones se encuentran bloqueados por incidencias activas.',
        422,
        { blocking_incident_ids: blockingIncidentIds },
      )
    }
    throw new FallbackApiError(
      'ROUTE_NOT_FOUND',
      'No existe ruta disponible entre el origen y el destino con los bloqueos actuales.',
      422,
      { blocking_incident_ids: blockingIncidentIds },
    )
  }

  const avoidedConflicts: AvoidedConflict[] = []
  const baselineNodes = new Set(baselineResult?.pathNodeIds ?? [])
  const baselineEdges = new Set(baselineResult?.pathEdgeIds ?? [])
  const actualNodes = new Set(actualResult.pathNodeIds)
  const actualEdges = new Set(actualResult.pathEdgeIds)

  for (const inc of activeIncidents) {
    const targetId = inc.target_type === 'node' ? inc.node_id : inc.edge_id
    if (!targetId) continue
    const wasOnBaseline =
      inc.target_type === 'node' ? baselineNodes.has(targetId) : baselineEdges.has(targetId)
    const isAvoidedNow =
      inc.target_type === 'node' ? !actualNodes.has(targetId) : !actualEdges.has(targetId)

    if (wasOnBaseline && isAvoidedNow) {
      const targetName =
        inc.target_type === 'node'
          ? (NODE_BY_ID.get(targetId)?.name ?? targetId)
          : `Tramo ${targetId}`
      avoidedConflicts.push({
        incident_id: inc.id,
        target_name: targetName,
        conflict_type: inc.conflict_type,
        reason: `Evitado por incidencia activa (${inc.description}); ruta recalculada automáticamente.`,
      })
    }
  }

  let totalDistanceM = 0
  let elevatorSegments = 0
  let stairPenaltySecondsTotal = 0
  const stairCfg = getStairElevationConfig()
  const floorsSet = new Set<number>()
  let usesElevator = false
  let usesRamp = false
  let usesStairs = false
  const steps: RouteStep[] = []

  for (let i = 0; i < actualResult.pathEdgeIds.length; i++) {
    const edgeId = actualResult.pathEdgeIds[i]
    const fromId = actualResult.pathNodeIds[i]
    const toId = actualResult.pathNodeIds[i + 1]
    const edge = EDGE_BY_ID.get(edgeId)!
    const fromNode = NODE_BY_ID.get(fromId)!
    const toNode = NODE_BY_ID.get(toId)!

    totalDistanceM += edge.distance_m
    floorsSet.add(fromNode.floor)
    floorsSet.add(toNode.floor)
    if (edge.edge_type === 'elevator') {
      usesElevator = true
      elevatorSegments++
    }
    if (edge.edge_type === 'ramp') usesRamp = true
    if (edge.edge_type === 'stairs') {
      usesStairs = true
      const dz = Math.abs(toNode.z - fromNode.z)
      const estimatedSteps =
        dz > 0 ? Math.max(1, dz * 5) : Math.max(1, Math.round(edge.distance_m * 0.5))
      stairPenaltySecondsTotal += estimatedSteps * stairCfg.stairStepPenaltySeconds
    }

    steps.push({
      order: i + 1,
      from_node_id: fromId,
      to_node_id: toId,
      floor: toNode.floor,
      edge_type: edge.edge_type,
      distance_m: edge.distance_m,
      edge_weight: actualResult.edgeWeights[i],
      instruction: buildStepInstruction(fromNode, toNode, edge),
    })
  }

  const speed = reducedMobility ? REDUCED_MOBILITY_SPEED_M_PER_S : NORMAL_SPEED_M_PER_S
  const travelSeconds =
    totalDistanceM / speed + elevatorSegments * ELEVATOR_WAIT_SECONDS + stairPenaltySecondsTotal
  const estimatedTimeMin = Number(Math.max(0.1, travelSeconds / 60).toFixed(1))

  return {
    origin_node_id: req.origin_node_id,
    destination_node_id: req.destination_node_id,
    reduced_mobility: reducedMobility,
    accessibility_verified: !usesStairs,
    weather_applied: {
      condition: simulateRain ? 'rain' : 'clear',
      rain_avoidance_active: rainAvoidance,
    },
    metrics: {
      total_distance_m: totalDistanceM,
      estimated_time_min: estimatedTimeMin,
      floors_traversed: Array.from(floorsSet).sort((a, b) => a - b),
      uses_elevator: usesElevator,
      uses_ramp: usesRamp,
      uses_stairs: usesStairs,
    },
    graph_stats: {
      algorithm_used: algorithm,
      total_weight: actualResult.totalWeight,
      nodes_explored: actualResult.nodesExplored,
    },
    path_node_ids: actualResult.pathNodeIds,
    path_edge_ids: actualResult.pathEdgeIds,
    steps,
    avoided_conflicts: avoidedConflicts,
  }
}

export function handleFallbackRequest<T>(path: string, init: RequestInit = {}): T {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, 'http://localhost')
  const pathname = url.pathname
  const method = (init.method ?? 'GET').toUpperCase()
  let rawBody: unknown = undefined
  if (typeof init.body === 'string' && init.body) {
    try {
      rawBody = JSON.parse(init.body)
    } catch {
      throw new FallbackApiError('VALIDATION_ERROR', 'Cuerpo JSON inválido.', 400)
    }
  }

  if (method === 'GET' && pathname === '/api/v1/auth/me') {
    return { ...fallbackProfile } as unknown as T
  }

  if (method === 'PATCH' && pathname === '/api/v1/auth/preferences') {
    const patch = (rawBody ?? {}) as UpdatePreferencesRequest
    if (patch.reduced_mobility !== undefined) {
      fallbackProfile.reduced_mobility = Boolean(patch.reduced_mobility)
    }
    if (patch.prefer_covered !== undefined) {
      fallbackProfile.prefer_covered = Boolean(patch.prefer_covered)
    }
    return { ...fallbackProfile } as unknown as T
  }

  if (method === 'GET' && pathname === '/api/v1/campus/map') {
    const floorParam = url.searchParams.get('floor')
    const floorNum = floorParam !== null ? Number(floorParam) : undefined
    const nodes =
      floorNum !== undefined && !Number.isNaN(floorNum)
        ? NODES.filter((n) => n.floor === floorNum)
        : NODES
    const nodeIds = new Set(nodes.map((n) => n.id))
    const edges =
      floorNum !== undefined && !Number.isNaN(floorNum)
        ? EDGES.filter((e) => nodeIds.has(e.from_node_id) || nodeIds.has(e.to_node_id))
        : EDGES

    const res: CampusMapResponse = {
      campus_name: 'UTFSM Casa Central — Campus Simulado',
      viewbox: { width: 2200, height: 1450 },
      floors: [1, 2],
      buildings: BUILDINGS,
      nodes,
      edges,
      active_incidents: fallbackIncidents.filter((i) => i.status === 'active'),
    }
    return res as unknown as T
  }

  if (method === 'GET' && pathname === '/api/v1/campus/locations') {
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase()
    const floorParam = url.searchParams.get('floor')
    const floorNum = floorParam !== null ? Number(floorParam) : undefined

    const items: LocationItem[] = NODES.filter((n) => n.is_destination)
      .filter((n) => (floorNum !== undefined && !Number.isNaN(floorNum) ? n.floor === floorNum : true))
      .filter((n) =>
        search
          ? n.name.toLowerCase().includes(search) ||
            n.building.toLowerCase().includes(search) ||
            n.landmark.toLowerCase().includes(search)
          : true,
      )
      .map((n) => ({
        id: n.id,
        name: n.name,
        building: n.building,
        floor: n.floor,
        node_type: n.node_type,
        landmark: n.landmark,
      }))

    const res: LocationsResponse = { items }
    return res as unknown as T
  }

  if (method === 'GET' && pathname === '/api/v1/incidents') {
    const statusParam = url.searchParams.get('status') ?? 'active'
    const items =
      statusParam === 'all'
        ? [...fallbackIncidents]
        : fallbackIncidents.filter((i) => i.status === statusParam)
    const res: IncidentsListResponse = { items }
    return res as unknown as T
  }

  if (method === 'POST' && pathname === '/api/v1/incidents') {
    const body = (rawBody ?? {}) as CreateIncidentRequest
    const desc = (body.description ?? '').trim()
    if (desc.length < 3 || desc.length > 280) {
      throw new FallbackApiError(
        'VALIDATION_ERROR',
        'La descripción debe tener entre 3 y 280 caracteres.',
        400,
      )
    }
    if (body.target_type === 'node' && (!body.node_id || !NODE_BY_ID.has(body.node_id))) {
      throw new FallbackApiError('VALIDATION_ERROR', 'Selecciona un nodo válido del campus.', 400)
    }
    if (body.target_type === 'edge' && (!body.edge_id || !EDGE_BY_ID.has(body.edge_id))) {
      throw new FallbackApiError('VALIDATION_ERROR', 'Selecciona un tramo válido del campus.', 400)
    }

    const created: Incident = {
      id: `cc-inc-${nextIncidentNum++}`,
      target_type: body.target_type,
      node_id: body.target_type === 'node' ? (body.node_id ?? null) : null,
      edge_id: body.target_type === 'edge' ? (body.edge_id ?? null) : null,
      conflict_type: body.conflict_type,
      severity: body.severity,
      status: 'active',
      description: desc,
      reported_at: new Date().toISOString(),
      resolved_at: null,
    }
    fallbackIncidents = [created, ...fallbackIncidents]
    return created as unknown as T
  }

  const incidentMatch = pathname.match(/^\/api\/v1\/incidents\/([^/]+)$/)
  if (method === 'PATCH' && incidentMatch) {
    const incidentId = decodeURIComponent(incidentMatch[1])
    const body = (rawBody ?? {}) as UpdateIncidentRequest
    const idx = fallbackIncidents.findIndex((i) => i.id === incidentId)
    if (idx === -1) {
      throw new FallbackApiError('NOT_FOUND', `Incidencia ${incidentId} no encontrada.`, 404)
    }
    const existing = fallbackIncidents[idx]
    const nextStatus = body.status ?? existing.status
    const updated: Incident = {
      ...existing,
      status: nextStatus,
      severity: body.severity ?? existing.severity,
      description: body.description !== undefined ? body.description.trim() : existing.description,
      resolved_at:
        nextStatus === 'resolved'
          ? (existing.resolved_at ?? new Date().toISOString())
          : null,
    }
    fallbackIncidents = fallbackIncidents.map((item, i) => (i === idx ? updated : item))
    return updated as unknown as T
  }

  if (method === 'POST' && pathname === '/api/v1/routes/calculate') {
    const body = (rawBody ?? {}) as CalculateRouteRequest
    return calculateFallbackRoute(body) as unknown as T
  }

  if (method === 'GET' && pathname === '/api/v1/external/weather') {
    const res: WeatherResponse = {
      temperature_c: 21.4,
      precipitation_mm: 0.0,
      condition: 'clear',
      rain_alert: false,
      source: 'open-meteo-fallback',
      fallback_used: true,
      fetched_at: new Date().toISOString(),
    }
    return res as unknown as T
  }

  throw new FallbackApiError('NOT_FOUND', `Ruta no encontrada: ${method} ${pathname}`, 404)
}
