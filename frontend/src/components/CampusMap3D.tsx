import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type {
  CalculateRouteResponse,
  CampusBuilding,
  CampusEdge,
  CampusMapResponse,
  CampusNode,
  EdgeType,
  Incident,
  NodeType,
} from '@/api/types'

interface CampusMap3DProps {
  map: CampusMapResponse
  route?: CalculateRouteResponse
  originId?: string
  destId?: string
  floorView: 'stacked' | number
  onFloorViewChange?: (fv: 'stacked' | number) => void
  onSelectNode: (id: string) => void
  gpsActive?: boolean
  darkMode?: boolean
}

const ISO_FLOOR_STEP = 420
const BLDG_EXTRUDE = 34
const MIN_ZOOM = 0.6
const MAX_ZOOM = 3.5
const ZOOM_STEP = 0.25

function clampPan(
  nextPan: { x: number; y: number },
  zoom: number,
  sceneW: number,
  sceneH: number
): { x: number; y: number } {
  if (zoom <= 0.75) return { x: 0, y: 0 }
  const maxPanX = Math.max(sceneW * 0.25, (sceneW - sceneW / Math.max(1, zoom)) / 2 + sceneW * 0.45)
  const maxPanY = Math.max(sceneH * 0.25, (sceneH - sceneH / Math.max(1, zoom)) / 2 + sceneH * 0.45)
  return {
    x: Math.max(-maxPanX, Math.min(maxPanX, nextPan.x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, nextPan.y)),
  }
}

const EDGE_STYLE: Record<
  EdgeType,
  { stroke: string; bed: string; darkBed: string; width: number; dash?: string; label: string }
> = {
  corridor: { stroke: '#334155', bed: '#94A3B8', darkBed: '#334155', width: 3, label: 'Calzada cubierta' },
  ramp: { stroke: '#059669', bed: '#64748B', darkBed: '#1E293B', width: 3.8, dash: '10 3 2 3', label: 'Rampa pavimentada' },
  elevator: { stroke: '#7C3AED', bed: '#EDE9FE', darkBed: '#2E1065', width: 3.8, dash: '5 4', label: 'Ascensor' },
  stairs: { stroke: '#EA580C', bed: '#94A3B8', darkBed: '#334155', width: 3.4, dash: '4 4', label: 'Escaleras' },
  outdoor: { stroke: '#475569', bed: '#64748B', darkBed: '#1E293B', width: 3, dash: '2 6', label: 'Vía pavimentada' },
}

const NODE_LABEL: Record<NodeType, string> = {
  entrance: 'Entrada',
  room: 'Aula / Sala',
  corridor: 'Crucero pavimentado',
  elevator: 'Ascensor',
  stairs: 'Escaleras',
  ramp: 'Rampa',
}

const PAVED_PLAZA_IDS = new Set([
  'cc-explanada-espana',
  'cc-patio-central',
  'cc-paseo-poniente',
  'cc-terraza-placeres',
  'cc-rampa-b-c',
])

function isPavedPlazaNode(n: CampusNode): boolean {
  const b = (n.building ?? '').toLowerCase()
  return PAVED_PLAZA_IDS.has(n.id) || b.includes('red vial') || b.includes('paviment')
}

function rotateWorld(x: number, y: number, cx: number, cy: number, deg: number) {
  const dx = x - cx
  const dy = y - cy
  switch (((deg % 360) + 360) % 360) {
    case 90:
      return { x: cx - dy, y: cy + dx }
    case 180:
      return { x: cx - dx, y: cy - dy }
    case 270:
      return { x: cx + dy, y: cy - dx }
    default:
      return { x, y }
  }
}

interface BuildingShapeSpec {
  outer: [number, number][]
  courtyard?: { x: number; y: number; w: number; h: number }
  tower?: { x: number; y: number; w: number; h: number; extraH: number }
  roofKind: 'gothic-u' | 'claustro' | 'l-wing' | 't-pavilion' | 'sawtooth-h' | 'octagon' | 'hipped'
}

function getBuildingShape(b: CampusBuilding): BuildingShapeSpec {
  const { x, y, width: w, height: h, id } = b
  const bid = id.toLowerCase()

  if (bid === 'bld-a') {
    // U-shaped Gothic main facade with southern forecourt & central clock tower
    return {
      outer: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x + w * 0.72, y + h],
        [x + w * 0.72, y + h * 0.74],
        [x + w * 0.28, y + h * 0.74],
        [x + w * 0.28, y + h],
        [x, y + h],
      ],
      tower: { x: x + w * 0.38, y: y + h * 0.28, w: w * 0.24, h: h * 0.34, extraH: 20 },
      roofKind: 'gothic-u',
    }
  }

  if (bid === 'bld-b') {
    // Chamfered perimeter cloister with open interior courtyard
    const c = 14
    return {
      outer: [
        [x + c, y],
        [x + w - c, y],
        [x + w, y + c],
        [x + w, y + h - c],
        [x + w - c, y + h],
        [x + c, y + h],
        [x, y + h - c],
        [x, y + c],
      ],
      courtyard: { x: x + w * 0.33, y: y + h * 0.24, w: w * 0.34, h: h * 0.52 },
      roofKind: 'claustro',
    }
  }

  if (bid === 'bld-c') {
    // L-shaped northern wing along Av. Placeres
    return {
      outer: [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x + w * 0.24, y + h],
        [x + w * 0.24, y + h * 0.62],
        [x, y + h * 0.62],
      ],
      roofKind: 'l-wing',
    }
  }

  if (bid === 'bld-m') {
    // T-shaped stepped modern pavilion (Informática)
    return {
      outer: [
        [x, y],
        [x + w, y],
        [x + w, y + h * 0.58],
        [x + w * 0.82, y + h * 0.58],
        [x + w * 0.82, y + h],
        [x + w * 0.18, y + h],
        [x + w * 0.18, y + h * 0.58],
        [x, y + h * 0.58],
      ],
      roofKind: 't-pavilion',
    }
  }

  if (bid === 'bld-f') {
    // H-shaped twin-nave industrial workshop with sawtooth roof
    return {
      outer: [
        [x, y],
        [x + w * 0.36, y],
        [x + w * 0.36, y + h * 0.2],
        [x + w * 0.64, y + h * 0.2],
        [x + w * 0.64, y],
        [x + w, y],
        [x + w, y + h],
        [x + w * 0.64, y + h],
        [x + w * 0.64, y + h * 0.8],
        [x + w * 0.36, y + h * 0.8],
        [x + w * 0.36, y + h],
        [x, y + h],
      ],
      roofKind: 'sawtooth-h',
    }
  }

  if (bid === 'bld-p') {
    // Octagonal chamfered Federation pavilion
    const c = Math.min(24, w * 0.2, h * 0.22)
    return {
      outer: [
        [x + c, y],
        [x + w - c, y],
        [x + w, y + c],
        [x + w, y + h - c],
        [x + w - c, y + h],
        [x + c, y + h],
        [x, y + h - c],
        [x, y + c],
      ],
      roofKind: 'octagon',
    }
  }

  return {
    outer: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    roofKind: 'hipped',
  }
}

function NodeGlyph({
  type,
  r = 7.5,
  onRoute = false,
  isDark = false,
}: {
  type: NodeType
  r?: number
  onRoute?: boolean
  isDark?: boolean
}) {
  const stroke = onRoute ? '#DC2626' : isDark ? '#F8FAFC' : '#0F172A'
  const sw = onRoute ? 2.4 : 1.8

  switch (type) {
    case 'entrance':
      return <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={3} fill={isDark ? '#78350F' : '#FEF3C7'} stroke={stroke} strokeWidth={sw} />
    case 'elevator':
      return (
        <g>
          <rect x={-r} y={-r - 2} width={2 * r} height={2 * r + 4} rx={4} fill={isDark ? '#4C1D95' : '#EDE9FE'} stroke={stroke} strokeWidth={sw} />
          <path d="M-3,-2 L0,-5.5 L3,-2 M-3,2 L0,5.5 L3,2" fill="none" stroke={isDark ? '#DDD6FE' : '#5B21B6'} strokeWidth={1.6} />
        </g>
      )
    case 'stairs':
      return <polygon points={`0,${-r - 2} ${r + 2},${r + 1} ${-r - 2},${r + 1}`} fill={isDark ? '#7C2D12' : '#FFEDD5'} stroke={stroke} strokeWidth={sw} />
    case 'ramp':
      return <polygon points={`${-r - 2},${r} ${r + 2},${r} ${r + 2},${-r}`} fill={isDark ? '#064E3B' : '#D1FAE5'} stroke={stroke} strokeWidth={sw} />
    case 'corridor':
      return <circle r={r - 1.5} fill={isDark ? '#334155' : '#F1F5F9'} stroke={stroke} strokeWidth={sw} />
    default:
      return <circle r={r} fill={isDark ? '#1E293B' : '#FFFFFF'} stroke={stroke} strokeWidth={sw} />
  }
}

function PersonAvatarAsset({ gpsActive, shadowFilterUrl }: { gpsActive?: boolean; shadowFilterUrl: string }) {
  return (
    <g aria-hidden="true">
      <circle
        r={18}
        fill="#0EA5E9"
        fillOpacity={gpsActive ? 0.22 : 0.16}
        stroke="#0EA5E9"
        strokeWidth={1.5}
        strokeOpacity={0.6}
      />
      {gpsActive && (
        <>
          <circle r={16} fill="none" stroke="#0EA5E9" strokeWidth={2.5} className="cm3d-radar-1" />
          <circle r={16} fill="none" stroke="#38BDF8" strokeWidth={2} className="cm3d-radar-2" />
        </>
      )}
      <path d="M0,-2 L-6,-14 L6,-14 Z" fill="#0284C7" stroke="#FFFFFF" strokeWidth={1.5} />
      <g transform="translate(0, -27)">
        <circle r={15} fill="#0EA5E9" stroke="#FFFFFF" strokeWidth={2.6} filter={shadowFilterUrl} />
        <path d="M-8,9 C-8,3.5 -4.5,1.5 0,1.5 C4.5,1.5 8,3.5 8,9" fill="#FFFFFF" />
        <circle cx={0} cy={-4.5} r={5} fill="#FEF3C7" stroke="#0369A1" strokeWidth={0.8} />
        <circle cx={-1.7} cy={-5.2} r={0.85} fill="#0F172A" />
        <circle cx={1.7} cy={-5.2} r={0.85} fill="#0F172A" />
        <path d="M-2,-2.6 Q0,-1.1 2,-2.6" fill="none" stroke="#0F172A" strokeWidth={0.95} strokeLinecap="round" />
      </g>
    </g>
  )
}

function DestinationFlagAsset({ shadowFilterUrl }: { shadowFilterUrl: string }) {
  return (
    <g aria-hidden="true">
      <ellipse cx={0} cy={0} rx={14} ry={8} fill="#FACC15" fillOpacity={0.35} stroke="#15803D" strokeWidth={2} />
      <g filter={shadowFilterUrl}>
        <line x1={0} y1={0} x2={0} y2={-38} stroke="#0F172A" strokeWidth={2.8} strokeLinecap="round" />
        <circle cx={0} cy={-39} r={2.6} fill="#FACC15" stroke="#0F172A" strokeWidth={1.2} />
        <path
          d="M1,-37 L25,-29.5 L1,-21 Z"
          fill="#FACC15"
          stroke="#0F172A"
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
        <path d="M3,-34 L17,-29.5 L3,-25 Z" fill="#10B981" fillOpacity={0.85} />
      </g>
    </g>
  )
}

function CompassRose({
  angleDeg,
  rotation,
  onReset,
  isDark,
}: {
  angleDeg: number
  rotation: number
  onReset: () => void
  isDark: boolean
}) {
  const cardinals: { label: string; x: number; y: number; isNorth?: boolean }[] = [
    { label: 'N', x: 0, y: -33, isNorth: true },
    { label: 'E', x: 33, y: 0 },
    { label: 'S', x: 0, y: 33 },
    { label: 'O', x: -33, y: 0 },
  ]

  return (
    <button
      type="button"
      onClick={onReset}
      title="Restablecer orientación al norte (0°)"
      aria-label={`Estrella polar y rosa de los vientos, orientación actual ${rotation} grados. Pulsa para restablecer a 0 grados.`}
      className="panel-3d absolute top-3 right-3 z-10 flex flex-col items-center gap-0.5 rounded-2xl p-1.5 backdrop-blur-md transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
    >
      <svg width="72" height="72" viewBox="-44 -44 88 88" aria-hidden="true">
        <circle r={40} fill={isDark ? '#0F172A' : '#F8FAFC'} stroke={isDark ? '#334155' : '#CBD5E1'} strokeWidth={1.5} />
        <circle r={24} fill="none" stroke={isDark ? '#1E293B' : '#E2E8F0'} strokeWidth={1} strokeDasharray="3 3" />

        <g transform={`rotate(${angleDeg})`}>
          <polygon points="0,0 14,-14 4,0" fill={isDark ? '#475569' : '#94A3B8'} />
          <polygon points="0,0 14,-14 0,-4" fill={isDark ? '#64748B' : '#CBD5E1'} />
          <polygon points="0,0 14,14 0,4" fill={isDark ? '#475569' : '#94A3B8'} />
          <polygon points="0,0 14,14 4,0" fill={isDark ? '#64748B' : '#CBD5E1'} />
          <polygon points="0,0 -14,14 -4,0" fill={isDark ? '#475569' : '#94A3B8'} />
          <polygon points="0,0 -14,14 0,4" fill={isDark ? '#64748B' : '#CBD5E1'} />
          <polygon points="0,0 -14,-14 0,-4" fill={isDark ? '#475569' : '#94A3B8'} />
          <polygon points="0,0 -14,-14 -4,0" fill={isDark ? '#64748B' : '#CBD5E1'} />

          <polygon points="0,0 24,0 0,5" fill={isDark ? '#64748B' : '#475569'} />
          <polygon points="0,0 24,0 0,-5" fill={isDark ? '#94A3B8' : '#94A3B8'} />
          <polygon points="0,0 0,24 -5,0" fill={isDark ? '#475569' : '#334155'} />
          <polygon points="0,0 0,24 5,0" fill={isDark ? '#94A3B8' : '#64748B'} />
          <polygon points="0,0 -24,0 0,-5" fill={isDark ? '#64748B' : '#475569'} />
          <polygon points="0,0 -24,0 0,5" fill={isDark ? '#94A3B8' : '#94A3B8'} />

          <polygon points="0,0 0,-26 5.5,0" fill="#EF4444" />
          <polygon points="0,0 0,-26 -5.5,0" fill="#991B1B" />

          <circle r={3.2} fill="#FFFFFF" stroke="#0F172A" strokeWidth={1.3} />

          {cardinals.map((c) => (
            <g key={c.label} transform={`translate(${c.x}, ${c.y}) rotate(${-angleDeg})`}>
              <text
                textAnchor="middle"
                dy="3.8"
                fontFamily="'Space Grotesk', system-ui, sans-serif"
                fontSize={c.isNorth ? '11.5' : '10'}
                fontWeight="800"
                fill={c.isNorth ? '#EF4444' : isDark ? '#F1F5F9' : '#0F172A'}
              >
                {c.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <span className={`font-display text-[10px] font-bold leading-none ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
        {rotation === 0 ? 'Norte' : `${rotation}° (Reiniciar)`}
      </span>
    </button>
  )
}

export function CampusMap3D({
  map,
  route,
  originId,
  destId,
  floorView,
  onFloorViewChange,
  onSelectNode,
  gpsActive = false,
  darkMode,
}: CampusMap3DProps) {
  const rawFilterId = useId()
  const shadowFilterId = `cm3d-shadow-${rawFilterId.replace(/:/g, '')}`
  const shadowFilterUrl = `url(#${shadowFilterId})`

  const [animating, setAnimating] = useState(true)
  const [viewMode, setViewMode] = useState<'iso' | 'top'>('iso')
  const [rotation, setRotation] = useState<number>(0)
  const [showLabels, setShowLabels] = useState<boolean>(true)
  const [showRoofs, setShowRoofs] = useState<boolean>(true)
  const [zoom, setZoom] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [internalFloor, setInternalFloor] = useState<'stacked' | number>(floorView)
  const [domDark, setDomDark] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false
  )

  const stageRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startPanX: number
    startPanY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef<boolean>(false)
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null)
  const sceneSizeRef = useRef<{ w: number; h: number }>({ w: 2200, h: 1450 })

  useEffect(() => {
    setInternalFloor(floorView)
  }, [floorView])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const sync = () => setDomDark(document.documentElement.classList.contains('dark'))
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const onTheme = (ev: Event) => {
      const detail = (ev as CustomEvent<{ dark?: boolean }>).detail
      if (typeof detail?.dark === 'boolean') setDomDark(detail.dark)
      else sync()
    }
    window.addEventListener('rutacampus-theme', onTheme)
    return () => {
      obs.disconnect()
      window.removeEventListener('rutacampus-theme', onTheme)
    }
  }, [])

  const isDark = darkMode ?? domDark
  const activeFloorView = onFloorViewChange ? floorView : internalFloor
  const stacked = activeFloorView === 'stacked'

  const handleFloorSelect = (next: 'stacked' | number) => {
    setInternalFloor(next)
    onFloorViewChange?.(next)
  }

  const scene = useMemo(() => {
    const allFloors =
      map.floors && map.floors.length > 0
        ? [...map.floors].sort((a, b) => a - b)
        : Array.from(new Set(map.nodes.map((n) => n.floor))).sort((a, b) => a - b)
    const floorsList = allFloors.length > 0 ? allFloors : [1, 2]
    const renderedFloors = stacked ? floorsList : [activeFloorView as number]

    const effectiveBuildings: CampusBuilding[] = map.buildings.map((b) => ({ ...b }))
    const findMatchingBuilding = (bName: string, n: CampusNode) => {
      const lower = bName.toLowerCase()
      return effectiveBuildings.find((b) => {
        const bl = b.name.toLowerCase()
        const inside =
          n.x >= b.x - 16 && n.x <= b.x + b.width + 16 && n.y >= b.y - 16 && n.y <= b.y + b.height + 16
        return inside || bl.includes(lower) || lower.includes(bl)
      })
    }

    const dynamicGroups = new Map<string, CampusNode[]>()
    for (const n of map.nodes) {
      const bName = (n.building ?? '').trim()
      const bl = bName.toLowerCase()
      if (!bName || bl === 'exterior' || bl.includes('red vial') || bl.includes('paviment') || bName.includes('-')) {
        continue
      }
      if (findMatchingBuilding(bName, n)) continue
      const list = dynamicGroups.get(bName) ?? []
      list.push(n)
      dynamicGroups.set(bName, list)
    }
    for (const [bName, group] of dynamicGroups.entries()) {
      const xs = group.map((n) => n.x)
      const ys = group.map((n) => n.y)
      const minX = Math.min(...xs) - 48
      const maxX = Math.max(...xs) + 48
      const minY = Math.min(...ys) - 48
      const maxY = Math.max(...ys) + 48
      const maxFl = Math.max(1, ...group.map((n) => n.floor))
      effectiveBuildings.push({
        id: `dyn-${bName.toLowerCase().replace(/\s+/g, '-')}`,
        name: bName,
        x: minX,
        y: minY,
        width: Math.max(100, maxX - minX),
        height: Math.max(100, maxY - minY),
        floors: maxFl,
        color: '#6366F1',
      })
    }

    const nodeMap = new Map<string, CampusNode>(map.nodes.map((n) => [n.id, n]))

    const spacedCoords = new Map<string, { x: number; y: number }>()
    for (const fl of floorsList) {
      const floorNodes = map.nodes.filter((n) => n.floor === fl)
      const pts = floorNodes.map((n) => ({ id: n.id, x: n.x, y: n.y }))
      const minDist = 28
      for (let iter = 0; iter < 12; iter++) {
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const dx = pts[j].x - pts[i].x
            const dy = pts[j].y - pts[i].y
            const dist = Math.hypot(dx, dy) || 0.01
            if (dist < minDist) {
              const push = ((minDist - dist) / 2) * 0.45
              const ux = dx / dist
              const uy = dy / dist
              pts[i].x -= ux * push
              pts[i].y -= uy * push
              pts[j].x += ux * push
              pts[j].y += uy * push
            }
          }
        }
      }
      for (const p of pts) spacedCoords.set(p.id, { x: p.x, y: p.y })
    }

    for (const e of map.edges) {
      const a = nodeMap.get(e.from_node_id)
      const b = nodeMap.get(e.to_node_id)
      if (!a || !b || a.floor === b.floor) continue
      const lower = a.floor < b.floor ? a : b
      const upper = a.floor < b.floor ? b : a
      const basePos = spacedCoords.get(lower.id)
      if (basePos && Math.hypot(a.x - b.x, a.y - b.y) < 12) {
        spacedCoords.set(upper.id, { ...basePos })
      }
    }

    const buildings = effectiveBuildings.map((b) => {
      let minX = b.x
      let minY = b.y
      let maxX = b.x + b.width
      let maxY = b.y + b.height
      const bl = b.name.toLowerCase()
      for (const n of map.nodes) {
        const nb = (n.building ?? '').trim().toLowerCase()
        if (!nb || nb === 'exterior' || nb.includes('red vial') || nb.includes('paviment') || nb.includes('-')) {
          continue
        }
        if (bl.includes(nb) || nb.includes(bl)) {
          const p = spacedCoords.get(n.id) ?? { x: n.x, y: n.y }
          minX = Math.min(minX, p.x - 18)
          maxX = Math.max(maxX, p.x + 18)
          minY = Math.min(minY, p.y - 18)
          maxY = Math.max(maxY, p.y + 18)
        }
      }
      return {
        ...b,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      }
    })

    const allWorldX: number[] = []
    const allWorldY: number[] = []
    for (const b of buildings) {
      allWorldX.push(b.x, b.x + b.width)
      allWorldY.push(b.y, b.y + b.height)
    }
    for (const n of map.nodes) {
      const p = spacedCoords.get(n.id) ?? { x: n.x, y: n.y }
      allWorldX.push(p.x)
      allWorldY.push(p.y)
    }
    const worldMinX = allWorldX.length ? Math.min(...allWorldX) : 0
    const worldMaxX = allWorldX.length ? Math.max(...allWorldX) : map.viewbox?.width || 2200
    const worldMinY = allWorldY.length ? Math.min(...allWorldY) : 0
    const worldMaxY = allWorldY.length ? Math.max(...allWorldY) : map.viewbox?.height || 1450
    const centerX = (worldMinX + worldMaxX) / 2
    const centerY = (worldMinY + worldMaxY) / 2

    const rotWorldXs: number[] = []
    const rotWorldYs: number[] = []
    for (const b of buildings) {
      for (const [cx, cy] of [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x + b.width, b.y + b.height],
        [b.x, b.y + b.height],
      ]) {
        const rp = rotateWorld(cx, cy, centerX, centerY, rotation)
        rotWorldXs.push(rp.x)
        rotWorldYs.push(rp.y)
      }
    }
    for (const n of map.nodes) {
      const p = spacedCoords.get(n.id) ?? { x: n.x, y: n.y }
      const rp = rotateWorld(p.x, p.y, centerX, centerY, rotation)
      rotWorldXs.push(rp.x)
      rotWorldYs.push(rp.y)
    }
    const rotMinX = (rotWorldXs.length ? Math.min(...rotWorldXs) : 0) - 44
    const rotMaxX = (rotWorldXs.length ? Math.max(...rotWorldXs) : map.viewbox?.width || 2200) + 44
    const rotMinY = (rotWorldYs.length ? Math.min(...rotWorldYs) : 0) - 44
    const rotMaxY = (rotWorldYs.length ? Math.max(...rotWorldYs) : map.viewbox?.height || 1450) + 44
    const deckW = Math.max(480, rotMaxX - rotMinX)
    const deckH = Math.max(360, rotMaxY - rotMinY)
    const deckGap = 96

    const floorIndexMap = new Map<number, number>()
    renderedFloors.forEach((fl, idx) => floorIndexMap.set(fl, idx))

    const rawProject = (wx: number, wy: number, floor: number, zPx = 0) => {
      const rp = rotateWorld(wx, wy, centerX, centerY, rotation)
      const fIdx = floorIndexMap.get(floor) ?? 0
      if (viewMode === 'iso') {
        return {
          x: (rp.x - rp.y) * 0.72,
          y: (rp.x + rp.y) * 0.36 - fIdx * ISO_FLOOR_STEP - zPx,
        }
      }
      return {
        x: rp.x - rotMinX + fIdx * (deckW + deckGap),
        y: rp.y - rotMinY,
      }
    }

    const fl0 = renderedFloors[0] ?? 1
    const pOrigin = rawProject(centerX, centerY, fl0, 0)
    const pNorth = rawProject(centerX, centerY - 120, fl0, 0)
    const northAngleDeg = (Math.atan2(pNorth.y - pOrigin.y, pNorth.x - pOrigin.x) * 180) / Math.PI + 90

    const samples: { x: number; y: number }[] = []
    for (const fl of renderedFloors) {
      const flBuildings = buildings.filter((b) => fl <= Math.max(1, b.floors))
      for (const b of flBuildings) {
        for (const [bx, by] of [
          [b.x, b.y],
          [b.x + b.width, b.y],
          [b.x + b.width, b.y + b.height],
          [b.x, b.y + b.height],
        ]) {
          samples.push(rawProject(bx, by, fl, -BLDG_EXTRUDE))
          samples.push(rawProject(bx, by, fl, 36))
        }
      }
      if (fl === renderedFloors[0] || viewMode === 'top') {
        for (const [tx, ty] of [
          [worldMinX - 30, worldMinY - 30],
          [worldMaxX + 30, worldMinY - 30],
          [worldMaxX + 30, worldMaxY + 30],
          [worldMinX - 30, worldMaxY + 30],
          [(worldMinX + worldMaxX) / 2, worldMinY - 22],
          [(worldMinX + worldMaxX) / 2, worldMaxY + 22],
          [worldMinX - 22, (worldMinY + worldMaxY) / 2],
          [worldMaxX + 22, (worldMinY + worldMaxY) / 2],
        ] as [number, number][]) {
          samples.push(rawProject(tx, ty, fl, -BLDG_EXTRUDE - 12))
        }
      }
    }
    for (const n of map.nodes) {
      if (!stacked && n.floor !== activeFloorView) continue
      const p = spacedCoords.get(n.id) ?? { x: n.x, y: n.y }
      samples.push(rawProject(p.x, p.y, n.floor, 32))
      samples.push(rawProject(p.x, p.y, n.floor, -14))
    }

    const padX = 96
    const padTop = 98
    const padBottom = 68
    const minX = (samples.length ? Math.min(...samples.map((p) => p.x)) : 0) - padX
    const maxX = (samples.length ? Math.max(...samples.map((p) => p.x)) : 800) + padX
    const minY = (samples.length ? Math.min(...samples.map((p) => p.y)) : 0) - padTop
    const maxY = (samples.length ? Math.max(...samples.map((p) => p.y)) : 520) + padBottom

    const offsetX = -minX
    const offsetY = -minY

    const project = (wx: number, wy: number, floor: number, zPx = 0) => {
      const p = rawProject(wx, wy, floor, zPx)
      return { x: p.x + offsetX, y: p.y + offsetY }
    }

    const projectNode = (n: CampusNode) => {
      const p = spacedCoords.get(n.id) ?? { x: n.x, y: n.y }
      return project(p.x, p.y, n.floor, 0)
    }

    const segmentHitsBuildingInterior = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      fl: number,
      startPt: { x: number; y: number },
      endPt: { x: number; y: number }
    ) => {
      const segMinX = Math.min(ax, bx)
      const segMaxX = Math.max(ax, bx)
      const segMinY = Math.min(ay, by)
      const segMaxY = Math.max(ay, by)
      for (const b of buildings) {
        if (fl > Math.max(1, b.floors)) continue
        const startInB =
          startPt.x >= b.x - 10 &&
          startPt.x <= b.x + b.width + 10 &&
          startPt.y >= b.y - 10 &&
          startPt.y <= b.y + b.height + 10
        const endInB =
          endPt.x >= b.x - 10 &&
          endPt.x <= b.x + b.width + 10 &&
          endPt.y >= b.y - 10 &&
          endPt.y <= b.y + b.height + 10
        if (startInB || endInB) continue
        const rx0 = b.x + 14
        const rx1 = b.x + b.width - 14
        const ry0 = b.y + 14
        const ry1 = b.y + b.height - 14
        if (segMaxX >= rx0 && segMinX <= rx1 && segMaxY >= ry0 && segMinY <= ry1) {
          return true
        }
      }
      return false
    }

    const computeOrthogonalWorldWaypoints = (
      n1: CampusNode,
      n2: CampusNode
    ): { x: number; y: number }[] => {
      const p1 = spacedCoords.get(n1.id) ?? { x: n1.x, y: n1.y }
      const p2 = spacedCoords.get(n2.id) ?? { x: n2.x, y: n2.y }
      if (n1.floor !== n2.floor) return [p1, p2]
      const x1 = p1.x
      const y1 = p1.y
      const x2 = p2.x
      const y2 = p2.y
      if (Math.abs(x1 - x2) <= 10 || Math.abs(y1 - y2) <= 10) {
        return [p1, p2]
      }
      const midY = Math.round((y1 + y2) / 2)
      const midX = Math.round((x1 + x2) / 2)
      const candidates: { x: number; y: number }[][] = [
        [p1, { x: x2, y: y1 }, p2],
        [p1, { x: x1, y: y2 }, p2],
        [p1, { x: x1, y: midY }, { x: x2, y: midY }, p2],
        [p1, { x: midX, y: y1 }, { x: midX, y: y2 }, p2],
      ]
      const isAvenuePt = (pt: { x: number; y: number }) =>
        Math.abs(pt.x - 1080) <= 18 ||
        Math.abs(pt.y - 645) <= 18 ||
        Math.abs(pt.y - 760) <= 18 ||
        Math.abs(pt.y - 1135) <= 18 ||
        Math.abs(pt.y - 280) <= 18

      const validCandidates = candidates.filter((cand) => {
        for (let i = 0; i < cand.length - 1; i++) {
          if (
            segmentHitsBuildingInterior(
              cand[i].x,
              cand[i].y,
              cand[i + 1].x,
              cand[i + 1].y,
              n1.floor,
              p1,
              p2
            )
          ) {
            return false
          }
        }
        return true
      })

      const pool = validCandidates.length > 0 ? validCandidates : candidates
      const avenueMatch = pool.find((cand) => cand.slice(1, -1).some(isAvenuePt))
      return avenueMatch ?? pool[0]
    }

    const edgeWaypointsCache = new Map<string, { x: number; y: number }[]>()
    for (const e of map.edges) {
      const a = nodeMap.get(e.from_node_id)
      const b = nodeMap.get(e.to_node_id)
      if (a && b) {
        edgeWaypointsCache.set(e.id, computeOrthogonalWorldWaypoints(a, b))
      }
    }

    const getEdgeWorldWaypoints = (e: CampusEdge): { x: number; y: number }[] => {
      const cached = edgeWaypointsCache.get(e.id)
      if (cached) return cached
      const a = nodeMap.get(e.from_node_id)!
      const b = nodeMap.get(e.to_node_id)!
      return computeOrthogonalWorldWaypoints(a, b)
    }

    const getEdgeProjectedWaypoints = (e: CampusEdge): { x: number; y: number }[] => {
      const a = nodeMap.get(e.from_node_id)!
      return getEdgeWorldWaypoints(e).map((pt) => project(pt.x, pt.y, a.floor, 0))
    }

    const getPairProjectedWaypoints = (n1: CampusNode, n2: CampusNode): { x: number; y: number }[] => {
      const match = map.edges.find(
        (e) =>
          (e.from_node_id === n1.id && e.to_node_id === n2.id) ||
          (e.from_node_id === n2.id && e.to_node_id === n1.id)
      )
      if (match) {
        const pts = getEdgeProjectedWaypoints(match)
        return match.from_node_id === n1.id ? pts : [...pts].reverse()
      }
      return computeOrthogonalWorldWaypoints(n1, n2).map((pt) => project(pt.x, pt.y, n1.floor, 0))
    }

    const isNodeVisible = (n: CampusNode) => stacked || n.floor === activeFloorView
    const visibleEdges = map.edges.filter((e) => {
      const a = nodeMap.get(e.from_node_id)
      const b = nodeMap.get(e.to_node_id)
      return !!a && !!b && (stacked || (a.floor === activeFloorView && b.floor === activeFloorView))
    })

    const verticalLinks = new Map<string, number[]>()
    const addLink = (nodeId: string, targetFloor: number) => {
      const prev = verticalLinks.get(nodeId) ?? []
      if (!prev.includes(targetFloor)) {
        verticalLinks.set(
          nodeId,
          [...prev, targetFloor].sort((a, b) => a - b)
        )
      }
    }
    for (const e of map.edges) {
      const a = nodeMap.get(e.from_node_id)
      const b = nodeMap.get(e.to_node_id)
      if (!a || !b || a.floor === b.floor) continue
      addLink(a.id, b.floor)
      if (e.bidirectional !== false) addLink(b.id, a.floor)
    }

    return {
      floorsList,
      renderedFloors,
      buildings,
      nodeMap,
      spacedCoords,
      visibleEdges,
      verticalLinks,
      isNodeVisible,
      project,
      projectNode,
      getEdgeWorldWaypoints,
      getEdgeProjectedWaypoints,
      getPairProjectedWaypoints,
      worldMinX,
      worldMaxX,
      worldMinY,
      worldMaxY,
      deckW,
      deckH,
      deckGap,
      offsetX,
      offsetY,
      northAngleDeg,
      width: Math.max(460, Math.ceil(maxX - minX)),
      height: Math.max(360, Math.ceil(maxY - minY)),
    }
  }, [map, activeFloorView, stacked, viewMode, rotation])

  const {
    floorsList,
    renderedFloors,
    buildings,
    nodeMap,
    spacedCoords,
    visibleEdges,
    verticalLinks,
    isNodeVisible,
    project,
    projectNode,
    getEdgeProjectedWaypoints,
    getPairProjectedWaypoints,
    worldMinX,
    worldMaxX,
    worldMinY,
    worldMaxY,
    deckW,
    deckH,
    deckGap,
    offsetX,
    offsetY,
    northAngleDeg,
  } = scene

  sceneSizeRef.current = { w: scene.width, h: scene.height }

  const viewW = scene.width / zoom
  const viewH = scene.height / zoom
  const clampedPan = clampPan(pan, zoom, scene.width, scene.height)
  const viewX = (scene.width - viewW) / 2 + clampedPan.x
  const viewY = (scene.height - viewH) / 2 + clampedPan.y

  const applyZoom = useCallback((nextZoom: number) => {
    const clamped = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom)) * 100) / 100
    setZoom(clamped)
    if (clamped <= 0.75) {
      setPan({ x: 0, y: 0 })
    } else {
      const { w, h } = sceneSizeRef.current
      setPan((prev) => clampPan(prev, clamped, w, h))
    }
  }, [])

  const resetZoomPan = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const handleWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const delta = ev.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP
      setZoom((prev) => {
        const next = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev + delta)) * 100) / 100
        if (next <= 0.75) {
          setPan({ x: 0, y: 0 })
        } else {
          const { w, h } = sceneSizeRef.current
          setPan((p) => clampPan(p, next, w, h))
        }
        return next
      })
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const handleStagePointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if ((ev.target as Element | null)?.closest('button')) return
    if (ev.pointerType === 'mouse' && ev.button !== 0) return

    activePointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })

    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values())
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      pinchRef.current = { startDist: Math.max(10, dist), startZoom: zoom }
      dragRef.current = null
      setIsDragging(false)
      return
    }

    if (activePointersRef.current.size === 1) {
      dragRef.current = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        startPanX: clampedPan.x,
        startPanY: clampedPan.y,
        moved: false,
      }
    }
  }

  const handleStagePointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (activePointersRef.current.has(ev.pointerId)) {
      activePointersRef.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY })
    }

    if (activePointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(activePointersRef.current.values())
      const curDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      applyZoom(pinchRef.current.startZoom * (curDist / pinchRef.current.startDist))
      return
    }

    const drag = dragRef.current
    if (!drag || drag.pointerId !== ev.pointerId) return

    const dxPx = ev.clientX - drag.startX
    const dyPx = ev.clientY - drag.startY

    if (!drag.moved) {
      if (Math.hypot(dxPx, dyPx) < 5) return
      if (zoom <= 0.75) return
      drag.moved = true
      setIsDragging(true)
      try {
        ev.currentTarget.setPointerCapture(ev.pointerId)
      } catch {
        // Ignore if pointer capture is unsupported
      }
    }

    const svgEl = svgRef.current
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const scale = Math.max(viewW / Math.max(1, rect.width), viewH / Math.max(1, rect.height))
    setPan(
      clampPan(
        { x: drag.startPanX - dxPx * scale, y: drag.startPanY - dyPx * scale },
        zoom,
        scene.width,
        scene.height
      )
    )
  }

  const handleStagePointerUp = (ev: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(ev.pointerId)
    if (activePointersRef.current.size < 2) {
      pinchRef.current = null
    }

    const drag = dragRef.current
    if (drag && drag.pointerId === ev.pointerId) {
      if (drag.moved) {
        suppressClickRef.current = true
        window.setTimeout(() => {
          suppressClickRef.current = false
        }, 0)
        try {
          if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
            ev.currentTarget.releasePointerCapture(ev.pointerId)
          }
        } catch {
          // Ignore release failure
        }
      }
      dragRef.current = null
      setIsDragging(false)
    }
  }

  const activeIncidents = useMemo(
    () => map.active_incidents.filter((i) => i.status !== 'resolved'),
    [map.active_incidents]
  )
  const nodeIncidents = useMemo(() => {
    const m = new Map<string, Incident>()
    for (const inc of activeIncidents) if (inc.node_id) m.set(inc.node_id, inc)
    return m
  }, [activeIncidents])
  const edgeIncidents = useMemo(() => {
    const m = new Map<string, Incident>()
    for (const inc of activeIncidents) if (inc.edge_id) m.set(inc.edge_id, inc)
    return m
  }, [activeIncidents])

  const { blockingNodeIds, blockingEdgeIds, warningNodeIds, warningEdgeIds } = useMemo(() => {
    const bn = new Set<string>()
    const be = new Set<string>()
    const wn = new Set<string>()
    const we = new Set<string>()
    for (const inc of activeIncidents) {
      if (inc.severity === 'blocking') {
        if (inc.node_id) bn.add(inc.node_id)
        if (inc.edge_id) be.add(inc.edge_id)
      } else {
        if (inc.node_id) wn.add(inc.node_id)
        if (inc.edge_id) we.add(inc.edge_id)
      }
    }
    return { blockingNodeIds: bn, blockingEdgeIds: be, warningNodeIds: wn, warningEdgeIds: we }
  }, [activeIncidents])

  const isEdgeBlocked = (e: CampusEdge) =>
    blockingEdgeIds.has(e.id) || blockingNodeIds.has(e.from_node_id) || blockingNodeIds.has(e.to_node_id)

  const isEdgeWarning = (e: CampusEdge) =>
    !isEdgeBlocked(e) &&
    (warningEdgeIds.has(e.id) || warningNodeIds.has(e.from_node_id) || warningNodeIds.has(e.to_node_id))

  const pathStats = useMemo(() => {
    const total = map.edges.length
    let blocked = 0
    for (const e of map.edges) {
      if (
        blockingEdgeIds.has(e.id) ||
        blockingNodeIds.has(e.from_node_id) ||
        blockingNodeIds.has(e.to_node_id)
      ) {
        blocked++
      }
    }
    return { total, available: Math.max(0, total - blocked), blocked }
  }, [map.edges, blockingEdgeIds, blockingNodeIds])

  const crossFloorNodeIncidents = useMemo(() => {
    const m = new Map<string, Incident>()
    for (const e of map.edges) {
      const inc = edgeIncidents.get(e.id)
      if (!inc) continue
      const a = nodeMap.get(e.from_node_id)
      const b = nodeMap.get(e.to_node_id)
      if (!a || !b || a.floor === b.floor) continue
      if (!m.has(a.id)) m.set(a.id, inc)
      if (!m.has(b.id)) m.set(b.id, inc)
    }
    return m
  }, [map.edges, edgeIncidents, nodeMap])

  const routeEdgeSet = useMemo(() => new Set(route?.path_edge_ids ?? []), [route])
  const routeNodeSet = useMemo(() => new Set(route?.path_node_ids ?? []), [route])

  const { routePolylines, routeVerticals } = useMemo(() => {
    const segments: string[][] = []
    const verticals: { x1: number; y1: number; x2: number; y2: number; d?: string; key: string }[] = []

    const pushVertical = (key: string, pa: { x: number; y: number }, pb: { x: number; y: number }) => {
      if (viewMode === 'iso') {
        verticals.push({ key, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y })
      } else {
        const midX = (pa.x + pb.x) / 2
        const midY = Math.min(pa.y, pb.y) - 62
        verticals.push({
          key,
          x1: pa.x,
          y1: pa.y,
          x2: pb.x,
          y2: pb.y,
          d: `M ${pa.x} ${pa.y} Q ${midX} ${midY} ${pb.x} ${pb.y}`,
        })
      }
    }

    if (route?.path_node_ids?.length) {
      let cur: string[] = []
      let prevNode: CampusNode | null = null
      for (const id of route.path_node_ids) {
        const n = nodeMap.get(id)
        if (n && isNodeVisible(n)) {
          const p = projectNode(n)
          if (prevNode && prevNode.floor !== n.floor && stacked) {
            if (cur.length > 1) segments.push(cur)
            cur = [`${p.x},${p.y}`]
            pushVertical(`rv-${prevNode.id}-${n.id}`, projectNode(prevNode), p)
          } else if (prevNode && prevNode.floor === n.floor) {
            const pairPts = getPairProjectedWaypoints(prevNode, n)
            if (cur.length === 0) {
              cur.push(`${pairPts[0].x},${pairPts[0].y}`)
            }
            for (let wi = 1; wi < pairPts.length; wi++) {
              cur.push(`${pairPts[wi].x},${pairPts[wi].y}`)
            }
          } else {
            cur.push(`${p.x},${p.y}`)
          }
          prevNode = n
        } else {
          if (cur.length > 1) segments.push(cur)
          cur = []
          prevNode = null
        }
      }
      if (cur.length > 1) segments.push(cur)
    }

    if (segments.length === 0 && verticals.length === 0 && routeEdgeSet.size > 0) {
      for (const e of visibleEdges) {
        if (!routeEdgeSet.has(e.id)) continue
        const a = nodeMap.get(e.from_node_id)!
        const b = nodeMap.get(e.to_node_id)!
        const pa = projectNode(a)
        const pb = projectNode(b)
        if (a.floor !== b.floor && stacked) {
          pushVertical(`rv-${e.id}`, pa, pb)
        } else {
          const wpts = getEdgeProjectedWaypoints(e)
          segments.push(wpts.map((pt) => `${pt.x},${pt.y}`))
        }
      }
    }

    return {
      routePolylines: segments.map((pts) => pts.join(' ')),
      routeVerticals: verticals,
    }
  }, [
    route,
    nodeMap,
    isNodeVisible,
    projectNode,
    getPairProjectedWaypoints,
    getEdgeProjectedWaypoints,
    stacked,
    viewMode,
    visibleEdges,
    routeEdgeSet,
  ])

  const visibleNodesByFloor = useMemo(() => {
    const grouped = new Map<number, CampusNode[]>()
    for (const fl of renderedFloors) {
      const list = map.nodes
        .filter((n) => n.floor === fl && isNodeVisible(n))
        .sort((a, b) => projectNode(a).y - projectNode(b).y)
      grouped.set(fl, list)
    }
    return grouped
  }, [map.nodes, renderedFloors, isNodeVisible, projectNode])

  const sameFloorEdgesByFloor = useMemo(() => {
    const grouped = new Map<number, CampusEdge[]>()
    for (const fl of renderedFloors) {
      grouped.set(
        fl,
        visibleEdges.filter((e) => {
          const a = nodeMap.get(e.from_node_id)!
          const b = nodeMap.get(e.to_node_id)!
          return a.floor === fl && b.floor === fl
        })
      )
    }
    return grouped
  }, [renderedFloors, visibleEdges, nodeMap])

  const crossFloorEdges = useMemo(
    () =>
      stacked
        ? visibleEdges.filter((e) => {
            const a = nodeMap.get(e.from_node_id)!
            const b = nodeMap.get(e.to_node_id)!
            return a.floor !== b.floor
          })
        : [],
    [stacked, visibleEdges, nodeMap]
  )

  const renderIncidentBadge = (x: number, y: number, key: string, label: string) => (
    <g key={key} transform={`translate(${x},${y})`} role="img" aria-label={label}>
      <title>{label}</title>
      <polygon points="0,-11 10,7 -10,7" fill="#DC2626" stroke="#FFFFFF" strokeWidth={2} filter={shadowFilterUrl} />
      <text textAnchor="middle" dy="5" fontSize="10" fontWeight="800" fill="#FFFFFF" aria-hidden="true">
        !
      </text>
    </g>
  )

  const renderBuildingPlaque = (x: number, y: number, name: string, color: string, withShadow: boolean) => {
    const plaqueW = Math.max(114, name.length * 6.5 + 28)
    return (
      <g transform={`translate(${x}, ${y})`}>
        <rect
          x={-plaqueW / 2}
          y={-12}
          width={plaqueW}
          height={22}
          rx={11}
          fill="#0F172A"
          fillOpacity={0.94}
          stroke={isDark ? color : '#FFFFFF'}
          strokeWidth={1.4}
          filter={withShadow ? shadowFilterUrl : undefined}
        />
        <circle cx={-plaqueW / 2 + 11} cy={-1} r={4} fill={color} stroke="#FFFFFF" strokeWidth={0.9} />
        <text
          x={5}
          y={3}
          textAnchor="middle"
          fontFamily="'Space Grotesk', system-ui, sans-serif"
          fontSize="10.5"
          fontWeight="700"
          fill="#FFFFFF"
        >
          {name}
        </text>
      </g>
    )
  }

  const renderIsoPolygonExtrusion = (
    polyWorld: [number, number][],
    fl: number,
    zBottom: number,
    zTop: number,
    color: string,
    keyPrefix: string,
    withWindows: boolean
  ) => {
    const basePts = polyWorld.map(([x, y]) => project(x, y, fl, zBottom))
    const topPts = polyWorld.map(([x, y]) => project(x, y, fl, zTop))
    const shadowPts = basePts.map((p) => `${p.x + 6},${p.y + 8}`)

    const walls = polyWorld.map((_, i) => {
      const j = (i + 1) % polyWorld.length
      const b0 = basePts[i]
      const b1 = basePts[j]
      const t0 = topPts[i]
      const t1 = topPts[j]
      const dx = b1.x - b0.x
      const dy = b1.y - b0.y
      const segLen = Math.hypot(dx, dy)
      return {
        idx: i,
        b0,
        b1,
        t0,
        t1,
        dx,
        dy,
        segLen,
        midX: (b0.x + b1.x) / 2,
        midY: (b0.y + b1.y) / 2,
        pts: `${b0.x},${b0.y} ${b1.x},${b1.y} ${t1.x},${t1.y} ${t0.x},${t0.y}`,
      }
    })
    walls.sort((a, c) => a.midY - c.midY)

    return {
      basePts,
      topPts,
      element: (
        <g key={keyPrefix}>
          <polygon points={shadowPts.join(' ')} fill="#020617" fillOpacity={isDark ? 0.36 : 0.12} />
          {walls.map((w) => {
            const isRightShade = w.dx >= 0
            const winCount = withWindows && w.segLen >= 34 ? Math.min(5, Math.floor(w.segLen / 24)) : 0
            return (
              <g key={`${keyPrefix}-w-${w.idx}`}>
                <polygon
                  points={w.pts}
                  fill={color}
                  fillOpacity={isDark ? (isRightShade ? 0.86 : 0.72) : isRightShade ? 0.78 : 0.64}
                  stroke={isDark ? '#020617' : '#0F172A'}
                  strokeOpacity={0.35}
                  strokeWidth={1.1}
                />
                <polygon
                  points={w.pts}
                  fill="#020617"
                  fillOpacity={isDark ? (isRightShade ? 0.44 : 0.24) : isRightShade ? 0.26 : 0.12}
                />
                {/* Illuminated architectural windows on front-facing walls */}
                {winCount > 0 &&
                  Array.from({ length: winCount }, (_, wi) => {
                    const t = (wi + 0.7) / (winCount + 0.4)
                    const wx0 = w.b0.x + (w.b1.x - w.b0.x) * (t - 0.08)
                    const wy0 = w.b0.y + (w.b1.y - w.b0.y) * (t - 0.08)
                    const wx1 = w.b0.x + (w.b1.x - w.b0.x) * (t + 0.08)
                    const wy1 = w.b0.y + (w.b1.y - w.b0.y) * (t + 0.08)
                    const hLow = 0.28
                    const hHigh = 0.72
                    const vx = w.t0.x - w.b0.x
                    const vy = w.t0.y - w.b0.y
                    const pA = `${wx0 + vx * hLow},${wy0 + vy * hLow}`
                    const pB = `${wx1 + vx * hLow},${wy1 + vy * hLow}`
                    const pC = `${wx1 + vx * hHigh},${wy1 + vy * hHigh}`
                    const pD = `${wx0 + vx * hHigh},${wy0 + vy * hHigh}`
                    return (
                      <polygon
                        key={`win-${wi}`}
                        points={`${pA} ${pB} ${pC} ${pD}`}
                        fill={isDark ? '#FDE047' : '#E0F2FE'}
                        fillOpacity={isDark ? 0.78 : 0.62}
                        stroke={isDark ? '#FACC15' : '#FFFFFF'}
                        strokeWidth={0.6}
                      />
                    )
                  })}
              </g>
            )
          })}
          <polygon
            points={topPts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={isDark ? '#0F172A' : '#FFFFFF'}
            fillOpacity={isDark ? 0.9 : 0.92}
          />
          <polygon
            points={topPts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={color}
            fillOpacity={isDark ? 0.28 : 0.22}
            stroke={color}
            strokeWidth={2.2}
          />
        </g>
      ),
    }
  }

  const renderIsoBuilding = (b: CampusBuilding, fl: number) => {
    const spec = getBuildingShape(b)
    const isTopFloor = fl === Math.max(1, b.floors)
    const drawRoof = showRoofs && isTopFloor

    const mainExtrusion = renderIsoPolygonExtrusion(
      spec.outer,
      fl,
      -BLDG_EXTRUDE,
      0,
      b.color,
      `iso-main-${b.id}-${fl}`,
      true
    )

    const topPts = mainExtrusion.topPts
    const roofCenterX = topPts.reduce((acc, p) => acc + p.x, 0) / topPts.length
    const roofTopY = Math.min(...topPts.map((p) => p.y))
    const polyStr = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')

    // Optional sunken interior courtyard (Edificio B Claustro)
    let courtyardNode: React.ReactNode = null
    if (spec.courtyard) {
      const { x: cx, y: cy, w: cw, h: ch } = spec.courtyard
      const cPts = (
        [
          [cx, cy],
          [cx + cw, cy],
          [cx + cw, cy + ch],
          [cx, cy + ch],
        ] as [number, number][]
      ).map(([px, py]) => project(px, py, fl, 0))
      const cFloorPts = (
        [
          [cx + 4, cy + 4],
          [cx + cw - 4, cy + 4],
          [cx + cw - 4, cy + ch - 4],
          [cx + 4, cy + ch - 4],
        ] as [number, number][]
      ).map(([px, py]) => project(px, py, fl, -8))
      courtyardNode = (
        <g pointerEvents="none" aria-hidden="true">
          <polygon
            points={polyStr(cPts)}
            fill={isDark ? '#022C22' : '#DCFCE7'}
            fillOpacity={0.75}
            stroke={b.color}
            strokeWidth={1.6}
          />
          <polygon
            points={polyStr(cFloorPts)}
            fill={isDark ? '#064E3B' : '#86EFAC'}
            fillOpacity={0.5}
            stroke="#10B981"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        </g>
      )
    }

    // Optional 3D Gothic Central Clock Tower (Edificio A)
    let towerNode: React.ReactNode = null
    if (spec.tower && isTopFloor) {
      const { x: tx, y: ty, w: tw, h: th, extraH } = spec.tower
      const tPoly: [number, number][] = [
        [tx, ty],
        [tx + tw, ty],
        [tx + tw, ty + th],
        [tx, ty + th],
      ]
      const towerExt = renderIsoPolygonExtrusion(
        tPoly,
        fl,
        0,
        extraH,
        b.color,
        `iso-tower-${b.id}-${fl}`,
        false
      )
      const spireApex = project(tx + tw / 2, ty + th / 2, fl, extraH + 18)
      const tTop = towerExt.topPts
      const clockCenter = project(tx + tw / 2, ty + th, fl, extraH * 0.55)
      towerNode = (
        <g pointerEvents="none" aria-hidden="true">
          {towerExt.element}
          {drawRoof &&
            [0, 1, 2, 3].map((i) => {
              const j = (i + 1) % 4
              return (
                <polygon
                  key={`spire-${i}`}
                  points={`${tTop[i].x},${tTop[i].y} ${tTop[j].x},${tTop[j].y} ${spireApex.x},${spireApex.y}`}
                  fill={b.color}
                  fillOpacity={0.45}
                  stroke="#FFFFFF"
                  strokeOpacity={0.75}
                  strokeWidth={1}
                />
              )
            })}
          <circle
            cx={clockCenter.x}
            cy={clockCenter.y}
            r={4.2}
            fill="#FEF08A"
            stroke="#0F172A"
            strokeWidth={1.2}
          />
        </g>
      )
    }

    // Translucent 3D Architectural Roof (`Techos 3D`) matching each building variant
    let roofOverlay: React.ReactNode = null
    if (drawRoof) {
      const roofPeak = 20
      const eavePts = spec.outer.map(([wx, wy]) => {
        const cx = b.x + b.width / 2
        const cy = b.y + b.height / 2
        const dx = wx - cx
        const dy = wy - cy
        const len = Math.hypot(dx, dy) || 1
        return project(wx + (dx / len) * 6, wy + (dy / len) * 6, fl, 0)
      })
      const eaveShadowPts = eavePts.map((p) => `${p.x + 4},${p.y + 6}`).join(' ')

      if (spec.roofKind === 'sawtooth-h') {
        // Two parallel sawtooth / twin-nave pitched roofs for Edificio F
        const naveW = b.width * 0.36
        const naves = [
          { x0: b.x, x1: b.x + naveW },
          { x0: b.x + b.width - naveW, x1: b.x + b.width },
        ]
        roofOverlay = (
          <g pointerEvents="none" aria-hidden="true">
            <polygon points={eaveShadowPts} fill="#020617" fillOpacity={0.14} />
            {naves.map((nv, ni) => {
              const rA = project((nv.x0 + nv.x1) / 2, b.y + b.height * 0.16, fl, roofPeak)
              const rB = project((nv.x0 + nv.x1) / 2, b.y + b.height * 0.84, fl, roofPeak)
              const c0 = project(nv.x0 - 4, b.y - 4, fl, 0)
              const c1 = project(nv.x1 + 4, b.y - 4, fl, 0)
              const c2 = project(nv.x1 + 4, b.y + b.height + 4, fl, 0)
              const c3 = project(nv.x0 - 4, b.y + b.height + 4, fl, 0)
              return (
                <g key={`saw-${ni}`}>
                  <polygon points={polyStr([c0, c1, rA])} fill={b.color} fillOpacity={0.26} stroke={b.color} strokeWidth={1.1} />
                  <polygon points={polyStr([c1, c2, rB, rA])} fill={b.color} fillOpacity={0.22} stroke={b.color} strokeWidth={1.1} />
                  <polygon points={polyStr([c2, c3, rB])} fill={b.color} fillOpacity={0.18} stroke={b.color} strokeWidth={1.1} />
                  <polygon points={polyStr([c3, c0, rA, rB])} fill={b.color} fillOpacity={0.24} stroke={b.color} strokeWidth={1.1} />
                  <line x1={rA.x} y1={rA.y} x2={rB.x} y2={rB.y} stroke="#FFFFFF" strokeWidth={2.2} strokeOpacity={0.85} strokeLinecap="round" />
                </g>
              )
            })}
          </g>
        )
      } else {
        // Multi-faceted hipped / octagonal roof following the non-rectangular outer perimeter
        const wide = b.width >= b.height
        const ridgeA = wide
          ? project(b.x + b.width * 0.26, b.y + b.height * 0.44, fl, roofPeak)
          : project(b.x + b.width * 0.5, b.y + b.height * 0.26, fl, roofPeak)
        const ridgeB = wide
          ? project(b.x + b.width * 0.74, b.y + b.height * 0.44, fl, roofPeak)
          : project(b.x + b.width * 0.5, b.y + b.height * 0.74, fl, roofPeak)

        const skyInsetX = b.width * 0.28
        const skyInsetY = b.height * 0.28
        const skylightPts = (
          [
            [b.x + skyInsetX, b.y + skyInsetY],
            [b.x + b.width - skyInsetX, b.y + skyInsetY],
            [b.x + b.width - skyInsetX, b.y + b.height - skyInsetY],
            [b.x + skyInsetX, b.y + b.height - skyInsetY],
          ] as [number, number][]
        ).map(([x, y]) => project(x, y, fl, roofPeak * 0.65))

        roofOverlay = (
          <g pointerEvents="none" aria-hidden="true">
            <polygon points={eaveShadowPts} fill="#020617" fillOpacity={0.13} />
            {eavePts.map((ep, i) => {
              const nextEp = eavePts[(i + 1) % eavePts.length]
              const midX = (ep.x + nextEp.x) / 2
              const apex = Math.abs(midX - ridgeA.x) <= Math.abs(midX - ridgeB.x) ? ridgeA : ridgeB
              const op = i % 2 === 0 ? 0.24 : 0.18
              return (
                <polygon
                  key={`facet-${i}`}
                  points={polyStr([ep, nextEp, apex])}
                  fill={b.color}
                  fillOpacity={op}
                  stroke={b.color}
                  strokeOpacity={0.55}
                  strokeWidth={1.1}
                />
              )
            })}
            <polygon
              points={polyStr(skylightPts)}
              fill="#38BDF8"
              fillOpacity={0.18}
              stroke="#FFFFFF"
              strokeOpacity={0.82}
              strokeWidth={1.2}
              strokeDasharray="4 3"
            />
            <line
              x1={ridgeA.x}
              y1={ridgeA.y}
              x2={ridgeB.x}
              y2={ridgeB.y}
              stroke="#FFFFFF"
              strokeOpacity={0.88}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          </g>
        )
      }
    }

    const extraPlaqueLift = (drawRoof ? 26 : 12) + (spec.tower && isTopFloor ? 16 : 0)

    return (
      <g key={`iso-bldg-${b.id}-fl-${fl}`}>
        {mainExtrusion.element}
        {courtyardNode}
        {roofOverlay}
        {towerNode}
        {renderBuildingPlaque(roofCenterX, roofTopY - extraPlaqueLift, b.name, b.color, true)}
      </g>
    )
  }

  const renderTopBuilding = (b: CampusBuilding, fl: number) => {
    const spec = getBuildingShape(b)
    const polyPts = spec.outer.map(([x, y]) => project(x, y, fl, 0))
    const polyStr = polyPts.map((p) => `${p.x},${p.y}`).join(' ')
    const shadowStr = polyPts.map((p) => `${p.x + 4},${p.y + 6}`).join(' ')
    const rx = Math.min(...polyPts.map((p) => p.x))
    const ry = Math.min(...polyPts.map((p) => p.y))
    const rw = Math.max(...polyPts.map((p) => p.x)) - rx
    const rh = Math.max(...polyPts.map((p) => p.y)) - ry
    const drawRoof = showRoofs && fl === Math.max(1, b.floors)

    return (
      <g key={`top-bldg-${b.id}-fl-${fl}`}>
        <polygon points={shadowStr} fill="#020617" fillOpacity={isDark ? 0.35 : 0.1} />
        <polygon
          points={polyStr}
          fill={isDark ? '#0F172A' : '#FFFFFF'}
          stroke={b.color}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
        <polygon points={polyStr} fill={b.color} fillOpacity={isDark ? 0.24 : 0.16} strokeLinejoin="round" />

        {spec.courtyard && (() => {
          const { x: cx, y: cy, w: cw, h: ch } = spec.courtyard
          const cPts = (
            [
              [cx, cy],
              [cx + cw, cy],
              [cx + cw, cy + ch],
              [cx, cy + ch],
            ] as [number, number][]
          ).map(([px, py]) => project(px, py, fl, 0))
          return (
            <polygon
              points={cPts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={isDark ? '#064E3B' : '#DCFCE7'}
              fillOpacity={0.75}
              stroke="#10B981"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )
        })()}

        {spec.tower && (() => {
          const { x: tx, y: ty, w: tw, h: th } = spec.tower
          const tPts = (
            [
              [tx, ty],
              [tx + tw, ty],
              [tx + tw, ty + th],
              [tx, ty + th],
            ] as [number, number][]
          ).map(([px, py]) => project(px, py, fl, 0))
          return (
            <polygon
              points={tPts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={b.color}
              fillOpacity={0.35}
              stroke="#FFFFFF"
              strokeWidth={1.5}
              pointerEvents="none"
            />
          )
        })()}

        {drawRoof && (
          <g pointerEvents="none" aria-hidden="true" opacity={0.5}>
            <line
              x1={rx + rw * 0.25}
              y1={ry + rh * 0.45}
              x2={rx + rw * 0.75}
              y2={ry + rh * 0.45}
              stroke={isDark ? '#FFFFFF' : b.color}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          </g>
        )}

        {renderBuildingPlaque(rx + rw / 2, ry - 10, b.name, b.color, false)}
      </g>
    )
  }

  const renderCardinalEdgeLabels = (fl: number) => {
    const midX = (worldMinX + worldMaxX) / 2
    const midY = (worldMinY + worldMaxY) / 2
    const edges: { key: string; wx: number; wy: number; text: string; isNorth?: boolean }[] = [
      { key: 'N', wx: midX, wy: worldMinY - 22, text: 'N · Av. Placeres', isNorth: true },
      { key: 'S', wx: midX, wy: worldMaxY + 22, text: 'S · Av. España' },
      { key: 'O', wx: worldMinX - 22, wy: midY, text: 'O · Informática' },
      { key: 'E', wx: worldMaxX + 22, wy: midY, text: 'E · Jardines / Ed. F' },
    ]
    return (
      <g aria-hidden="true" pointerEvents="none">
        {edges.map((item) => {
          const p = project(item.wx, item.wy, fl, -BLDG_EXTRUDE)
          const pillW = Math.max(96, item.text.length * 6.2 + 18)
          return (
            <g key={`cardinal-${item.key}`} transform={`translate(${p.x}, ${p.y})`}>
              <rect
                x={-pillW / 2}
                y={-10}
                width={pillW}
                height={20}
                rx={10}
                fill={isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255,255,255,0.92)'}
                stroke={item.isNorth ? '#EF4444' : isDark ? '#475569' : '#94A3B8'}
                strokeWidth={item.isNorth ? 1.5 : 1.1}
              />
              <text
                y={3.5}
                textAnchor="middle"
                fontFamily="'Space Grotesk', system-ui, sans-serif"
                fontSize="10"
                fontWeight="700"
                fill={item.isNorth ? '#EF4444' : isDark ? '#E2E8F0' : '#334155'}
              >
                {item.text}
              </text>
            </g>
          )
        })}
      </g>
    )
  }

  const renderFloorBaseSlab = (fl: number, idx: number) => {
    const subtitle = fl === 1 ? 'Planta baja' : fl === 2 ? 'Nivel superior' : `Nivel ${fl}`

    const flBuildings = buildings.filter((b) => fl <= Math.max(1, b.floors))
    const flNodes = map.nodes.filter((n) => n.floor === fl)
    let sxMin = worldMinX - 28
    let sxMax = worldMaxX + 28
    let syMin = worldMinY - 28
    let syMax = worldMaxY + 28

    if (viewMode === 'iso' && stacked && idx > 0 && (flBuildings.length > 0 || flNodes.length > 0)) {
      const xs: number[] = []
      const ys: number[] = []
      for (const b of flBuildings) {
        xs.push(b.x - 24, b.x + b.width + 24)
        ys.push(b.y - 24, b.y + b.height + 24)
      }
      for (const n of flNodes) {
        const p = spacedCoords.get(n.id) ?? n
        xs.push(p.x - 28, p.x + 28)
        ys.push(p.y - 28, p.y + 28)
      }
      sxMin = Math.min(...xs)
      sxMax = Math.max(...xs)
      syMin = Math.min(...ys)
      syMax = Math.max(...ys)
    }

    const slabElev = viewMode === 'iso' ? -BLDG_EXTRUDE : 0
    const gridStep = 140
    const gxStart = Math.ceil(sxMin / gridStep) * gridStep
    const gyStart = Math.ceil(syMin / gridStep) * gridStep
    const gridXLines: { p0: { x: number; y: number }; p1: { x: number; y: number }; gx: number }[] = []
    for (let gx = gxStart; gx <= sxMax; gx += gridStep) {
      gridXLines.push({
        gx,
        p0: project(gx, syMin, fl, slabElev),
        p1: project(gx, syMax, fl, slabElev),
      })
    }
    const gridYLines: { p0: { x: number; y: number }; p1: { x: number; y: number }; gy: number }[] = []
    for (let gy = gyStart; gy <= syMax; gy += gridStep) {
      gridYLines.push({
        gy,
        p0: project(sxMin, gy, fl, slabElev),
        p1: project(sxMax, gy, fl, slabElev),
      })
    }
    const gridTicks: { x: number; y: number }[] = []
    for (let gx = Math.ceil(sxMin / 280) * 280; gx <= sxMax; gx += 280) {
      for (let gy = Math.ceil(syMin / 280) * 280; gy <= syMax; gy += 280) {
        gridTicks.push(project(gx, gy, fl, slabElev))
      }
    }

    const parterres =
      fl === 1
        ? [
            { x1: 260, y1: 180, x2: 760, y2: 480 },
            { x1: 1660, y1: 360, x2: 2000, y2: 620 },
            { x1: 220, y1: 840, x2: 560, y2: 1200 },
            { x1: 1180, y1: 880, x2: 1360, y2: 1060 },
          ]
        : []

    const renderFloorTextureLayer = () => (
      <g pointerEvents="none" aria-hidden="true">
        {gridXLines.map((ln) => (
          <line
            key={`gx-${ln.gx}`}
            x1={ln.p0.x}
            y1={ln.p0.y}
            x2={ln.p1.x}
            y2={ln.p1.y}
            stroke={isDark ? 'rgba(51, 65, 85, 0.36)' : 'rgba(148, 163, 184, 0.24)'}
            strokeWidth={0.9}
          />
        ))}
        {gridYLines.map((ln) => (
          <line
            key={`gy-${ln.gy}`}
            x1={ln.p0.x}
            y1={ln.p0.y}
            x2={ln.p1.x}
            y2={ln.p1.y}
            stroke={isDark ? 'rgba(51, 65, 85, 0.36)' : 'rgba(148, 163, 184, 0.24)'}
            strokeWidth={0.9}
          />
        ))}
        {gridTicks.map((pt, ti) => (
          <g
            key={`gt-${ti}`}
            stroke={isDark ? 'rgba(100, 116, 139, 0.5)' : 'rgba(100, 116, 139, 0.38)'}
            strokeWidth={1.1}
          >
            <line x1={pt.x - 3.5} y1={pt.y} x2={pt.x + 3.5} y2={pt.y} />
            <line x1={pt.x} y1={pt.y - 2.2} x2={pt.x} y2={pt.y + 2.2} />
          </g>
        ))}
        {parterres.map((gBox, gi) => {
          const gPts = (
            [
              [gBox.x1, gBox.y1],
              [gBox.x2, gBox.y1],
              [gBox.x2, gBox.y2],
              [gBox.x1, gBox.y2],
            ] as [number, number][]
          ).map(([wx, wy]) => project(wx, wy, fl, slabElev))
          const trees: [number, number][] = [
            [gBox.x1 + (gBox.x2 - gBox.x1) * 0.28, gBox.y1 + (gBox.y2 - gBox.y1) * 0.34],
            [gBox.x1 + (gBox.x2 - gBox.x1) * 0.72, gBox.y1 + (gBox.y2 - gBox.y1) * 0.66],
          ]
          return (
            <g key={`parterre-${gi}`}>
              <polygon
                points={gPts.map((p) => `${p.x},${p.y}`).join(' ')}
                fill={isDark ? 'rgba(6, 78, 59, 0.26)' : 'rgba(187, 247, 208, 0.42)'}
                stroke={isDark ? '#065F46' : '#86EFAC'}
                strokeWidth={1.2}
              />
              {trees.map(([tx, ty], tri) => {
                const tp = project(tx, ty, fl, slabElev + (viewMode === 'iso' ? 5 : 0))
                return (
                  <g key={`tree-${tri}`} transform={`translate(${tp.x}, ${tp.y})`}>
                    <ellipse cx={2.5} cy={4} rx={8} ry={5} fill="rgba(2, 6, 23, 0.18)" />
                    <circle
                      r={7}
                      fill={isDark ? '#047857' : '#4ADE80'}
                      fillOpacity={0.72}
                      stroke={isDark ? '#10B981' : '#16A34A'}
                      strokeWidth={1.1}
                    />
                    <circle cx={-2} cy={-2} r={2.8} fill="#BBF7D0" fillOpacity={0.45} />
                  </g>
                )
              })}
            </g>
          )
        })}
      </g>
    )

    if (viewMode === 'top') {
      const dx = idx * (deckW + deckGap) + offsetX - 18
      const dy = offsetY - 18
      const dw = deckW + 36
      const dh = deckH + 36
      return (
        <g key={`top-deck-${fl}`}>
          <rect
            x={dx + 3}
            y={dy + 6}
            width={dw}
            height={dh}
            rx={22}
            fill={isDark ? '#020617' : '#CBD5E1'}
            fillOpacity={0.75}
          />
          <rect
            x={dx}
            y={dy}
            width={dw}
            height={dh}
            rx={22}
            fill={isDark ? '#0F172A' : '#F8FAFC'}
            stroke={isDark ? '#334155' : '#CBD5E1'}
            strokeWidth={1.8}
          />
          {renderFloorTextureLayer()}
          <g transform={`translate(${dx + dw / 2}, ${dy - 14})`}>
            <rect x={-105} y={-14} width={210} height={26} rx={13} fill="#0F172A" stroke="#FFFFFF" strokeWidth={1.8} />
            <text
              y={3}
              textAnchor="middle"
              fontFamily="'Space Grotesk', system-ui, sans-serif"
              fontSize="11.5"
              fontWeight="700"
              fill="#FFFFFF"
            >
              {`Piso ${fl} (${subtitle})`}
            </text>
          </g>
        </g>
      )
    }

    const slabCorners: [number, number][] = [
      [sxMin, syMin],
      [sxMax, syMin],
      [sxMax, syMax],
      [sxMin, syMax],
    ]
    const slabTop = slabCorners.map(([x, y]) => project(x, y, fl, -BLDG_EXTRUDE))
    const slabBot = slabCorners.map(([x, y]) => project(x, y, fl, -BLDG_EXTRUDE - 12))
    const slabWalls = [0, 1, 2, 3]
      .map((i) => {
        const j = (i + 1) % 4
        return {
          midY: (slabBot[i].y + slabBot[j].y) / 2,
          pts: `${slabBot[i].x},${slabBot[i].y} ${slabBot[j].x},${slabBot[j].y} ${slabTop[j].x},${slabTop[j].y} ${slabTop[i].x},${slabTop[i].y}`,
        }
      })
      .sort((a, c) => c.midY - a.midY)
      .slice(0, 2)

    const leftMost = slabTop.reduce((best, p) => (p.x < best.x ? p : best), slabTop[0])

    return (
      <g key={`iso-deck-${fl}`}>
        {slabWalls.map((w, wi) => (
          <polygon
            key={`rim-${wi}`}
            points={w.pts}
            fill={isDark ? (idx === 0 ? '#1E293B' : '#0EA5E9') : idx === 0 ? '#CBD5E1' : '#94A3B8'}
            fillOpacity={idx === 0 ? 0.95 : 0.45}
            stroke={isDark ? '#334155' : '#94A3B8'}
            strokeWidth={0.8}
          />
        ))}
        <polygon
          points={slabTop.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={isDark ? (idx === 0 ? '#0F172A' : '#082F49') : idx === 0 ? '#F8FAFC' : '#E0F2FE'}
          fillOpacity={idx === 0 ? 0.96 : 0.38}
          stroke={idx === 0 ? (isDark ? '#334155' : '#94A3B8') : '#38BDF8'}
          strokeWidth={idx === 0 ? 1.6 : 1.8}
          strokeDasharray={idx === 0 ? undefined : '7 4'}
        />

        {/* Projected 3D Paver Grid Texture & Campus Green Parterres */}
        {renderFloorTextureLayer()}

        <g transform={`translate(${leftMost.x + 14}, ${leftMost.y + 4})`}>
          <rect
            x={-8}
            y={-12}
            width={154}
            height={23}
            rx={11.5}
            fill={idx === 0 ? '#0F172A' : '#0284C7'}
            stroke="#FFFFFF"
            strokeWidth={1.5}
          />
          <text
            x={69}
            y={3.5}
            textAnchor="middle"
            fontFamily="'Space Grotesk', system-ui, sans-serif"
            fontSize="10.5"
            fontWeight="700"
            fill="#FFFFFF"
          >
            {`Piso ${fl} (${subtitle})`}
          </text>
        </g>
      </g>
    )
  }

  const renderPavedPlazaTile = (n: CampusNode) => {
    const p = projectNode(n)
    const rx = viewMode === 'iso' ? 27 : 22
    const ry = viewMode === 'iso' ? 15.5 : 22
    return (
      <g key={`plaza-${n.id}`} transform={`translate(${p.x}, ${p.y})`} pointerEvents="none" aria-hidden="true">
        {/* 3D Plaza Drop Shadow */}
        <ellipse cx={3.5} cy={5.5} rx={rx + 3} ry={ry + 2.5} fill="rgba(2, 6, 23, 0.28)" />
        {/* 3D Stone Kerb Lip */}
        <ellipse
          cx={1}
          cy={2.2}
          rx={rx + 2}
          ry={ry + 1.5}
          fill={isDark ? '#334155' : '#475569'}
          stroke={isDark ? '#475569' : '#334155'}
          strokeWidth={1}
        />
        {/* Paved Cobblestone Roundabout Terrace */}
        <ellipse
          cx={0}
          cy={0}
          rx={rx}
          ry={ry}
          fill={isDark ? '#1E293B' : '#94A3B8'}
          stroke={isDark ? '#64748B' : '#F8FAFC'}
          strokeWidth={1.8}
        />
        {/* Concentric Paver Joint Ring */}
        <ellipse
          cx={0}
          cy={0}
          rx={rx * 0.65}
          ry={ry * 0.65}
          fill="none"
          stroke={isDark ? '#94A3B8' : '#E2E8F0'}
          strokeWidth={1.2}
          strokeDasharray="4 3"
        />
      </g>
    )
  }

  const renderEdge = (e: CampusEdge) => {
    const s = EDGE_STYLE[e.edge_type]
    const nodeA = nodeMap.get(e.from_node_id)!
    const nodeB = nodeMap.get(e.to_node_id)!
    const projPts = getEdgeProjectedWaypoints(e)
    const ptsStr = projPts.map((pt) => `${pt.x},${pt.y}`).join(' ')
    const shadowPtsStr = projPts.map((pt) => `${pt.x + 3},${pt.y + 4.5}`).join(' ')
    const blocked = isEdgeBlocked(e)
    const warning = isEdgeWarning(e)
    const hasIncident = blocked || warning || edgeIncidents.has(e.id)
    const hasActiveRoute = routeEdgeSet.size > 0
    const onRoute = routeEdgeSet.has(e.id)
    const groupOpacity = hasIncident ? 0.92 : hasActiveRoute && !onRoute ? 0.36 : 0.76
    const covLabel = e.is_covered ? 'techado' : 'descubierto'
    const isStairs = e.edge_type === 'stairs'
    const dz = Math.abs((nodeB.z ?? 0) - (nodeA.z ?? 0))

    // Middle segment for badges & stair treads
    const midSegIdx = Math.floor((projPts.length - 1) / 2)
    const segA = projPts[midSegIdx] ?? projPts[0]
    const segB = projPts[midSegIdx + 1] ?? projPts[projPts.length - 1]
    const dx = segB.x - segA.x
    const dy = segB.y - segA.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const stepCount = isStairs ? Math.max(4, Math.min(10, Math.floor(len / 12))) : 0
    const mx = (segA.x + segB.x) / 2
    const my = (segA.y + segB.y) / 2

    const carriageColor = blocked
      ? isDark
        ? '#7F1D1D'
        : '#FECACA'
      : warning
        ? '#FEF08A'
        : e.edge_type === 'ramp'
          ? isDark
            ? '#064E3B'
            : '#D1FAE5'
          : isStairs
            ? isDark
              ? '#3B1D0A'
              : '#FEF3C7'
            : e.is_covered
              ? isDark
                ? '#1E293B'
                : '#DBEAFE'
              : isDark
                ? '#0F172A'
                : '#E2E8F0'

    const cornerIndices =
      projPts.length > 2 ? Array.from({ length: projPts.length - 2 }, (_, i) => i + 1) : []

    return (
      <g key={e.id} opacity={groupOpacity}>
        {/* 1. Soft street ground shadow */}
        <polyline
          points={shadowPtsStr}
          fill="none"
          stroke={isDark ? 'rgba(2, 6, 23, 0.28)' : 'rgba(15, 23, 42, 0.08)'}
          strokeWidth={19}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 2. Outer sidewalk / concrete curb (acera y solera) */}
        <polyline
          points={ptsStr}
          fill="none"
          stroke={blocked ? '#991B1B' : isDark ? '#1E293B' : '#CBD5E1'}
          strokeWidth={16}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 3. Inner curb rim (borde de solera) */}
        <polyline
          points={ptsStr}
          fill="none"
          stroke={blocked ? '#FECACA' : isDark ? '#334155' : '#F8FAFC'}
          strokeWidth={13.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 4. Muted carriageway (calzada tenue) */}
        <polyline
          points={ptsStr}
          fill="none"
          stroke={carriageColor}
          strokeWidth={11}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 5. Muted center lane dashed line or blocked hazard stripes */}
        <polyline
          points={ptsStr}
          fill="none"
          stroke={
            blocked
              ? '#DC2626'
              : warning
                ? '#D97706'
                : e.edge_type === 'ramp'
                  ? '#10B981'
                  : isDark
                    ? '#334155'
                    : '#94A3B8'
          }
          strokeWidth={blocked ? 3.8 : e.edge_type === 'ramp' ? 2.2 : 1.1}
          strokeDasharray={blocked ? '7 5' : '6 7'}
          opacity={blocked ? 0.96 : 0.55}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <title>{`${s.label} (${e.distance_m} m, ${covLabel}${dz > 0 ? `, desnivel ${dz} m` : ''})${
            blocked ? ' — ⛔ CERRADO POR INCIDENCIA' : hasIncident ? ' — precaución' : ''
          }`}</title>
        </polyline>

        {/* 90° Street Corner Junction Pads & Pedestrian Zebra Crosswalks (Pasos de Cebra) */}
        {cornerIndices.map((ci) => {
          const prev = projPts[ci - 1]
          const curr = projPts[ci]
          const next = projPts[ci + 1]
          const legs = [prev, next]
          return (
            <g key={`corner-${ci}`} pointerEvents="none" aria-hidden="true">
              <circle
                cx={curr.x}
                cy={curr.y}
                r={8.5}
                fill={carriageColor}
                stroke={isDark ? '#334155' : '#CBD5E1'}
                strokeWidth={1.5}
              />
              {legs.map((target, li) => {
                const ldx = target.x - curr.x
                const ldy = target.y - curr.y
                const lLen = Math.hypot(ldx, ldy) || 1
                if (lLen < 26) return null
                const ux = ldx / lLen
                const uy = ldy / lLen
                const px = -uy
                const py = ux
                return (
                  <g key={`zebra-${li}`}>
                    {[-3, 0, 3].map((off, si) => {
                      const bx = curr.x + ux * 14 + px * off
                      const by = curr.y + uy * 14 + py * off
                      return (
                        <line
                          key={`zs-${si}`}
                          x1={bx - ux * 2.6}
                          y1={by - uy * 2.6}
                          x2={bx + ux * 2.6}
                          y2={by + uy * 2.6}
                          stroke={isDark ? '#94A3B8' : '#FFFFFF'}
                          strokeOpacity={0.78}
                          strokeWidth={1.3}
                          strokeLinecap="round"
                        />
                      )
                    })}
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* Live ⛔ CERRADO badge on blocked paths */}
        {blocked && (
          <g transform={`translate(${mx}, ${my})`} pointerEvents="none" role="img" aria-label={`Camino cerrado: ${s.label}`}>
            <rect
              x={-35}
              y={-9}
              width={70}
              height={17}
              rx={8.5}
              fill="#DC2626"
              stroke="#FFFFFF"
              strokeWidth={1.5}
              filter={shadowFilterUrl}
            />
            <text y={3} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#FFFFFF">
              ⛔ CERRADO
            </text>
          </g>
        )}

        {/* 3D perpendicular stair treads + elevation Δz marker on outdoor/elevation stairs */}
        {isStairs && (
          <g pointerEvents="none" aria-hidden="true" opacity={hasIncident ? 0.96 : 0.78}>
            {Array.from({ length: stepCount }, (_, i) => {
              const t = (i + 1) / (stepCount + 1)
              const px = segA.x + dx * t
              const py = segA.y + dy * t
              return (
                <g key={`tread-${i}`}>
                  <line
                    x1={px - nx * 5 + 1}
                    y1={py - ny * 5 + 1.5}
                    x2={px + nx * 5 + 1}
                    y2={py + ny * 5 + 1.5}
                    stroke="#9A3412"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                  />
                  <line
                    x1={px - nx * 5}
                    y1={py - ny * 5}
                    x2={px + nx * 5}
                    y2={py + ny * 5}
                    stroke="#FFF7ED"
                    strokeWidth={1.4}
                    strokeLinecap="round"
                  />
                </g>
              )
            })}
            <g transform={`translate(${mx + nx * 16}, ${my + ny * 16})`}>
              <rect
                x={dz > 0 ? -27 : -14}
                y={-8.5}
                width={dz > 0 ? 54 : 28}
                height={16}
                rx={8}
                fill="#EA580C"
                stroke="#FFFFFF"
                strokeWidth={1.3}
              />
              <text y={3} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#FFFFFF">
                {dz > 0 ? `🪜 Δz ${dz}m` : '🪜'}
              </text>
            </g>
          </g>
        )}
      </g>
    )
  }

  const renderFloorConnectors = (fl: number) =>
    crossFloorEdges
      .filter((e) => {
        const a = nodeMap.get(e.from_node_id)!
        const b = nodeMap.get(e.to_node_id)!
        return Math.max(a.floor, b.floor) === fl
      })
      .map((e) => {
        const a = nodeMap.get(e.from_node_id)!
        const b = nodeMap.get(e.to_node_id)!
        const lower = a.floor < b.floor ? a : b
        const upper = a.floor < b.floor ? b : a
        const pa = projectNode(lower)
        const pb = projectNode(upper)
        const s = EDGE_STYLE[e.edge_type]
        const inc = edgeIncidents.get(e.id)
        const blocked = isEdgeBlocked(e)
        const hasIncident = Boolean(inc) || blocked
        const onRoute = routeEdgeSet.has(e.id)
        const isStairs = e.edge_type === 'stairs'
        const lowFl = lower.floor
        const highFl = upper.floor
        const shaftTitle = `Conexión vertical (${s.label}): Piso ${lowFl} a Piso ${highFl}${
          hasIncident ? ' — fuera de servicio' : ''
        }`
        const badgeText = blocked
          ? `⛔ ${isStairs ? 'ESCALERA' : 'ASCENSOR'} CERRADO`
          : isStairs
            ? `🪜 ESCALERA P${lowFl}↔P${highFl}`
            : `🛗 ASCENSOR ${lowFl}↔${highFl}`
        const badgeW = blocked ? 116 : isStairs ? 104 : 96
        const badgeFill = hasIncident ? '#DC2626' : isStairs ? '#EA580C' : '#7C3AED'

        if (viewMode === 'iso') {
          const mx = (pa.x + pb.x) / 2
          const my = (pa.y + pb.y) / 2

          if (isStairs) {
            const landingX = mx + 26
            const landingY = my
            const stairStroke = hasIncident || onRoute ? '#DC2626' : '#EA580C'
            const railStroke = hasIncident || onRoute ? '#FCA5A5' : '#FDBA74'
            const flights: [{ x: number; y: number }, { x: number; y: number }][] = [
              [pa, { x: landingX, y: landingY }],
              [{ x: landingX, y: landingY }, pb],
            ]

            return (
              <g key={`stairs-shaft-${e.id}`}>
                <title>{shaftTitle}</title>
                <polyline
                  points={`${pa.x + 5},${pa.y + 5} ${landingX + 5},${landingY + 5} ${pb.x + 5},${pb.y + 5}`}
                  fill="none"
                  stroke="rgba(15, 23, 42, 0.26)"
                  strokeWidth={18}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <polyline
                  points={`${pa.x},${pa.y} ${landingX},${landingY} ${pb.x},${pb.y}`}
                  fill="none"
                  stroke={hasIncident ? '#FECACA' : isDark ? '#431407' : '#FFEDD5'}
                  strokeWidth={16}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <polyline
                  points={`${pa.x - 7},${pa.y} ${landingX - 7},${landingY} ${pb.x - 7},${pb.y}`}
                  fill="none"
                  stroke={stairStroke}
                  strokeWidth={2.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <polyline
                  points={`${pa.x + 7},${pa.y} ${landingX + 7},${landingY} ${pb.x + 7},${pb.y}`}
                  fill="none"
                  stroke={stairStroke}
                  strokeWidth={2.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <polyline
                  points={`${pa.x + 7},${pa.y - 6} ${landingX + 7},${landingY - 6} ${pb.x + 7},${pb.y - 6}`}
                  fill="none"
                  stroke={railStroke}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {flights.map(([p0, p1], fi) =>
                  Array.from({ length: 6 }, (_, ti) => {
                    const t = (ti + 1) / 7
                    const sx = p0.x + (p1.x - p0.x) * t
                    const sy = p0.y + (p1.y - p0.y) * t
                    return (
                      <line
                        key={`st-${fi}-${ti}`}
                        x1={sx - 6.5}
                        y1={sy}
                        x2={sx + 6.5}
                        y2={sy}
                        stroke={stairStroke}
                        strokeWidth={2.2}
                        strokeLinecap="round"
                      />
                    )
                  })
                )}
                <rect
                  x={landingX - 10}
                  y={landingY - 5}
                  width={20}
                  height={10}
                  rx={3}
                  fill={isDark ? '#1E293B' : '#FFF7ED'}
                  stroke={stairStroke}
                  strokeWidth={1.6}
                />
                <g transform={`translate(${landingX + 58}, ${landingY})`} pointerEvents="none" aria-hidden="true">
                  <rect
                    x={-badgeW / 2}
                    y={-10}
                    width={badgeW}
                    height={19}
                    rx={9.5}
                    fill={badgeFill}
                    stroke="#FFFFFF"
                    strokeWidth={1.5}
                    filter={shadowFilterUrl}
                  />
                  <text y={3} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#FFFFFF">
                    {badgeText}
                  </text>
                </g>
                {inc &&
                  renderIncidentBadge(
                    landingX,
                    landingY,
                    `inc-cross-${e.id}`,
                    `Tramo vertical fuera de servicio: ${inc.description}`
                  )}
              </g>
            )
          }

          const elevStroke = hasIncident || onRoute ? '#DC2626' : s.stroke
          return (
            <g key={`shaft-${e.id}`}>
              <title>{shaftTitle}</title>
              <line
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={hasIncident ? '#FECACA' : onRoute ? '#FCA5A5' : isDark ? '#4C1D95' : '#DDD6FE'}
                strokeWidth={14}
                strokeOpacity={0.55}
                strokeLinecap="round"
              />
              <line x1={pa.x - 5} y1={pa.y} x2={pb.x - 5} y2={pb.y} stroke={elevStroke} strokeWidth={1.6} strokeOpacity={0.75} />
              <line x1={pa.x + 5} y1={pa.y} x2={pb.x + 5} y2={pb.y} stroke={elevStroke} strokeWidth={1.6} strokeOpacity={0.75} />
              <line
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={elevStroke}
                strokeWidth={hasIncident || onRoute ? 3.8 : 2.8}
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
              <g transform={`translate(${mx - 58}, ${my})`} pointerEvents="none" aria-hidden="true">
                <rect
                  x={-badgeW / 2}
                  y={-10}
                  width={badgeW}
                  height={19}
                  rx={9.5}
                  fill={badgeFill}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                  filter={shadowFilterUrl}
                />
                <text y={3} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#FFFFFF">
                  {badgeText}
                </text>
              </g>
              {inc &&
                renderIncidentBadge(
                  mx,
                  my,
                  `inc-cross-${e.id}`,
                  `Tramo vertical fuera de servicio: ${inc.description}`
                )}
            </g>
          )
        }

        const midX = (pa.x + pb.x) / 2
        const midY = Math.min(pa.y, pb.y) - (isStairs ? 46 : 74)
        const bezMidX = 0.25 * pa.x + 0.5 * midX + 0.25 * pb.x
        const bezMidY = 0.25 * pa.y + 0.5 * midY + 0.25 * pb.y
        return (
          <g key={`bridge-${e.id}`}>
            <path
              d={`M ${pa.x} ${pa.y} Q ${midX} ${midY} ${pb.x} ${pb.y}`}
              fill="none"
              stroke={hasIncident || onRoute ? '#DC2626' : s.stroke}
              strokeWidth={hasIncident || onRoute ? 4 : isStairs ? 3.2 : 2.6}
              strokeDasharray={isStairs ? '4 4' : '6 5'}
              strokeOpacity={hasIncident || onRoute ? 0.92 : 0.72}
            >
              <title>{shaftTitle}</title>
            </path>
            <g transform={`translate(${bezMidX}, ${bezMidY})`} pointerEvents="none" aria-hidden="true">
              <rect
                x={-badgeW / 2}
                y={-9}
                width={badgeW}
                height={18}
                rx={9}
                fill={badgeFill}
                stroke="#FFFFFF"
                strokeWidth={1.3}
              />
              <text y={3} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#FFFFFF">
                {badgeText}
              </text>
            </g>
            {inc &&
              renderIncidentBadge(
                bezMidX,
                bezMidY - 14,
                `inc-cross-${e.id}`,
                `Tramo vertical fuera de servicio: ${inc.description}`
              )}
          </g>
        )
      })

  const renderNode = (n: CampusNode) => {
    const p = projectNode(n)
    const inc = nodeIncidents.get(n.id) ?? (!stacked ? crossFloorNodeIncidents.get(n.id) : undefined)
    const isOrigin = n.id === originId
    const isDest = n.id === destId
    const isEndpoint = isOrigin || isDest
    const onRoute = routeNodeSet.has(n.id) || isEndpoint
    const isEntrance = n.node_type === 'entrance'
    const isSalida = n.id.includes('salida') || n.name.toLowerCase().includes('salida')
    const isPlaza = isPavedPlazaNode(n)
    const linkedFloors = verticalLinks.get(n.id) ?? []
    const vertBadge =
      linkedFloors.length > 0
        ? linkedFloors.map((fl) => `${fl > n.floor ? '↑' : '↓'} P${fl}`).join(' ')
        : ''

    const ariaLabel = `${n.name}, ${isSalida ? 'Salida del campus' : isPlaza ? 'Crucero pavimentado' : NODE_LABEL[n.node_type]}, piso ${n.floor}${
      linkedFloors.length > 0
        ? `, conecta con ${linkedFloors.map((fl) => `piso ${fl}`).join(', ')}`
        : ''
    }${inc ? `, fuera de servicio (${inc.description})` : ''}${
      isOrigin ? ', tu ubicación actual' : ''
    }${isDest ? ', destino meta B' : ''}`

    const labelW = Math.max(58, n.name.length * 5.7 + 16)
    const labelClass = isEndpoint || onRoute || isSalida ? 'cm3d-node-label cm3d-label-pinned' : 'cm3d-node-label'

    return (
      <g key={n.id}>
        {vertBadge && (
          <g transform={`translate(${p.x},${p.y - (isEndpoint ? 102 : 24)})`} aria-hidden="true" pointerEvents="none">
            <rect
              x={-20}
              y={-9}
              width={40}
              height={15}
              rx={7.5}
              fill={n.node_type === 'elevator' ? '#7C3AED' : '#EA580C'}
              stroke="#FFFFFF"
              strokeWidth={1.3}
            />
            <text y={2} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#FFFFFF">
              {vertBadge}
            </text>
          </g>
        )}

        {isEntrance && !vertBadge && (
          <g transform={`translate(${p.x},${p.y - (isEndpoint ? 102 : 23)})`} aria-hidden="true" pointerEvents="none">
            <rect
              x={-30}
              y={-9}
              width={60}
              height={16}
              rx={8}
              fill={isSalida ? '#059669' : '#D97706'}
              stroke="#FFFFFF"
              strokeWidth={1.4}
              filter={shadowFilterUrl}
            />
            <text y={2.5} textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#FFFFFF">
              {isSalida ? '🚪 SALIDA' : '🚪 ACCESO'}
            </text>
          </g>
        )}

        <g
          className="cm3d-node"
          transform={`translate(${p.x},${p.y})`}
          role="button"
          tabIndex={0}
          aria-label={ariaLabel}
          onClick={() => {
            if (suppressClickRef.current) return
            onSelectNode(n.id)
          }}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault()
              onSelectNode(n.id)
            } else if (ev.key === ' ') {
              ev.preventDefault()
            }
          }}
          onKeyUp={(ev) => {
            if (ev.key === ' ') {
              ev.preventDefault()
              onSelectNode(n.id)
            }
          }}
        >
          <title>{ariaLabel}</title>
          {isEntrance && (
            <circle
              r={14.5}
              fill={isSalida ? '#10B981' : '#F59E0B'}
              fillOpacity={0.22}
              stroke={isSalida ? '#059669' : '#D97706'}
              strokeWidth={2}
              strokeDasharray="4 2"
              aria-hidden="true"
            />
          )}
          <circle className="cm3d-ring" r={16} />
          <NodeGlyph type={n.node_type} onRoute={onRoute} isDark={isDark} />
          <g transform="translate(0, 19)" className={labelClass} aria-hidden="true">
            <rect
              x={-labelW / 2}
              y={-9}
              width={labelW}
              height={15}
              rx={7.5}
              fill={isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.94)'}
              stroke={
                isOrigin
                  ? '#0EA5E9'
                  : isDest
                    ? '#15803D'
                    : onRoute
                      ? '#DC2626'
                      : isSalida
                        ? '#059669'
                        : isDark
                          ? '#475569'
                          : '#CBD5E1'
              }
              strokeWidth={isEndpoint || onRoute || isSalida ? 1.4 : 1}
            />
            <text
              y={2}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight={isEndpoint || onRoute || isSalida ? '700' : '600'}
              fill={isDark ? '#F8FAFC' : '#0F172A'}
            >
              {n.name}
            </text>
          </g>
        </g>

        {inc &&
          renderIncidentBadge(
            p.x + 13,
            p.y - 12,
            `inc-node-${n.id}`,
            `${n.name}: fuera de servicio (${inc.description})`
          )}
      </g>
    )
  }

  return (
    <figure className="m-0 flex flex-1 flex-col gap-3">
      {/* Tactile 3D Floating Glass Toolbar */}
      <div
        role="toolbar"
        aria-label="Controles de visualización del mapa 3D"
        className="panel-3d flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2 backdrop-blur-md"
      >
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Selector de piso en el mapa">
          <button
            type="button"
            aria-pressed={stacked}
            onClick={() => handleFloorSelect('stacked')}
            className={`rounded-full px-3 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
              stacked
                ? 'btn-3d-primary bg-slate-900 text-white dark:bg-sky-600 dark:text-white'
                : 'btn-3d bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            Ambos pisos
          </button>
          {floorsList.map((fl) => {
            const active = !stacked && activeFloorView === fl
            return (
              <button
                key={fl}
                type="button"
                aria-pressed={active}
                onClick={() => handleFloorSelect(fl)}
                className={`rounded-full px-3 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
                  active
                    ? 'btn-3d-primary bg-slate-900 text-white dark:bg-sky-600 dark:text-white'
                    : 'btn-3d bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                Piso {fl}
              </button>
            )
          })}

          {/* Live HUD Counter for Available vs Blocked Paved Paths */}
          <span
            role="status"
            aria-live="polite"
            className={`pill-3d ml-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
              isDark
                ? 'border border-slate-700 bg-slate-800/90 text-emerald-300'
                : 'border border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            <span>{`🛣️ Caminos disponibles: ${pathStats.available} / ${pathStats.total}`}</span>
            {pathStats.blocked > 0 && (
              <span className="rounded-full bg-[#DC2626] px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                {`⛔ ${pathStats.blocked} cerrados`}
              </span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className={`pill-3d inline-flex rounded-full p-0.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}
            role="group"
            aria-label="Perspectiva de cámara"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'iso'}
              onClick={() => setViewMode('iso')}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
                viewMode === 'iso'
                  ? 'bg-slate-900 text-white shadow-xs dark:bg-sky-600 dark:text-white'
                  : isDark
                    ? 'text-slate-300 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vista 3D
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'top'}
              onClick={() => setViewMode('top')}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
                viewMode === 'top'
                  ? isDark
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-white text-slate-950 shadow-xs'
                  : isDark
                    ? 'text-slate-300 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cenital
            </button>
          </div>

          <div className="inline-flex items-center gap-1" role="group" aria-label="Rotación de 90 grados">
            <button
              type="button"
              onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
              aria-label="Rotar mapa 90 grados a la izquierda"
              className="btn-3d rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[#DC2626] dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              ↺ -90°
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotar mapa 90 grados a la derecha"
              className="btn-3d rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[#DC2626] dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              ↻ +90°
            </button>
          </div>

          <button
            type="button"
            aria-pressed={showRoofs}
            onClick={() => setShowRoofs((r) => !r)}
            className={`rounded-full px-3 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
              showRoofs
                ? 'btn-3d-primary bg-indigo-600 text-white hover:bg-indigo-700'
                : 'btn-3d bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            🏠 Techos 3D
          </button>

          <button
            type="button"
            aria-pressed={showLabels}
            onClick={() => setShowLabels((s) => !s)}
            className={`btn-3d rounded-full px-3 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
              showLabels
                ? 'bg-slate-200/90 text-slate-900 hover:bg-slate-300/80 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600'
                : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {showLabels ? 'Ocultar nombres' : 'Mostrar nombres'}
          </button>
        </div>
      </div>

      {/* Isometric 3D / Cenital Interactive SVG Stage */}
      <div
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
        style={{ touchAction: zoom > 1 ? 'none' : 'pan-y' }}
        className={`panel-3d relative flex h-[72vh] min-h-[520px] w-full items-center justify-center overflow-hidden rounded-2xl p-1.5 lg:h-[78vh] ${
          zoom > 0.75 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
        } ${
          isDark
            ? 'bg-gradient-to-b from-[#070B14] via-[#0B1120] to-[#0F172A]'
            : 'bg-gradient-to-b from-slate-100 via-slate-100/90 to-slate-200/75'
        }`}
      >
        <CompassRose angleDeg={northAngleDeg} rotation={rotation} onReset={() => setRotation(0)} isDark={isDark} />

        {/* Floating Zoom & Pan HUD */}
        <div
          role="group"
          aria-label="Controles de zoom del mapa"
          className="panel-3d absolute right-3 bottom-3 z-20 inline-flex items-center gap-1 rounded-full px-1.5 py-1 backdrop-blur-md"
        >
          <button
            type="button"
            onClick={() => applyZoom(zoom - ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            aria-label="Alejar mapa"
            title="Alejar mapa"
            className="btn-3d inline-flex size-8 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            ➖
          </button>
          <button
            type="button"
            onClick={resetZoomPan}
            aria-label="Restablecer zoom al 100%"
            title="Restablecer zoom y encuadre (100%)"
            className="btn-3d inline-flex h-8 min-w-[68px] items-center justify-center gap-1 rounded-full bg-white px-2.5 text-xs font-bold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <span aria-hidden="true">🔍</span>
            <span>{`${Math.round(zoom * 100)}%`}</span>
          </button>
          <button
            type="button"
            onClick={() => applyZoom(zoom + ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            aria-label="Acercar mapa"
            title="Acercar mapa"
            className="btn-3d inline-flex size-8 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            ➕
          </button>
        </div>

        <svg
          ref={svgRef}
          viewBox={`${viewX} ${viewY} ${viewW} ${viewH}`}
          preserveAspectRatio="xMidYMid meet"
          className={`h-full w-full select-none${showLabels ? '' : ' cm3d-hide-labels'}`}
          role="group"
          aria-label={`Mapa ${viewMode === 'iso' ? 'isométrico 3D' : 'cenital'} de ${map.campus_name}, ${
            stacked ? `todos los pisos (${floorsList.length} niveles)` : `piso ${activeFloorView}`
          }, rotación ${rotation} grados, zoom ${Math.round(zoom * 100)} por ciento`}
        >
          <defs>
            <filter id={shadowFilterId} x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#0F172A" floodOpacity="0.28" />
            </filter>
          </defs>

          {renderedFloors.map((fl, idx) => {
            const flBuildings = buildings
              .filter((b) => fl <= Math.max(1, b.floors))
              .sort((a, c) => {
                const pa = project(a.x + a.width / 2, a.y + a.height / 2, fl, 0)
                const pc = project(c.x + c.width / 2, c.y + c.height / 2, fl, 0)
                return pa.y - pc.y
              })
            const flEdges = sameFloorEdgesByFloor.get(fl) ?? []
            const flNodes = visibleNodesByFloor.get(fl) ?? []

            return (
              <g key={`floor-layer-${fl}`}>
                {renderFloorBaseSlab(fl, idx)}
                {fl === renderedFloors[0] && renderCardinalEdgeLabels(fl)}

                {idx > 0 && renderFloorConnectors(fl)}

                {flBuildings.map((b) =>
                  viewMode === 'iso' ? renderIsoBuilding(b, fl) : renderTopBuilding(b, fl)
                )}

                {/* 3D Paved Plaza Roundabouts underneath road intersections */}
                {flNodes.filter(isPavedPlazaNode).map(renderPavedPlazaTile)}

                {flEdges.map(renderEdge)}

                {flEdges
                  .filter((e) => edgeIncidents.has(e.id))
                  .map((e) => {
                    const projPts = getEdgeProjectedWaypoints(e)
                    const midIdx = Math.floor((projPts.length - 1) / 2)
                    const segA = projPts[midIdx] ?? projPts[0]
                    const segB = projPts[midIdx + 1] ?? projPts[projPts.length - 1]
                    const inc = edgeIncidents.get(e.id)!
                    return renderIncidentBadge(
                      (segA.x + segB.x) / 2,
                      (segA.y + segB.y) / 2 - 14,
                      `inc-edge-${e.id}`,
                      `Tramo fuera de servicio: ${inc.description}`
                    )
                  })}

                {flNodes.map(renderNode)}
              </g>
            )
          })}

          {(routePolylines.length > 0 || routeVerticals.length > 0) && (
            <g
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="Ruta óptima resaltada"
              pointerEvents="none"
            >
              <title>Ruta óptima resaltada</title>
              {routePolylines.map((pts, i) => (
                <g key={`route-seg-${i}`}>
                  <polyline
                    points={pts}
                    stroke="#EF4444"
                    strokeWidth={14}
                    opacity={0.28}
                    className={`cm3d-route-glow ${animating ? 'cm3d-play' : ''}`}
                  />
                  <polyline points={pts} stroke="#FFFFFF" strokeWidth={7.5} opacity={0.95} />
                  <polyline
                    points={pts}
                    stroke="#DC2626"
                    strokeWidth={4.5}
                    className={`cm3d-route ${animating ? 'cm3d-play' : ''}`}
                  />
                </g>
              ))}
              {routeVerticals.map((v) =>
                v.d ? (
                  <g key={v.key}>
                    <path d={v.d} stroke="#EF4444" strokeWidth={12} opacity={0.24} />
                    <path d={v.d} stroke="#FFFFFF" strokeWidth={6.5} opacity={0.92} />
                    <path
                      d={v.d}
                      stroke="#DC2626"
                      strokeWidth={4}
                      className={`cm3d-route ${animating ? 'cm3d-play' : ''}`}
                    />
                  </g>
                ) : (
                  <g key={v.key}>
                    <line x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2} stroke="#EF4444" strokeWidth={13} opacity={0.24} />
                    <line x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2} stroke="#FFFFFF" strokeWidth={7} opacity={0.94} />
                    <line
                      x1={v.x1}
                      y1={v.y1}
                      x2={v.x2}
                      y2={v.y2}
                      stroke="#DC2626"
                      strokeWidth={4.2}
                      className={`cm3d-route ${animating ? 'cm3d-play' : ''}`}
                    />
                  </g>
                )
              )}
            </g>
          )}

          {(() => {
            const originNode = originId ? nodeMap.get(originId) : undefined
            const destNode = destId ? nodeMap.get(destId) : undefined
            const showOrigin = originNode && isNodeVisible(originNode)
            const showDest = destNode && isNodeVisible(destNode)
            const sameSpot = Boolean(showOrigin && showDest && originNode!.id === destNode!.id)
            const shortName = (s: string) => (s.length > 25 ? `${s.slice(0, 24)}…` : s)
            return (
              <g pointerEvents="none">
                {showOrigin &&
                  (() => {
                    const p = projectNode(originNode!)
                    const ox = p.x + (sameSpot ? -20 : 0)
                    const oy = p.y
                    return (
                      <g
                        transform={`translate(${ox}, ${oy})`}
                        role="img"
                        aria-label={`Tu ubicación actual: ${originNode!.name}${gpsActive ? ' (GPS activo)' : ''}`}
                      >
                        {/* 3D Glowing Podium Beacon (Start) */}
                        <ellipse
                          cx={0}
                          cy={2}
                          rx={39}
                          ry={23.5}
                          fill="rgba(14, 165, 233, 0.10)"
                          stroke="#38BDF8"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                        />
                        <ellipse
                          cx={0}
                          cy={1}
                          rx={24.5}
                          ry={14.8}
                          fill="rgba(14, 165, 233, 0.28)"
                          stroke="#0EA5E9"
                          strokeWidth={2.3}
                        />
                        <polygon
                          points="-22,0 22,0 11,-58 -11,-58"
                          fill="rgba(56, 189, 248, 0.14)"
                        />
                        <g transform="scale(1.32)">
                          <PersonAvatarAsset gpsActive={gpsActive} shadowFilterUrl={shadowFilterUrl} />
                        </g>
                        {/* Floating 3D Callout Banner (Start) */}
                        <g transform="translate(0, -72)">
                          <rect
                            x={-86}
                            y={-18}
                            width={172}
                            height={34}
                            rx={10}
                            fill="#0369A1"
                            stroke="#7DD3FC"
                            strokeWidth={2}
                            filter={shadowFilterUrl}
                          />
                          <polygon points="-7,16 7,16 0,23" fill="#0369A1" stroke="#7DD3FC" strokeWidth={1.5} />
                          <text
                            y={-4}
                            textAnchor="middle"
                            fontFamily="'Space Grotesk', system-ui, sans-serif"
                            fontSize="9.5"
                            fontWeight="800"
                            fill="#E0F2FE"
                          >
                            📍 PUNTO DE INICIO
                          </text>
                          <text
                            y={9.5}
                            textAnchor="middle"
                            fontSize="9.5"
                            fontWeight="700"
                            fill="#FFFFFF"
                          >
                            {shortName(originNode!.name)}
                          </text>
                        </g>
                      </g>
                    )
                  })()}
                {showDest &&
                  (() => {
                    const p = projectNode(destNode!)
                    const dx = p.x + (sameSpot ? 20 : 0)
                    const dy = p.y
                    return (
                      <g
                        transform={`translate(${dx}, ${dy})`}
                        role="img"
                        aria-label={`Destino meta B: ${destNode!.name}`}
                      >
                        {/* 3D Glowing Podium Beacon (Destination) */}
                        <ellipse
                          cx={0}
                          cy={2}
                          rx={39}
                          ry={23.5}
                          fill="rgba(16, 185, 129, 0.11)"
                          stroke="#FACC15"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                        />
                        <ellipse
                          cx={0}
                          cy={1}
                          rx={24.5}
                          ry={14.8}
                          fill="rgba(16, 185, 129, 0.30)"
                          stroke="#10B981"
                          strokeWidth={2.3}
                        />
                        <polygon
                          points="-22,0 22,0 11,-60 -11,-60"
                          fill="rgba(250, 204, 21, 0.15)"
                        />
                        <g transform="scale(1.35)">
                          <DestinationFlagAsset shadowFilterUrl={shadowFilterUrl} />
                        </g>
                        {/* Floating 3D Callout Banner (Destination) */}
                        <g transform="translate(0, -74)">
                          <rect
                            x={-86}
                            y={-18}
                            width={172}
                            height={34}
                            rx={10}
                            fill="#047857"
                            stroke="#FACC15"
                            strokeWidth={2}
                            filter={shadowFilterUrl}
                          />
                          <polygon points="-7,16 7,16 0,23" fill="#047857" stroke="#FACC15" strokeWidth={1.5} />
                          <text
                            y={-4}
                            textAnchor="middle"
                            fontFamily="'Space Grotesk', system-ui, sans-serif"
                            fontSize="9.5"
                            fontWeight="800"
                            fill="#FEF08A"
                          >
                            🏁 META · LLEGADA
                          </text>
                          <text
                            y={9.5}
                            textAnchor="middle"
                            fontSize="9.5"
                            fontWeight="700"
                            fill="#FFFFFF"
                          >
                            {shortName(destNode!.name)}
                          </text>
                        </g>
                      </g>
                    )
                  })()}
              </g>
            )
          })()}
        </svg>
      </div>

      {/* Compact Tactile 3D Legend */}
      <figcaption
        aria-label="Leyenda del mapa"
        className="panel-3d flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-2xl px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200"
      >
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
          <svg width="20" height="20" viewBox="-12 -12 24 24" aria-hidden="true">
            <circle r={10} fill="#0EA5E9" stroke="#FFFFFF" strokeWidth={1.5} />
            <path d="M-5,6 C-5,2.5 -2.8,1 0,1 C2.8,1 5,2.5 5,6" fill="#FFFFFF" />
            <circle cx={0} cy={-3} r={3.2} fill="#FEF3C7" />
          </svg>
          Tu ubicación
        </span>

        <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
          <svg width="20" height="20" viewBox="-6 -18 24 22" aria-hidden="true">
            <line x1={0} y1={2} x2={0} y2={-15} stroke={isDark ? '#F8FAFC' : '#0F172A'} strokeWidth={2} strokeLinecap="round" />
            <path d="M1,-15 L14,-10.5 L1,-6 Z" fill="#FACC15" stroke="#0F172A" strokeWidth={1.2} />
          </svg>
          Meta B
        </span>

        <span className="inline-flex items-center gap-1.5">
          <svg width="28" height="12" aria-hidden="true">
            <line x1="3" y1="6" x2="25" y2="6" stroke={isDark ? '#1E293B' : '#CBD5E1'} strokeWidth={10} strokeLinecap="round" />
            <line x1="3" y1="6" x2="25" y2="6" stroke={isDark ? '#0F172A' : '#E2E8F0'} strokeWidth={6} strokeLinecap="round" />
            <line x1="3" y1="6" x2="25" y2="6" stroke="#94A3B8" strokeWidth={1.1} strokeDasharray="4 4" strokeLinecap="round" />
          </svg>
          Calle / calzada tenue
        </span>

        <span className="inline-flex items-center gap-1.5">
          <svg width="28" height="12" aria-hidden="true">
            <line x1="3" y1="6" x2="25" y2="6" stroke="#BAE6FD" strokeWidth={10} strokeLinecap="round" />
            <line x1="3" y1="6" x2="25" y2="6" stroke="#475569" strokeWidth={2.5} strokeLinecap="round" />
          </svg>
          Techado
        </span>

        <span className="inline-flex items-center gap-1.5">
          <svg width="26" height="10" aria-hidden="true">
            <line x1="2" y1="5" x2="24" y2="5" stroke="#10B981" strokeWidth={3} strokeDasharray="8 3 2 3" strokeLinecap="round" />
          </svg>
          Rampa
        </span>

        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="18" viewBox="-9 -10 18 20" aria-hidden="true">
            <NodeGlyph type="elevator" r={6} isDark={isDark} />
          </svg>
          Ascensor
        </span>

        <span className="inline-flex items-center gap-1.5">
          <svg width="24" height="12" aria-hidden="true">
            <line x1="2" y1="6" x2="22" y2="6" stroke="#EA580C" strokeWidth={3.2} strokeDasharray="4 3" strokeLinecap="round" />
          </svg>
          Escaleras
        </span>

        <span className="pill-3d inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
          🚪 Salidas
        </span>

        <span className="inline-flex items-center gap-1.5">
          <svg width="26" height="12" aria-hidden="true">
            <line x1="2" y1="6" x2="24" y2="6" stroke="#EF4444" strokeWidth={8} strokeOpacity={0.28} strokeLinecap="round" />
            <line x1="2" y1="6" x2="24" y2="6" stroke="#DC2626" strokeWidth={3.5} strokeDasharray="6 4" strokeLinecap="round" />
          </svg>
          Ruta activa
        </span>

        <span className="inline-flex items-center gap-1">
          <svg width="18" height="18" viewBox="-10 -11 20 20" aria-hidden="true">
            <polygon points="0,-9 8,6 -8,6" fill="#DC2626" stroke="#FFFFFF" strokeWidth={1.5} />
            <text textAnchor="middle" dy="4" fontSize="9" fontWeight="800" fill="#FFFFFF">
              !
            </text>
          </svg>
          Cerrado / Incidencia
        </span>

        {(routePolylines.length > 0 || routeVerticals.length > 0) && (
          <button
            type="button"
            className="btn-3d ml-auto rounded-full bg-white px-3 py-0.5 font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            onClick={() => setAnimating((a) => !a)}
          >
            {animating ? 'Pausar animación' : 'Reanudar animación'}
          </button>
        )}
      </figcaption>
    </figure>
  )
}
