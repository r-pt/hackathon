import { useEffect, useId, useMemo, useState } from 'react'
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
}

const ISO_FLOOR_STEP = 340
const BLDG_EXTRUDE = 34

const EDGE_STYLE: Record<
  EdgeType,
  { stroke: string; bed: string; width: number; dash?: string; label: string }
> = {
  corridor: { stroke: '#475569', bed: '#E2E8F0', width: 3, label: 'Pasillo' },
  ramp: { stroke: '#059669', bed: '#D1FAE5', width: 3.8, dash: '10 3 2 3', label: 'Rampa' },
  elevator: { stroke: '#7C3AED', bed: '#EDE9FE', width: 3.8, dash: '5 4', label: 'Ascensor' },
  stairs: { stroke: '#EA580C', bed: '#FFEDD5', width: 3.4, dash: '4 4', label: 'Escaleras' },
  outdoor: { stroke: '#64748B', bed: '#E2E8F0', width: 2.8, dash: '2 6', label: 'Exterior' },
}

const NODE_LABEL: Record<NodeType, string> = {
  entrance: 'Entrada',
  room: 'Aula / Sala',
  corridor: 'Pasillo',
  elevator: 'Ascensor',
  stairs: 'Escaleras',
  ramp: 'Rampa',
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

function NodeGlyph({
  type,
  r = 7.5,
  onRoute = false,
}: {
  type: NodeType
  r?: number
  onRoute?: boolean
}) {
  const stroke = onRoute ? '#DC2626' : '#0F172A'
  const sw = onRoute ? 2.4 : 1.8

  switch (type) {
    case 'entrance':
      return <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={3} fill="#FEF3C7" stroke={stroke} strokeWidth={sw} />
    case 'elevator':
      return (
        <g>
          <rect x={-r} y={-r - 2} width={2 * r} height={2 * r + 4} rx={4} fill="#EDE9FE" stroke={stroke} strokeWidth={sw} />
          <path d="M-3,-2 L0,-5.5 L3,-2 M-3,2 L0,5.5 L3,2" fill="none" stroke="#5B21B6" strokeWidth={1.6} />
        </g>
      )
    case 'stairs':
      return <polygon points={`0,${-r - 2} ${r + 2},${r + 1} ${-r - 2},${r + 1}`} fill="#FFEDD5" stroke={stroke} strokeWidth={sw} />
    case 'ramp':
      return <polygon points={`${-r - 2},${r} ${r + 2},${r} ${r + 2},${-r}`} fill="#D1FAE5" stroke={stroke} strokeWidth={sw} />
    case 'corridor':
      return <circle r={r - 2} fill="#F1F5F9" stroke={stroke} strokeWidth={sw} />
    default:
      return <circle r={r} fill="#FFFFFF" stroke={stroke} strokeWidth={sw} />
  }
}

function PersonAvatarAsset({ gpsActive, shadowFilterUrl }: { gpsActive?: boolean; shadowFilterUrl: string }) {
  return (
    <g aria-hidden="true">
      <circle
        r={18}
        fill="#0EA5E9"
        fillOpacity={gpsActive ? 0.18 : 0.14}
        stroke="#0EA5E9"
        strokeWidth={1.5}
        strokeOpacity={0.55}
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
}: {
  angleDeg: number
  rotation: number
  onReset: () => void
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
        {/* Outer dial ring */}
        <circle r={40} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={1.5} />
        <circle r={24} fill="none" stroke="#E2E8F0" strokeWidth={1} strokeDasharray="3 3" />

        {/* Rotating 8-point Polar Star */}
        <g transform={`rotate(${angleDeg})`}>
          {/* Minor diagonal points (NE, SE, SO, NO) */}
          <polygon points="0,0 14,-14 4,0" fill="#94A3B8" />
          <polygon points="0,0 14,-14 0,-4" fill="#CBD5E1" />
          <polygon points="0,0 14,14 0,4" fill="#94A3B8" />
          <polygon points="0,0 14,14 4,0" fill="#CBD5E1" />
          <polygon points="0,0 -14,14 -4,0" fill="#94A3B8" />
          <polygon points="0,0 -14,14 0,4" fill="#CBD5E1" />
          <polygon points="0,0 -14,-14 0,-4" fill="#94A3B8" />
          <polygon points="0,0 -14,-14 -4,0" fill="#CBD5E1" />

          {/* Main cardinal points (E, S, O) */}
          <polygon points="0,0 24,0 0,5" fill="#475569" />
          <polygon points="0,0 24,0 0,-5" fill="#94A3B8" />
          <polygon points="0,0 0,24 -5,0" fill="#334155" />
          <polygon points="0,0 0,24 5,0" fill="#64748B" />
          <polygon points="0,0 -24,0 0,-5" fill="#475569" />
          <polygon points="0,0 -24,0 0,5" fill="#94A3B8" />

          {/* Polar Star North Needle (#DC2626) */}
          <polygon points="0,0 0,-26 5.5,0" fill="#DC2626" />
          <polygon points="0,0 0,-26 -5.5,0" fill="#991B1B" />

          {/* Center jewel */}
          <circle r={3.2} fill="#FFFFFF" stroke="#0F172A" strokeWidth={1.3} />

          {/* Upright Cardinal Letters */}
          {cardinals.map((c) => (
            <g key={c.label} transform={`translate(${c.x}, ${c.y}) rotate(${-angleDeg})`}>
              <text
                textAnchor="middle"
                dy="3.8"
                fontFamily="'Space Grotesk', system-ui, sans-serif"
                fontSize={c.isNorth ? '11.5' : '10'}
                fontWeight="800"
                fill={c.isNorth ? '#DC2626' : '#0F172A'}
              >
                {c.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <span className="font-display text-[10px] font-bold leading-none text-slate-600">
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
}: CampusMap3DProps) {
  const rawFilterId = useId()
  const shadowFilterId = `cm3d-shadow-${rawFilterId.replace(/:/g, '')}`
  const shadowFilterUrl = `url(#${shadowFilterId})`

  const [animating, setAnimating] = useState(true)
  const [viewMode, setViewMode] = useState<'iso' | 'top'>('iso')
  const [rotation, setRotation] = useState<number>(0)
  const [showLabels, setShowLabels] = useState<boolean>(true)
  const [showRoofs, setShowRoofs] = useState<boolean>(true)
  const [internalFloor, setInternalFloor] = useState<'stacked' | number>(floorView)

  useEffect(() => {
    setInternalFloor(floorView)
  }, [floorView])

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
      if (!bName || bName.toLowerCase() === 'exterior' || bName.includes('-')) continue
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
      const minDist = viewMode === 'top' ? 78 : 64
      for (let iter = 0; iter < 16; iter++) {
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
        if (!nb || nb === 'exterior' || nb.includes('-')) continue
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
    const worldMaxX = allWorldX.length ? Math.max(...allWorldX) : map.viewbox?.width || 1600
    const worldMinY = allWorldY.length ? Math.min(...allWorldY) : 0
    const worldMaxY = allWorldY.length ? Math.max(...allWorldY) : map.viewbox?.height || 1050
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
    const rotMaxX = (rotWorldXs.length ? Math.max(...rotWorldXs) : map.viewbox?.width || 1600) + 44
    const rotMinY = (rotWorldYs.length ? Math.min(...rotWorldYs) : 0) - 44
    const rotMaxY = (rotWorldYs.length ? Math.max(...rotWorldYs) : map.viewbox?.height || 1050) + 44
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
          samples.push(rawProject(bx, by, fl, 26))
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
      samples.push(rawProject(p.x, p.y, n.floor, 28))
      samples.push(rawProject(p.x, p.y, n.floor, -12))
    }

    const padX = 88
    const padTop = 78
    const padBottom = 62
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
          segments.push([`${pa.x},${pa.y}`, `${pb.x},${pb.y}`])
        }
      }
    }

    return {
      routePolylines: segments.map((pts) => pts.join(' ')),
      routeVerticals: verticals,
    }
  }, [route, nodeMap, isNodeVisible, projectNode, stacked, viewMode, visibleEdges, routeEdgeSet])

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
          fillOpacity={0.92}
          stroke="#FFFFFF"
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

  const renderIsoBuilding = (b: CampusBuilding, fl: number) => {
    const corners: [number, number][] = [
      [b.x, b.y],
      [b.x + b.width, b.y],
      [b.x + b.width, b.y + b.height],
      [b.x, b.y + b.height],
    ]
    const basePts = corners.map(([x, y]) => project(x, y, fl, -BLDG_EXTRUDE))
    const topPts = corners.map(([x, y]) => project(x, y, fl, 0))
    const shadowPts = basePts.map((p) => `${p.x + 6},${p.y + 8}`)

    const walls = [0, 1, 2, 3].map((i) => {
      const j = (i + 1) % 4
      return {
        midX: (basePts[i].x + basePts[j].x) / 2,
        midY: (basePts[i].y + basePts[j].y) / 2,
        pts: `${basePts[i].x},${basePts[i].y} ${basePts[j].x},${basePts[j].y} ${topPts[j].x},${topPts[j].y} ${topPts[i].x},${topPts[i].y}`,
      }
    })
    walls.sort((a, c) => c.midY - a.midY)
    const [leftWall, rightWall] = walls.slice(0, 2).sort((a, c) => a.midX - c.midX)

    const topPoly = topPts.map((p) => `${p.x},${p.y}`).join(' ')
    const roofCenterX = topPts.reduce((acc, p) => acc + p.x, 0) / 4
    const roofTopY = Math.min(...topPts.map((p) => p.y))
    const isTopFloor = fl === Math.max(1, b.floors)
    const drawRoof = showRoofs && isTopFloor

    let roofOverlay: React.ReactNode = null
    if (drawRoof) {
      const eaves = 6
      const roofPeak = 20
      const eaveWorld: [number, number][] = [
        [b.x - eaves, b.y - eaves],
        [b.x + b.width + eaves, b.y - eaves],
        [b.x + b.width + eaves, b.y + b.height + eaves],
        [b.x - eaves, b.y + b.height + eaves],
      ]
      const eavePts = eaveWorld.map(([x, y]) => project(x, y, fl, 0))
      const eaveShadowPts = eavePts.map((p) => `${p.x + 4},${p.y + 6}`).join(' ')

      const wide = b.width >= b.height
      const ridgeA = wide
        ? project(b.x + b.width * 0.24, b.y + b.height / 2, fl, roofPeak)
        : project(b.x + b.width / 2, b.y + b.height * 0.24, fl, roofPeak)
      const ridgeB = wide
        ? project(b.x + b.width * 0.76, b.y + b.height / 2, fl, roofPeak)
        : project(b.x + b.width / 2, b.y + b.height * 0.76, fl, roofPeak)

      const polyStr = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')
      const slopes = wide
        ? [
            { pts: polyStr([eavePts[0], eavePts[1], ridgeB, ridgeA]), opacity: 0.28, shade: '#0F172A', shadeOp: 0.08 },
            { pts: polyStr([eavePts[1], eavePts[2], ridgeB]), opacity: 0.24, shade: '#0F172A', shadeOp: 0.05 },
            { pts: polyStr([eavePts[2], eavePts[3], ridgeA, ridgeB]), opacity: 0.17, shade: '#FFFFFF', shadeOp: 0.14 },
            { pts: polyStr([eavePts[3], eavePts[0], ridgeA]), opacity: 0.21, shade: '#FFFFFF', shadeOp: 0.06 },
          ]
        : [
            { pts: polyStr([eavePts[0], eavePts[1], ridgeA]), opacity: 0.28, shade: '#0F172A', shadeOp: 0.08 },
            { pts: polyStr([eavePts[1], eavePts[2], ridgeB, ridgeA]), opacity: 0.24, shade: '#0F172A', shadeOp: 0.05 },
            { pts: polyStr([eavePts[2], eavePts[3], ridgeB]), opacity: 0.17, shade: '#FFFFFF', shadeOp: 0.14 },
            { pts: polyStr([eavePts[3], eavePts[0], ridgeA, ridgeB]), opacity: 0.21, shade: '#FFFFFF', shadeOp: 0.06 },
          ]

      const skyInsetX = b.width * 0.26
      const skyInsetY = b.height * 0.26
      const skylightPts = (
        [
          [b.x + skyInsetX, b.y + skyInsetY],
          [b.x + b.width - skyInsetX, b.y + skyInsetY],
          [b.x + b.width - skyInsetX, b.y + b.height - skyInsetY],
          [b.x + skyInsetX, b.y + b.height - skyInsetY],
        ] as [number, number][]
      ).map(([x, y]) => project(x, y, fl, roofPeak * 0.68))

      roofOverlay = (
        <g pointerEvents="none" aria-hidden="true">
          {/* Soft eaves drop shadow onto upper facade */}
          <polygon points={eaveShadowPts} fill="#0F172A" fillOpacity={0.11} />
          {/* 4 shaded faceted hipped roof slopes (translucent so interiors remain visible) */}
          {slopes.map((s, si) => (
            <g key={`slope-${si}`}>
              <polygon points={s.pts} fill={b.color} fillOpacity={s.opacity} stroke={b.color} strokeOpacity={0.55} strokeWidth={1.1} />
              <polygon points={s.pts} fill={s.shade} fillOpacity={s.shadeOp} />
            </g>
          ))}
          {/* Translucent skylight cutaway center */}
          <polygon
            points={polyStr(skylightPts)}
            fill="#E0F2FE"
            fillOpacity={0.18}
            stroke="#FFFFFF"
            strokeOpacity={0.8}
            strokeWidth={1.2}
            strokeDasharray="4 3"
          />
          {/* Roof ridge highlight */}
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

    return (
      <g key={`iso-bldg-${b.id}-fl-${fl}`}>
        <polygon points={shadowPts.join(' ')} fill="#0F172A" fillOpacity={0.1} />
        <polygon points={leftWall.pts} fill={b.color} fillOpacity={0.62} stroke="#0F172A" strokeOpacity={0.28} strokeWidth={1.1} />
        <polygon points={leftWall.pts} fill="#0F172A" fillOpacity={0.14} />
        <polygon points={rightWall.pts} fill={b.color} fillOpacity={0.76} stroke="#0F172A" strokeOpacity={0.34} strokeWidth={1.1} />
        <polygon points={rightWall.pts} fill="#0F172A" fillOpacity={0.28} />
        <polygon points={topPoly} fill="#FFFFFF" fillOpacity={0.92} />
        <polygon points={topPoly} fill={b.color} fillOpacity={0.2} stroke={b.color} strokeWidth={2.2} />
        {roofOverlay}
        {renderBuildingPlaque(roofCenterX, roofTopY - (drawRoof ? 24 : 12), b.name, b.color, true)}
      </g>
    )
  }

  const renderTopBuilding = (b: CampusBuilding, fl: number) => {
    const pts = (
      [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x + b.width, b.y + b.height],
        [b.x, b.y + b.height],
      ] as [number, number][]
    ).map(([x, y]) => project(x, y, fl, 0))
    const rx = Math.min(...pts.map((p) => p.x))
    const ry = Math.min(...pts.map((p) => p.y))
    const rw = Math.max(...pts.map((p) => p.x)) - rx
    const rh = Math.max(...pts.map((p) => p.y)) - ry
    const drawRoof = showRoofs && fl === Math.max(1, b.floors)
    const wide = rw >= rh
    const rAx = wide ? rx + rw * 0.24 : rx + rw / 2
    const rAy = wide ? ry + rh / 2 : ry + rh * 0.24
    const rBx = wide ? rx + rw * 0.76 : rx + rw / 2
    const rBy = wide ? ry + rh / 2 : ry + rh * 0.76

    return (
      <g key={`top-bldg-${b.id}-fl-${fl}`}>
        <rect x={rx + 4} y={ry + 6} width={rw} height={rh} rx={14} fill="#0F172A" fillOpacity={0.09} />
        <rect x={rx} y={ry} width={rw} height={rh} rx={14} fill="#FFFFFF" stroke={b.color} strokeWidth={2.2} />
        <rect x={rx} y={ry} width={rw} height={rh} rx={14} fill={b.color} fillOpacity={0.14} />
        {drawRoof && (
          <g pointerEvents="none" aria-hidden="true" opacity={0.45}>
            <rect
              x={rx - 4}
              y={ry - 4}
              width={rw + 8}
              height={rh + 8}
              rx={16}
              fill="none"
              stroke={b.color}
              strokeWidth={1.3}
              strokeDasharray="6 4"
            />
            <line x1={rx + 4} y1={ry + 4} x2={rAx} y2={rAy} stroke={b.color} strokeWidth={1.2} />
            <line x1={rx + rw - 4} y1={ry + 4} x2={wide ? rBx : rAx} y2={wide ? rBy : rAy} stroke={b.color} strokeWidth={1.2} />
            <line x1={rx + rw - 4} y1={ry + rh - 4} x2={rBx} y2={rBy} stroke={b.color} strokeWidth={1.2} />
            <line x1={rx + 4} y1={ry + rh - 4} x2={wide ? rAx : rBx} y2={wide ? rAy : rBy} stroke={b.color} strokeWidth={1.2} />
            <line x1={rAx} y1={rAy} x2={rBx} y2={rBy} stroke={b.color} strokeWidth={2} strokeLinecap="round" />
            <rect
              x={rx + rw * 0.26}
              y={ry + rh * 0.26}
              width={rw * 0.48}
              height={rh * 0.48}
              rx={6}
              fill="#E0F2FE"
              fillOpacity={0.35}
              stroke="#FFFFFF"
              strokeWidth={1.2}
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
                fill="rgba(255,255,255,0.92)"
                stroke={item.isNorth ? '#DC2626' : '#94A3B8'}
                strokeWidth={item.isNorth ? 1.5 : 1.1}
              />
              <text
                y={3.5}
                textAnchor="middle"
                fontFamily="'Space Grotesk', system-ui, sans-serif"
                fontSize="10"
                fontWeight="700"
                fill={item.isNorth ? '#B91C1C' : '#334155'}
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

    if (viewMode === 'top') {
      const dx = idx * (deckW + deckGap) + offsetX - 18
      const dy = offsetY - 18
      const dw = deckW + 36
      const dh = deckH + 36
      return (
        <g key={`top-deck-${fl}`}>
          <rect x={dx + 3} y={dy + 6} width={dw} height={dh} rx={22} fill="#CBD5E1" fillOpacity={0.7} />
          <rect x={dx} y={dy} width={dw} height={dh} rx={22} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={1.8} />
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

    const flBuildings = buildings.filter((b) => fl <= Math.max(1, b.floors))
    const flNodes = map.nodes.filter((n) => n.floor === fl)
    let sxMin = worldMinX - 28
    let sxMax = worldMaxX + 28
    let syMin = worldMinY - 28
    let syMax = worldMaxY + 28

    if (stacked && idx > 0 && (flBuildings.length > 0 || flNodes.length > 0)) {
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
            fill={idx === 0 ? '#CBD5E1' : '#94A3B8'}
            fillOpacity={idx === 0 ? 0.95 : 0.45}
            stroke="#94A3B8"
            strokeWidth={0.8}
          />
        ))}
        <polygon
          points={slabTop.map((p) => `${p.x},${p.y}`).join(' ')}
          fill={idx === 0 ? '#F8FAFC' : '#E0F2FE'}
          fillOpacity={idx === 0 ? 0.96 : 0.34}
          stroke={idx === 0 ? '#94A3B8' : '#38BDF8'}
          strokeWidth={idx === 0 ? 1.6 : 1.8}
          strokeDasharray={idx === 0 ? undefined : '7 4'}
        />
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

  const renderEdge = (e: CampusEdge) => {
    const s = EDGE_STYLE[e.edge_type]
    const nodeA = nodeMap.get(e.from_node_id)!
    const nodeB = nodeMap.get(e.to_node_id)!
    const a = projectNode(nodeA)
    const b = projectNode(nodeB)
    const hasIncident = edgeIncidents.has(e.id)
    const dimmed = routeEdgeSet.size > 0 && !routeEdgeSet.has(e.id)
    const covLabel = e.is_covered ? 'techado' : 'descubierto'
    const baseWidth = 9

    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const isStairs = e.edge_type === 'stairs'
    const dz = Math.abs((nodeB.z ?? 0) - (nodeA.z ?? 0))
    const stepCount = isStairs ? Math.max(4, Math.min(12, Math.floor(len / 12))) : 0
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2

    return (
      <g key={e.id} opacity={dimmed ? 0.5 : 0.98}>
        {/* 1. 3D projected ground drop-shadow (+4, +6) */}
        <line
          x1={a.x + 4}
          y1={a.y + 6}
          x2={b.x + 4}
          y2={b.y + 6}
          stroke="rgba(15, 23, 42, 0.24)"
          strokeWidth={baseWidth + 5}
          strokeLinecap="round"
        />
        {/* 2. 3D raised walkway kerb / thickness bevel (+1.5, +2.5) */}
        <line
          x1={a.x + 1.5}
          y1={a.y + 2.5}
          x2={b.x + 1.5}
          y2={b.y + 2.5}
          stroke="#475569"
          strokeWidth={baseWidth + 3}
          strokeOpacity={0.55}
          strokeLinecap="round"
        />
        {/* Covered sky-blue canopy halo */}
        {e.is_covered && (
          <g>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#BAE6FD" strokeWidth={17} strokeOpacity={0.78} strokeLinecap="round" />
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="#38BDF8"
              strokeWidth={13}
              strokeOpacity={0.42}
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          </g>
        )}
        {/* Main walkway surface bed */}
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={hasIncident ? '#FECACA' : s.bed}
          strokeWidth={baseWidth}
          strokeOpacity={0.94}
          strokeLinecap="round"
        />
        {/* Center guide stroke */}
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={hasIncident ? '#DC2626' : s.stroke}
          strokeWidth={s.width}
          strokeDasharray={s.dash}
          strokeLinecap="round"
        >
          <title>{`${s.label} (${e.distance_m} m, ${covLabel}${dz > 0 ? `, desnivel ${dz} m` : ''})${
            hasIncident ? ' — fuera de servicio' : ''
          }`}</title>
        </line>

        {/* 3D perpendicular stair treads + elevation Δz marker on outdoor/elevation stairs */}
        {isStairs && (
          <g pointerEvents="none" aria-hidden="true">
            {Array.from({ length: stepCount }, (_, i) => {
              const t = (i + 1) / (stepCount + 1)
              const px = a.x + dx * t
              const py = a.y + dy * t
              return (
                <g key={`tread-${i}`}>
                  <line
                    x1={px - nx * 5.5 + 1}
                    y1={py - ny * 5.5 + 1.5}
                    x2={px + nx * 5.5 + 1}
                    y2={py + ny * 5.5 + 1.5}
                    stroke="#9A3412"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <line
                    x1={px - nx * 5.5}
                    y1={py - ny * 5.5}
                    x2={px + nx * 5.5}
                    y2={py + ny * 5.5}
                    stroke="#FFF7ED"
                    strokeWidth={1.6}
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
        const hasIncident = Boolean(inc)
        const onRoute = routeEdgeSet.has(e.id)
        const isStairs = e.edge_type === 'stairs'
        const lowFl = lower.floor
        const highFl = upper.floor
        const shaftTitle = `Conexión vertical (${s.label}): Piso ${lowFl} a Piso ${highFl}${
          hasIncident ? ' — fuera de servicio' : ''
        }`
        const badgeText = isStairs ? `🪜 ESCALERA P${lowFl}↔P${highFl}` : `🛗 ASCENSOR ${lowFl}↔${highFl}`
        const badgeW = isStairs ? 104 : 96
        const badgeFill = hasIncident ? '#DC2626' : isStairs ? '#EA580C' : '#7C3AED'

        if (viewMode === 'iso') {
          const mx = (pa.x + pb.x) / 2
          const my = (pa.y + pb.y) / 2

          if (isStairs) {
            // Two-flight 3D zigzag architectural staircase between Floor 1 and Floor 2
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
                {/* 3D shadow behind flights */}
                <polyline
                  points={`${pa.x + 5},${pa.y + 5} ${landingX + 5},${landingY + 5} ${pb.x + 5},${pb.y + 5}`}
                  fill="none"
                  stroke="rgba(15, 23, 42, 0.22)"
                  strokeWidth={18}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Stair carriage / stringer deck */}
                <polyline
                  points={`${pa.x},${pa.y} ${landingX},${landingY} ${pb.x},${pb.y}`}
                  fill="none"
                  stroke={hasIncident ? '#FECACA' : '#FFEDD5'}
                  strokeWidth={16}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Left & right diagonal stair stringers / handrails */}
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
                {/* Elevated handrail highlight */}
                <polyline
                  points={`${pa.x + 7},${pa.y - 6} ${landingX + 7},${landingY - 6} ${pb.x + 7},${pb.y - 6}`}
                  fill="none"
                  stroke={railStroke}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Stepped 3D horizontal treads along both flights */}
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
                {/* Mid-landing platform */}
                <rect
                  x={landingX - 10}
                  y={landingY - 5}
                  width={20}
                  height={10}
                  rx={3}
                  fill="#FFF7ED"
                  stroke={stairStroke}
                  strokeWidth={1.6}
                />
                {/* Badge */}
                <g transform={`translate(${landingX + 54}, ${landingY})`} pointerEvents="none" aria-hidden="true">
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

          // Vertical 3D elevator glass shaft with twin guide rails + badge
          const elevStroke = hasIncident || onRoute ? '#DC2626' : s.stroke
          return (
            <g key={`shaft-${e.id}`}>
              <title>{shaftTitle}</title>
              {/* Translucent vertical elevator column */}
              <line
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={hasIncident ? '#FECACA' : onRoute ? '#FCA5A5' : '#DDD6FE'}
                strokeWidth={14}
                strokeOpacity={0.55}
                strokeLinecap="round"
              />
              {/* Twin vertical rails */}
              <line x1={pa.x - 5} y1={pa.y} x2={pb.x - 5} y2={pb.y} stroke={elevStroke} strokeWidth={1.6} strokeOpacity={0.75} />
              <line x1={pa.x + 5} y1={pa.y} x2={pb.x + 5} y2={pb.y} stroke={elevStroke} strokeWidth={1.6} strokeOpacity={0.75} />
              {/* Center dashed lift cable */}
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
              {/* Badge */}
              <g transform={`translate(${mx - 54}, ${my})`} pointerEvents="none" aria-hidden="true">
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

        // Cenital curved bridge connector (stairs or elevator)
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
    const linkedFloors = verticalLinks.get(n.id) ?? []
    const vertBadge =
      linkedFloors.length > 0
        ? linkedFloors.map((fl) => `${fl > n.floor ? '↑' : '↓'} P${fl}`).join(' ')
        : ''

    const ariaLabel = `${n.name}, ${isSalida ? 'Salida del campus' : NODE_LABEL[n.node_type]}, piso ${n.floor}${
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
          <g transform={`translate(${p.x},${p.y - (isEndpoint ? 50 : 24)})`} aria-hidden="true" pointerEvents="none">
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

        {/* Distinctive 3D SALIDA / ACCESO portal badge for campus exits & entrances */}
        {isEntrance && !vertBadge && (
          <g transform={`translate(${p.x},${p.y - (isEndpoint ? 48 : 23)})`} aria-hidden="true" pointerEvents="none">
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
          onClick={() => onSelectNode(n.id)}
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
          <NodeGlyph type={n.node_type} onRoute={onRoute} />
          <g transform="translate(0, 19)" className={labelClass} aria-hidden="true">
            <rect
              x={-labelW / 2}
              y={-9}
              width={labelW}
              height={15}
              rx={7.5}
              fill="rgba(255,255,255,0.94)"
              stroke={
                isOrigin
                  ? '#0EA5E9'
                  : isDest
                    ? '#15803D'
                    : onRoute
                      ? '#DC2626'
                      : isSalida
                        ? '#059669'
                        : '#CBD5E1'
              }
              strokeWidth={isEndpoint || onRoute || isSalida ? 1.4 : 1}
            />
            <text
              y={2}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight={isEndpoint || onRoute || isSalida ? '700' : '600'}
              fill="#0F172A"
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
              stacked ? 'btn-3d-primary bg-slate-900 text-white' : 'btn-3d bg-white text-slate-700 hover:bg-slate-50'
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
                  active ? 'btn-3d-primary bg-slate-900 text-white' : 'btn-3d bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Piso {fl}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="pill-3d inline-flex rounded-full bg-slate-100 p-0.5" role="group" aria-label="Perspectiva de cámara">
            <button
              type="button"
              aria-pressed={viewMode === 'iso'}
              onClick={() => setViewMode('iso')}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
                viewMode === 'iso' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vista 3D
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'top'}
              onClick={() => setViewMode('top')}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
                viewMode === 'top' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-900'
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
              className="btn-3d rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[#DC2626]"
            >
              ↺ -90°
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotar mapa 90 grados a la derecha"
              className="btn-3d rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-[#DC2626]"
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
                : 'btn-3d bg-white text-slate-700 hover:bg-slate-50'
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
                ? 'bg-slate-200/90 text-slate-900 hover:bg-slate-300/80'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {showLabels ? 'Ocultar nombres' : 'Mostrar nombres'}
          </button>
        </div>
      </div>

      {/* Isometric 3D / Cenital Interactive SVG Stage */}
      <div className="panel-3d relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-slate-100 via-slate-100/90 to-slate-200/75 p-2">
        <CompassRose angleDeg={northAngleDeg} rotation={rotation} onReset={() => setRotation(0)} />
        <svg
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          className={`h-auto max-h-[680px] w-full select-none${showLabels ? '' : ' cm3d-hide-labels'}`}
          role="group"
          aria-label={`Mapa ${viewMode === 'iso' ? 'isométrico 3D' : 'cenital'} de ${map.campus_name}, ${
            stacked ? `todos los pisos (${floorsList.length} niveles)` : `piso ${activeFloorView}`
          }, rotación ${rotation} grados`}
        >
          <defs>
            <filter id={shadowFilterId} x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#0F172A" floodOpacity="0.24" />
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

                {flEdges.map(renderEdge)}

                {flEdges
                  .filter((e) => edgeIncidents.has(e.id))
                  .map((e) => {
                    const a = projectNode(nodeMap.get(e.from_node_id)!)
                    const b = projectNode(nodeMap.get(e.to_node_id)!)
                    const inc = edgeIncidents.get(e.id)!
                    return renderIncidentBadge(
                      (a.x + b.x) / 2,
                      (a.y + b.y) / 2,
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
                    opacity={0.26}
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
                    <path d={v.d} stroke="#EF4444" strokeWidth={12} opacity={0.22} />
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
            return (
              <g pointerEvents="none">
                {showOrigin &&
                  (() => {
                    const p = projectNode(originNode!)
                    return (
                      <g
                        transform={`translate(${p.x + (sameSpot ? -15 : 0)}, ${p.y})`}
                        role="img"
                        aria-label={`Tu ubicación actual: ${originNode!.name}${gpsActive ? ' (GPS activo)' : ''}`}
                      >
                        <PersonAvatarAsset gpsActive={gpsActive} shadowFilterUrl={shadowFilterUrl} />
                      </g>
                    )
                  })()}
                {showDest &&
                  (() => {
                    const p = projectNode(destNode!)
                    return (
                      <g
                        transform={`translate(${p.x + (sameSpot ? 15 : 0)}, ${p.y})`}
                        role="img"
                        aria-label={`Destino meta B: ${destNode!.name}`}
                      >
                        <DestinationFlagAsset shadowFilterUrl={shadowFilterUrl} />
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
        className="panel-3d flex flex-wrap items-center gap-x-3.5 gap-y-1.5 rounded-2xl px-3.5 py-2 text-xs text-slate-700"
      >
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
          <svg width="20" height="20" viewBox="-12 -12 24 24" aria-hidden="true">
            <circle r={10} fill="#0EA5E9" stroke="#FFFFFF" strokeWidth={1.5} />
            <path d="M-5,6 C-5,2.5 -2.8,1 0,1 C2.8,1 5,2.5 5,6" fill="#FFFFFF" />
            <circle cx={0} cy={-3} r={3.2} fill="#FEF3C7" />
          </svg>
          Tu ubicación
        </span>

        <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
          <svg width="20" height="20" viewBox="-6 -18 24 22" aria-hidden="true">
            <line x1={0} y1={2} x2={0} y2={-15} stroke="#0F172A" strokeWidth={2} strokeLinecap="round" />
            <path d="M1,-15 L14,-10.5 L1,-6 Z" fill="#FACC15" stroke="#0F172A" strokeWidth={1.2} />
          </svg>
          Meta B
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
            <line x1="2" y1="5" x2="24" y2="5" stroke="#059669" strokeWidth={3} strokeDasharray="8 3 2 3" strokeLinecap="round" />
          </svg>
          Rampa
        </span>

        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="18" viewBox="-9 -10 18 20" aria-hidden="true">
            <NodeGlyph type="elevator" r={6} />
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
          Incidencia
        </span>

        {(routePolylines.length > 0 || routeVerticals.length > 0) && (
          <button
            type="button"
            className="btn-3d ml-auto rounded-full bg-white px-3 py-0.5 font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
            onClick={() => setAnimating((a) => !a)}
          >
            {animating ? 'Pausar animación' : 'Reanudar animación'}
          </button>
        )}
      </figcaption>
    </figure>
  )
}
