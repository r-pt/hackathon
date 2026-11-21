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
      className="absolute top-3 right-3 z-10 flex flex-col items-center gap-0.5 rounded-2xl border border-slate-200/90 bg-white/90 p-1.5 shadow-md backdrop-blur-md transition-transform duration-150 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
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
          samples.push(rawProject(bx, by, fl, 12))
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

    return (
      <g key={`iso-bldg-${b.id}-fl-${fl}`}>
        <polygon points={shadowPts.join(' ')} fill="#0F172A" fillOpacity={0.1} />
        <polygon points={leftWall.pts} fill={b.color} fillOpacity={0.62} stroke="#0F172A" strokeOpacity={0.28} strokeWidth={1.1} />
        <polygon points={leftWall.pts} fill="#0F172A" fillOpacity={0.14} />
        <polygon points={rightWall.pts} fill={b.color} fillOpacity={0.76} stroke="#0F172A" strokeOpacity={0.34} strokeWidth={1.1} />
        <polygon points={rightWall.pts} fill="#0F172A" fillOpacity={0.28} />
        <polygon points={topPoly} fill="#FFFFFF" fillOpacity={0.92} />
        <polygon points={topPoly} fill={b.color} fillOpacity={0.2} stroke={b.color} strokeWidth={2.2} />
        {renderBuildingPlaque(roofCenterX, roofTopY - 12, b.name, b.color, true)}
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

    return (
      <g key={`top-bldg-${b.id}-fl-${fl}`}>
        <rect x={rx + 4} y={ry + 6} width={rw} height={rh} rx={14} fill="#0F172A" fillOpacity={0.09} />
        <rect x={rx} y={ry} width={rw} height={rh} rx={14} fill="#FFFFFF" stroke={b.color} strokeWidth={2.2} />
        <rect x={rx} y={ry} width={rw} height={rh} rx={14} fill={b.color} fillOpacity={0.14} />
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
    const a = projectNode(nodeMap.get(e.from_node_id)!)
    const b = projectNode(nodeMap.get(e.to_node_id)!)
    const hasIncident = edgeIncidents.has(e.id)
    const dimmed = routeEdgeSet.size > 0 && !routeEdgeSet.has(e.id)
    const covLabel = e.is_covered ? 'techado' : 'descubierto'

    return (
      <g key={e.id} opacity={dimmed ? 0.48 : 0.96}>
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
              strokeOpacity={0.4}
              strokeDasharray="6 5"
              strokeLinecap="round"
            />
          </g>
        )}
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={hasIncident ? '#FECACA' : s.bed}
          strokeWidth={9}
          strokeOpacity={0.85}
          strokeLinecap="round"
        />
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
          <title>{`${s.label} (${e.distance_m} m, ${covLabel})${hasIncident ? ' — fuera de servicio' : ''}`}</title>
        </line>
      </g>
    )
  }

  const renderNode = (n: CampusNode) => {
    const p = projectNode(n)
    const inc = nodeIncidents.get(n.id) ?? (!stacked ? crossFloorNodeIncidents.get(n.id) : undefined)
    const isOrigin = n.id === originId
    const isDest = n.id === destId
    const isEndpoint = isOrigin || isDest
    const onRoute = routeNodeSet.has(n.id) || isEndpoint
    const linkedFloors = verticalLinks.get(n.id) ?? []
    const vertBadge =
      linkedFloors.length > 0
        ? linkedFloors.map((fl) => `${fl > n.floor ? '↑' : '↓'} P${fl}`).join(' ')
        : ''

    const ariaLabel = `${n.name}, ${NODE_LABEL[n.node_type]}, piso ${n.floor}${
      linkedFloors.length > 0
        ? `, conecta con ${linkedFloors.map((fl) => `piso ${fl}`).join(', ')}`
        : ''
    }${inc ? `, fuera de servicio (${inc.description})` : ''}${
      isOrigin ? ', tu ubicación actual' : ''
    }${isDest ? ', destino meta B' : ''}`

    const labelW = Math.max(58, n.name.length * 5.7 + 16)
    const labelClass = isEndpoint || onRoute ? 'cm3d-node-label cm3d-label-pinned' : 'cm3d-node-label'

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
              stroke={isOrigin ? '#0EA5E9' : isDest ? '#15803D' : onRoute ? '#DC2626' : '#CBD5E1'}
              strokeWidth={isEndpoint || onRoute ? 1.4 : 1}
            />
            <text
              y={2}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight={isEndpoint || onRoute ? '700' : '600'}
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
      {/* Soft Floating Glass Toolbar */}
      <div
        role="toolbar"
        aria-label="Controles de visualización del mapa 3D"
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-xs backdrop-blur-md"
      >
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Selector de piso en el mapa">
          <button
            type="button"
            aria-pressed={stacked}
            onClick={() => handleFloorSelect('stacked')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
              stacked ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
                  active ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Piso {fl}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-full bg-slate-100 p-0.5" role="group" aria-label="Perspectiva de cámara">
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
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#DC2626]"
            >
              ↺ -90°
            </button>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              aria-label="Rotar mapa 90 grados a la derecha"
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-200 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-[#DC2626]"
            >
              ↻ +90°
            </button>
          </div>

          <button
            type="button"
            aria-pressed={showLabels}
            onClick={() => setShowLabels((s) => !s)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] ${
              showLabels
                ? 'bg-slate-200/90 text-slate-900 hover:bg-slate-300/80'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {showLabels ? 'Ocultar nombres' : 'Mostrar nombres'}
          </button>
        </div>
      </div>

      {/* Isometric 3D / Cenital Interactive SVG Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-100 to-slate-200/60 p-2">
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

                {idx > 0 &&
                  crossFloorEdges
                    .filter((e) => {
                      const a = nodeMap.get(e.from_node_id)!
                      const b = nodeMap.get(e.to_node_id)!
                      return Math.max(a.floor, b.floor) === fl
                    })
                    .map((e) => {
                      const a = nodeMap.get(e.from_node_id)!
                      const b = nodeMap.get(e.to_node_id)!
                      const pa = projectNode(a)
                      const pb = projectNode(b)
                      const s = EDGE_STYLE[e.edge_type]
                      const inc = edgeIncidents.get(e.id)
                      const hasIncident = Boolean(inc)
                      const onRoute = routeEdgeSet.has(e.id)
                      const shaftTitle = `Conexión vertical (${s.label}): Piso ${a.floor} a Piso ${b.floor}${
                        hasIncident ? ' — fuera de servicio' : ''
                      }`

                      if (viewMode === 'iso') {
                        const mx = (pa.x + pb.x) / 2
                        const my = (pa.y + pb.y) / 2
                        return (
                          <g key={`shaft-${e.id}`}>
                            <line
                              x1={pa.x}
                              y1={pa.y}
                              x2={pb.x}
                              y2={pb.y}
                              stroke={hasIncident ? '#FECACA' : onRoute ? '#FCA5A5' : '#DDD6FE'}
                              strokeWidth={hasIncident || onRoute ? 10 : 8}
                              strokeOpacity={0.65}
                              strokeLinecap="round"
                            />
                            <line
                              x1={pa.x}
                              y1={pa.y}
                              x2={pb.x}
                              y2={pb.y}
                              stroke={hasIncident || onRoute ? '#DC2626' : s.stroke}
                              strokeWidth={hasIncident || onRoute ? 4 : 3.2}
                              strokeDasharray="6 4"
                              strokeLinecap="round"
                            >
                              <title>{shaftTitle}</title>
                            </line>
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
                      const midY = Math.min(pa.y, pb.y) - 62
                      const bezMidX = 0.25 * pa.x + 0.5 * midX + 0.25 * pb.x
                      const bezMidY = 0.25 * pa.y + 0.5 * midY + 0.25 * pb.y
                      return (
                        <g key={`bridge-${e.id}`}>
                          <path
                            d={`M ${pa.x} ${pa.y} Q ${midX} ${midY} ${pb.x} ${pb.y}`}
                            fill="none"
                            stroke={hasIncident || onRoute ? '#DC2626' : s.stroke}
                            strokeWidth={hasIncident || onRoute ? 3.5 : 2.5}
                            strokeDasharray="6 5"
                            strokeOpacity={hasIncident || onRoute ? 0.92 : 0.55}
                          >
                            <title>{shaftTitle}</title>
                          </path>
                          {inc &&
                            renderIncidentBadge(
                              bezMidX,
                              bezMidY,
                              `inc-cross-${e.id}`,
                              `Tramo vertical fuera de servicio: ${inc.description}`
                            )}
                        </g>
                      )
                    })}

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

      {/* Compact Vibrant Legend */}
      <figcaption
        aria-label="Leyenda del mapa"
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-slate-200/90 bg-white/95 px-3.5 py-2 text-xs text-slate-700"
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
            className="ml-auto rounded-full border border-slate-300 bg-slate-50 px-3 py-0.5 font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
            onClick={() => setAnimating((a) => !a)}
          >
            {animating ? 'Pausar animación' : 'Reanudar animación'}
          </button>
        )}
      </figcaption>
    </figure>
  )
}
