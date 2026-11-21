import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  getAuthToken,
  queryKeys,
  setAuthToken,
  subscribeAuthToken,
  useCalculateRoute,
  useCampusMap,
  useLocations,
  useMe,
  useUpdatePreferences,
  useWeather,
} from '@/api/hooks'
import type {
  CalculateRouteRequest,
  LocationItem,
  RouteStep,
  SearchAlgorithm,
  UpdatePreferencesRequest,
} from '@/api/types'
import { CampusMap3D } from '@/components/CampusMap3D'
import { FlagBadgeIcon, PersonBadgeIcon, RouteControls } from '@/components/RouteControls'
import { RouteDirections, speakSpanish, stopSpeech } from '@/components/RouteDirections'
import { IncidentModal } from '@/components/IncidentModal'
import { AuthModal } from '@/components/AuthModal'
import { EmergencyContacts } from '@/components/EmergencyContacts'

type FloorView = 'stacked' | number

const UTFSM_LAT = -33.0344
const UTFSM_LON = -71.595
const CAMPUS_MAX_RANGE_M = 800
const METERS_PER_DEG_LAT = 111_320
const METERS_PER_DEG_LON = METERS_PER_DEG_LAT * Math.cos((UTFSM_LAT * Math.PI) / 180)
const DARK_MODE_STORAGE_KEY = 'rutacampus_dark_mode'

const INITIAL_AVOID_STAIRS =
  import.meta.env.VITE_DEFAULT_AVOID_STAIRS === 'true' ||
  import.meta.env.VITE_ENABLE_FLOOR_STAIRS === 'false' ||
  import.meta.env.VITE_ENABLE_ELEVATION_STAIRS === 'false'

export function App() {
  const [originId, setOriginId] = useState<string | undefined>(undefined)
  const [destId, setDestId] = useState<string | undefined>(undefined)
  const [reducedMobility, setReducedMobility] = useState<boolean>(INITIAL_AVOID_STAIRS)
  const [preferCovered, setPreferCovered] = useState<boolean>(false)
  const [simulateRain, setSimulateRain] = useState<boolean>(false)
  const [algorithm, setAlgorithm] = useState<SearchAlgorithm>('astar')
  const [floorView, setFloorView] = useState<FloorView>('stacked')
  const [autoVoice, setAutoVoice] = useState<boolean>(true)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(DARK_MODE_STORAGE_KEY) === 'true'
  })

  const [gpsRealActive, setGpsRealActive] = useState<boolean>(false)
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [autoWalking, setAutoWalking] = useState<boolean>(false)
  const [reachedGoal, setReachedGoal] = useState<boolean>(false)
  const [incidentNotice, setIncidentNotice] = useState<string | null>(null)

  const [incidentModalOpen, setIncidentModalOpen] = useState<boolean>(false)
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false)
  const [token, setToken] = useState<string | null>(() => getAuthToken())
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', darkMode)
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DARK_MODE_STORAGE_KEY, String(darkMode))
      window.dispatchEvent(
        new CustomEvent('rutacampus-theme', { detail: { dark: darkMode } }),
      )
    }
  }, [darkMode])

  useEffect(() => {
    return subscribeAuthToken((nextToken) => {
      setToken(nextToken)
      if (!nextToken) {
        queryClient.removeQueries({ queryKey: queryKeys.me() })
      }
    })
  }, [queryClient])

  const isAuthenticated = Boolean(token)

  const mapQuery = useCampusMap()
  const locationsQuery = useLocations()
  const weatherQuery = useWeather()
  const meQuery = useMe(isAuthenticated)
  const updatePreferences = useUpdatePreferences()

  useEffect(() => {
    if (meQuery.data) {
      setReducedMobility(meQuery.data.reduced_mobility)
      setPreferCovered(meQuery.data.prefer_covered)
    }
  }, [meQuery.data])

  const floors: number[] = useMemo(() => {
    if (mapQuery.data?.floors && mapQuery.data.floors.length > 0) {
      return Array.from(new Set(mapQuery.data.floors)).sort((a, b) => a - b)
    }
    if (mapQuery.data?.nodes && mapQuery.data.nodes.length > 0) {
      return Array.from(new Set(mapQuery.data.nodes.map((n) => n.floor))).sort((a, b) => a - b)
    }
    return [1, 2]
  }, [mapQuery.data])

  useEffect(() => {
    if (!mapQuery.data) return
    const validIds = new Set(mapQuery.data.nodes.map((n) => n.id))
    if (originId && !validIds.has(originId)) {
      setOriginId(undefined)
    }
    if (destId && !validIds.has(destId)) {
      setDestId(undefined)
    }
    if (floorView !== 'stacked' && !floors.includes(floorView)) {
      setFloorView('stacked')
    }
  }, [mapQuery.data, floors, originId, destId, floorView])

  const locations: LocationItem[] = useMemo(() => {
    const byId = new Map<string, LocationItem>()
    const validNodeIds = mapQuery.data?.nodes
      ? new Set(mapQuery.data.nodes.map((n) => n.id))
      : null

    if (locationsQuery.data?.items) {
      for (const item of locationsQuery.data.items) {
        if (!validNodeIds || validNodeIds.has(item.id)) {
          byId.set(item.id, item)
        }
      }
    }

    if (mapQuery.data?.nodes) {
      for (const n of mapQuery.data.nodes) {
        if (n.is_destination) {
          byId.set(n.id, {
            id: n.id,
            name: n.name,
            building: n.building,
            floor: n.floor,
            node_type: n.node_type,
            landmark: n.landmark,
          })
        }
      }
    }

    return Array.from(byId.values())
  }, [locationsQuery.data, mapQuery.data])

  const pathAvailability = useMemo(() => {
    const edges = mapQuery.data?.edges ?? []
    const activeIncidents = mapQuery.data?.active_incidents ?? []
    const blockedNodeIds = new Set<string>()
    const blockedEdgeIds = new Set<string>()
    const warningEdgeIds = new Set<string>()

    for (const inc of activeIncidents) {
      if (inc.status !== 'active') continue
      if (inc.severity === 'blocking') {
        if (inc.target_type === 'node' && inc.node_id) blockedNodeIds.add(inc.node_id)
        if (inc.target_type === 'edge' && inc.edge_id) blockedEdgeIds.add(inc.edge_id)
      } else {
        if (inc.target_type === 'edge' && inc.edge_id) warningEdgeIds.add(inc.edge_id)
      }
    }

    let blockedByIncidentsCount = 0
    let availableCount = 0
    for (const edge of edges) {
      const isIncidentBlocked =
        blockedEdgeIds.has(edge.id) ||
        blockedNodeIds.has(edge.from_node_id) ||
        blockedNodeIds.has(edge.to_node_id)
      if (isIncidentBlocked) {
        blockedByIncidentsCount++
        continue
      }
      if (reducedMobility && (!edge.is_accessible || edge.edge_type === 'stairs')) {
        continue
      }
      availableCount++
    }

    return {
      totalEdges: edges.length,
      availableEdges: availableCount,
      blockedByIncidentsCount,
    }
  }, [mapQuery.data?.edges, mapQuery.data?.active_incidents, reducedMobility])

  const selectedOriginName = useMemo(() => {
    if (!originId) return null
    return (
      mapQuery.data?.nodes.find((n) => n.id === originId)?.name ??
      locations.find((l) => l.id === originId)?.name ??
      originId
    )
  }, [originId, mapQuery.data, locations])

  const selectedDestName = useMemo(() => {
    if (!destId) return null
    return (
      mapQuery.data?.nodes.find((n) => n.id === destId)?.name ??
      locations.find((l) => l.id === destId)?.name ??
      destId
    )
  }, [destId, mapQuery.data, locations])

  const routeRequest: CalculateRouteRequest | null = useMemo(() => {
    if (!originId || !destId || originId === destId) return null
    return {
      origin_node_id: originId,
      destination_node_id: destId,
      reduced_mobility: reducedMobility,
      prefer_covered: preferCovered,
      use_live_weather: true,
      simulate_rain: simulateRain,
      algorithm,
    }
  }, [originId, destId, reducedMobility, preferCovered, simulateRain, algorithm])

  const routeQuery = useCalculateRoute(routeRequest)

  const walkPathRef = useRef<string[]>([])
  const walkStepsRef = useRef<RouteStep[]>([])
  const lastGpsSpokenNodeRef = useRef<string | null>(null)

  useEffect(() => {
    if (routeQuery.error || !routeRequest) {
      walkPathRef.current = []
      walkStepsRef.current = []
      setAutoWalking(false)
      return
    }
    if (
      routeQuery.data &&
      routeQuery.data.origin_node_id === originId &&
      routeQuery.data.destination_node_id === destId &&
      routeQuery.data.path_node_ids.length > 0
    ) {
      walkPathRef.current = routeQuery.data.path_node_ids
      walkStepsRef.current = routeQuery.data.steps
    }
  }, [routeQuery.data, routeQuery.error, routeRequest, originId, destId])

  // Real GPS geolocation watchPosition mapped to UTFSM Casa Central campus nodes
  useEffect(() => {
    if (!gpsRealActive) return
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError(
        'Geolocalización no disponible en este navegador — usa la simulación en vivo o selecciona un punto',
      )
      setGpsRealActive(false)
      return
    }

    setGpsError(null)
    setGpsStatusMessage('Buscando señal GPS del campus…')

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        const dNorthM = (latitude - UTFSM_LAT) * METERS_PER_DEG_LAT
        const dEastM = (longitude - UTFSM_LON) * METERS_PER_DEG_LON
        const distMeters = Math.hypot(dNorthM, dEastM)

        if (distMeters > CAMPUS_MAX_RANGE_M) {
          setGpsError(
            'Fuera del rango del campus — usa la simulación en vivo o selecciona un punto',
          )
          setGpsStatusMessage(null)
          return
        }

        const nodes = mapQuery.data?.nodes ?? []
        if (nodes.length === 0) return

        // Map real meters relative to UTFSM center onto expanded 2200x1450 campus (x, y) coordinates (~1m ≈ 2.8 SVG units)
        const centerX = nodes.reduce((acc, n) => acc + n.x, 0) / nodes.length
        const centerY = nodes.reduce((acc, n) => acc + n.y, 0) / nodes.length
        const targetX = centerX + dEastM * 2.8
        const targetY = centerY - dNorthM * 2.8

        const floorMatches =
          typeof floorView === 'number' ? nodes.filter((n) => n.floor === floorView) : []
        const candidates = floorMatches.length > 0 ? floorMatches : nodes

        let nearest = candidates[0]
        let bestDist = Infinity
        for (const node of candidates) {
          const d = Math.hypot(node.x - targetX, node.y - targetY)
          const isCloser = d < bestDist - 0.001
          const isGroundTieBreak =
            Math.abs(d - bestDist) <= 0.001 && node.floor === 1 && nearest.floor !== 1
          if (isCloser || isGroundTieBreak) {
            bestDist = d
            nearest = node
          }
        }

        setGpsError(null)
        setOriginId(nearest.id)
        const nodeChanged = lastGpsSpokenNodeRef.current !== nearest.id
        lastGpsSpokenNodeRef.current = nearest.id

        if (destId && nearest.id === destId) {
          setReachedGoal(true)
          setGpsStatusMessage('¡Llegaste a tu destino!')
          if (autoVoice && nodeChanged) {
            speakSpanish('Has llegado a tu destino.')
          }
        } else {
          setReachedGoal(false)
          setGpsStatusMessage(`GPS sincronizado en ${nearest.name}`)
          if (autoVoice && nodeChanged) {
            const nextStep = walkStepsRef.current.find((s) => s.from_node_id === nearest.id)
            speakSpanish(
              nextStep
                ? `Ubicación actual: ${nearest.name}. ${nextStep.instruction}`
                : `Ubicación actual: ${nearest.name}.`,
            )
          }
        }
      },
      (geoErr) => {
        if (geoErr.code === 1) {
          setGpsError(
            'Permiso de ubicación denegado — usa la simulación en vivo o selecciona un punto',
          )
        } else {
          setGpsError(
            'No se pudo obtener la señal GPS — usa la simulación en vivo o selecciona un punto',
          )
        }
        setGpsStatusMessage(null)
        setGpsRealActive(false)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [gpsRealActive, mapQuery.data?.nodes, destId, floorView, autoVoice])

  const advanceOneStep = useCallback(() => {
    const path = walkPathRef.current
    if (!path || path.length < 2) {
      setAutoWalking(false)
      return
    }
    const nextNodeId = path[1]
    const currentStep = walkStepsRef.current[0]
    walkPathRef.current = path.slice(1)
    walkStepsRef.current = walkStepsRef.current.slice(1)
    setOriginId(nextNodeId)
    setGpsError(null)

    const nextNode = mapQuery.data?.nodes.find((n) => n.id === nextNodeId)
    if (nextNode && floorView !== 'stacked' && floorView !== nextNode.floor) {
      setFloorView(nextNode.floor)
    }

    if (nextNodeId === destId || walkPathRef.current.length <= 1) {
      setAutoWalking(false)
      setReachedGoal(true)
      setGpsStatusMessage('¡Llegaste a tu destino!')
      if (autoVoice) {
        speakSpanish('Has llegado a tu destino.')
      }
    } else {
      setReachedGoal(false)
      setGpsStatusMessage(`En camino: ${nextNode?.name ?? nextNodeId}`)
      if (autoVoice) {
        const upcomingStep = walkStepsRef.current[0]
        const announcement = upcomingStep?.instruction ?? currentStep?.instruction
        if (announcement) {
          speakSpanish(announcement)
        }
      }
    }
  }, [destId, floorView, mapQuery.data?.nodes, autoVoice])

  useEffect(() => {
    if (!autoWalking) return
    const timer = window.setInterval(() => {
      advanceOneStep()
    }, 1400)
    return () => window.clearInterval(timer)
  }, [autoWalking, advanceOneStep])

  const handleToggleRealGps = () => {
    if (gpsRealActive) {
      setGpsRealActive(false)
      setGpsStatusMessage(null)
      setGpsError(null)
      lastGpsSpokenNodeRef.current = null
    } else {
      setAutoWalking(false)
      setGpsError(null)
      setGpsRealActive(true)
    }
  }

  const handleToggleAutoWalk = () => {
    if (autoWalking) {
      setAutoWalking(false)
      setGpsStatusMessage('Recorrido en pausa')
      stopSpeech()
    } else if (routeQuery.data && routeQuery.data.path_node_ids.length >= 2) {
      walkPathRef.current = routeQuery.data.path_node_ids
      walkStepsRef.current = routeQuery.data.steps
      setGpsRealActive(false)
      setGpsError(null)
      setReachedGoal(false)
      setAutoWalking(true)
      setGpsStatusMessage('Recorriendo ruta en vivo…')
      if (autoVoice && routeQuery.data.steps[0]) {
        speakSpanish(`Iniciando recorrido. ${routeQuery.data.steps[0].instruction}`)
      }
    }
  }

  const handleSelectNode = (nodeId: string) => {
    setAutoWalking(false)
    setReachedGoal(false)
    if (!originId || (originId && destId)) {
      setOriginId(nodeId)
      if (nodeId === destId) {
        setDestId(undefined)
      }
    } else if (nodeId === originId) {
      setOriginId(undefined)
    } else {
      setDestId(nodeId)
    }
  }

  const handleControlsChange = (
    patch: Partial<{
      originId: string
      destId: string
      reducedMobility: boolean
      preferCovered: boolean
      simulateRain: boolean
      algorithm: SearchAlgorithm
      floorView: FloorView
    }>,
  ) => {
    if ('originId' in patch) {
      setOriginId(patch.originId || undefined)
      setAutoWalking(false)
      setReachedGoal(false)
    }
    if ('destId' in patch) {
      setDestId(patch.destId || undefined)
      setAutoWalking(false)
      setReachedGoal(false)
    }
    if (patch.reducedMobility !== undefined) setReducedMobility(patch.reducedMobility)
    if (patch.preferCovered !== undefined) setPreferCovered(patch.preferCovered)
    if (patch.simulateRain !== undefined) setSimulateRain(patch.simulateRain)
    if (patch.algorithm !== undefined) setAlgorithm(patch.algorithm)
    if (patch.floorView !== undefined) setFloorView(patch.floorView)

    if (
      isAuthenticated &&
      (patch.reducedMobility !== undefined || patch.preferCovered !== undefined)
    ) {
      const prefsPatch: UpdatePreferencesRequest = {}
      if (patch.reducedMobility !== undefined) {
        prefsPatch.reduced_mobility = patch.reducedMobility
      }
      if (patch.preferCovered !== undefined) {
        prefsPatch.prefer_covered = patch.preferCovered
      }
      updatePreferences.mutate(prefsPatch)
    }
  }

  const activeIncidentCount = mapQuery.data?.active_incidents?.length ?? 0
  const isRefreshingGraph = mapQuery.isFetching || locationsQuery.isFetching
  const hasActiveRoute = Boolean(routeQuery.data && routeQuery.data.path_node_ids.length >= 2)
  const isGpsLive = gpsRealActive || autoWalking

  return (
    <div
      className={`app-stage-bg flex min-h-screen flex-col ${
        darkMode ? 'bg-[#070B14] text-slate-100' : 'bg-[#F1F5F9] text-slate-900'
      }`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:border focus:border-sky-400 focus:bg-sky-100 focus:px-4 focus:py-2 focus:font-bold focus:text-sky-950 focus:outline-2 focus:outline-offset-2 focus:outline-[#0EA5E9]"
      >
        Saltar al contenido principal
      </a>

      <header
        className={`sticky top-0 z-30 border-b px-4 py-2.5 shadow-sm backdrop-blur-md ${
          darkMode
            ? 'border-slate-800 bg-slate-900/90 text-slate-100'
            : 'border-slate-200/90 bg-white/90 text-slate-900'
        }`}
      >
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                RutaCampus
              </h1>
              <span className="pill-3d rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-200">
                {mapQuery.data?.campus_name ?? 'UTFSM Casa Central'}
              </span>
            </div>

            <div
              className="pill-3d flex flex-wrap items-center gap-2 rounded-full border border-slate-200 bg-slate-50/90 px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-800/90"
              aria-label="Ubicación actual y destino"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#0EA5E9] px-2 py-0.5 font-bold text-white">
                  <PersonBadgeIcon />
                  <span>Tú</span>
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {selectedOriginName ?? 'Elige origen'}
                </span>
              </span>
              <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">
                →
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 font-bold text-slate-900">
                  <FlagBadgeIcon />
                  <span>Meta</span>
                </span>
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {selectedDestName ?? 'Elige destino'}
                </span>
              </span>
            </div>

            {pathAvailability.totalEdges > 0 && (
              <button
                type="button"
                onClick={() => setIncidentModalOpen(true)}
                className="pill-3d inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-200 dark:hover:bg-emerald-900/80"
                title="Ver disponibilidad de caminos pavimentados e incidencias"
              >
                <span>
                  🛣️ {pathAvailability.availableEdges}/{pathAvailability.totalEdges} caminos
                  disponibles
                </span>
                {pathAvailability.blockedByIncidentsCount > 0 && (
                  <span className="rounded-full bg-[#DC2626] px-1.5 py-0.2 text-[11px] font-bold text-white">
                    ⛔ {pathAvailability.blockedByIncidentsCount} bloqueados
                  </span>
                )}
              </button>
            )}

            {isGpsLive && (
              <span className="pill-3d inline-flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-900 dark:border-sky-700 dark:bg-sky-950/80 dark:text-sky-200">
                <span
                  aria-hidden="true"
                  className="gps-radar-dot relative inline-block size-2 rounded-full bg-[#0EA5E9]"
                />
                <span>{autoWalking ? 'Simulación en vivo' : 'GPS activo'}</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {weatherQuery.data && (
              <div
                className="pill-3d flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/90 px-3 py-1 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100"
                aria-label="Clima actual en el campus"
              >
                <span>{weatherQuery.data.temperature_c.toFixed(1)} °C</span>
                <span
                  className={
                    weatherQuery.data.rain_alert || simulateRain
                      ? 'rounded-full bg-sky-200 px-2 py-0.5 font-bold text-sky-950 dark:bg-sky-900 dark:text-sky-100'
                      : 'font-semibold text-emerald-700 dark:text-emerald-300'
                  }
                >
                  {weatherQuery.data.rain_alert || simulateRain ? 'Lluvia activa' : 'Despejado'}
                </span>
              </div>
            )}

            <a
              href="#emergency-contacts"
              className="btn-3d inline-flex min-h-9 items-center gap-1 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-900 transition-all duration-150 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] dark:border-red-800 dark:bg-red-950/80 dark:text-red-200 dark:hover:bg-red-900/80"
            >
              <span aria-hidden="true">🚨</span>
              <span>Emergencias</span>
            </a>

            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-pressed={darkMode}
              className="btn-3d min-h-9 rounded-full border border-slate-300 bg-white px-3.5 py-1 text-xs font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              {darkMode ? '☀️ Modo Claro' : '🌙 Modo Oscuro'}
            </button>

            <button
              type="button"
              onClick={() => {
                void mapQuery.refetch()
                void locationsQuery.refetch()
                void routeQuery.refetch()
              }}
              disabled={isRefreshingGraph}
              aria-busy={isRefreshingGraph}
              className="btn-3d min-h-9 rounded-full border border-slate-300 bg-white px-3.5 py-1 text-xs font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <span aria-hidden="true">↻ </span>
              {isRefreshingGraph ? 'Actualizando…' : 'Actualizar'}
            </button>

            <button
              type="button"
              onClick={() => setIncidentModalOpen(true)}
              className={
                activeIncidentCount > 0
                  ? 'btn-3d-primary min-h-9 rounded-full bg-[#DC2626] px-3.5 py-1 text-xs font-semibold text-white transition-all duration-150 hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]'
                  : 'btn-3d min-h-9 rounded-full border border-slate-300 bg-slate-100 px-3.5 py-1 text-xs font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
              }
            >
              Incidencias ({activeIncidentCount})
            </button>

            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => {
                  setAuthToken(null)
                  queryClient.removeQueries({ queryKey: queryKeys.me() })
                }}
                className="btn-3d min-h-9 rounded-full border border-slate-300 bg-white px-3.5 py-1 text-xs font-semibold text-slate-800 transition-all duration-150 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                {meQuery.data?.full_name ? `Salir (${meQuery.data.full_name})` : 'Cerrar sesión'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="btn-3d-primary min-h-9 rounded-full bg-indigo-600 px-3.5 py-1 text-xs font-semibold text-white transition-all duration-150 hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                Iniciar sesión
              </button>
            )}
          </div>
        </div>
      </header>

      {incidentNotice && (
        <div
          role="status"
          aria-live="polite"
          className="mx-auto mt-3 flex w-full max-w-[1440px] items-center justify-between gap-3 px-4"
        >
          <div className="card-3d flex w-full items-center justify-between gap-3 rounded-2xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-xs font-semibold text-sky-950 dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-100">
            <span>
              🛣️ {incidentNotice} ({pathAvailability.availableEdges}/
              {pathAvailability.totalEdges} caminos disponibles)
            </span>
            <button
              type="button"
              onClick={() => setIncidentNotice(null)}
              className="rounded-lg border border-sky-300 bg-white px-2.5 py-1 text-xs font-bold text-sky-900 hover:bg-sky-100 dark:border-sky-700 dark:bg-slate-800 dark:text-sky-200 dark:hover:bg-slate-700"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      <main
        id="main-content"
        className="mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_22.5rem]"
      >
        <section
          aria-label="Mapa interactivo del campus"
          className="panel-3d flex min-h-[560px] flex-col rounded-3xl border border-slate-200/90 bg-white p-3 dark:border-slate-700/90 dark:bg-slate-900 lg:min-h-[calc(100vh-6.5rem)]"
        >
          {mapQuery.isLoading && (
            <div
              role="status"
              aria-live="polite"
              className="grid flex-1 place-items-center p-6 text-sm font-medium text-slate-600 dark:text-slate-300"
            >
              Cargando mapa interactivo del campus…
            </div>
          )}

          {mapQuery.error && (
            <div
              role="alert"
              className="card-3d my-auto rounded-2xl border border-red-200 bg-red-50/90 p-4 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/70 dark:text-red-100"
            >
              <p className="font-display font-bold">Error al cargar el mapa del campus</p>
              <p>{mapQuery.error.message}</p>
            </div>
          )}

          {mapQuery.data && (
            <CampusMap3D
              map={mapQuery.data}
              route={routeQuery.data}
              originId={originId}
              destId={destId}
              floorView={floorView}
              gpsActive={isGpsLive}
              onFloorViewChange={setFloorView}
              onSelectNode={handleSelectNode}
            />
          )}
        </section>

        <aside
          aria-label="Panel de control e indicaciones de ruta"
          className="flex flex-col gap-3.5"
        >
          <div className="panel-3d rounded-2xl border border-slate-200/90 bg-white p-4 dark:border-slate-700/90 dark:bg-slate-900">
            <h2 className="font-display mb-2.5 text-sm font-bold text-slate-900 dark:text-white">
              Configurar ruta
            </h2>
            <RouteControls
              locations={locations}
              floors={floors}
              originId={originId}
              destId={destId}
              reducedMobility={reducedMobility}
              preferCovered={preferCovered}
              simulateRain={simulateRain}
              algorithm={algorithm}
              floorView={floorView}
              onChange={handleControlsChange}
              gpsRealActive={gpsRealActive}
              gpsStatusMessage={gpsStatusMessage}
              gpsError={gpsError}
              autoWalking={autoWalking}
              hasActiveRoute={hasActiveRoute}
              reachedGoal={reachedGoal}
              onToggleRealGps={handleToggleRealGps}
              onStepForward={advanceOneStep}
              onToggleAutoWalk={handleToggleAutoWalk}
            />
          </div>

          <div className="panel-3d rounded-2xl border border-slate-200/90 bg-white p-4 dark:border-slate-700/90 dark:bg-slate-900">
            <RouteDirections
              route={routeQuery.data}
              error={routeQuery.error}
              isLoading={routeQuery.isFetching}
              reachedGoal={reachedGoal}
              autoVoice={autoVoice}
              onToggleAutoVoice={() =>
                setAutoVoice((prev) => {
                  const next = !prev
                  if (!next) stopSpeech()
                  return next
                })
              }
            />
          </div>

          <EmergencyContacts />
        </aside>
      </main>

      <IncidentModal
        open={incidentModalOpen}
        onOpenChange={setIncidentModalOpen}
        nodes={mapQuery.data?.nodes ?? []}
        edges={mapQuery.data?.edges ?? []}
        isAuthenticated={isAuthenticated}
        activeIncidents={mapQuery.data?.active_incidents}
        onIncidentChanged={(summary) => {
          setIncidentNotice(summary)
          if (autoVoice) {
            speakSpanish(summary)
          }
        }}
        onRequireAuth={() => {
          setIncidentModalOpen(false)
          setAuthModalOpen(true)
        }}
      />

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        onAuthenticated={(newToken) => {
          setAuthToken(newToken)
          setAuthModalOpen(false)
        }}
      />
    </div>
  )
}

export default App
