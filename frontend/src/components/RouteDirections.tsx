import { useCallback, useEffect, useState } from 'react'
import type { ApiError } from '@/api/client'
import type { CalculateRouteResponse, EdgeType } from '@/api/types'

const softPillClass =
  'pill-3d inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700'

const EDGE_STEP_META: Record<EdgeType, { icon: string; label: string; pillClass: string }> = {
  elevator: {
    icon: '🛗',
    label: 'Ascensor',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-800',
  },
  stairs: {
    icon: '🪜',
    label: 'Escaleras',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900',
  },
  ramp: {
    icon: '♿',
    label: 'Rampa',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800',
  },
  corridor: {
    icon: '🏛',
    label: 'Pasillo',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-900',
  },
  outdoor: {
    icon: '☀',
    label: 'Exterior',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700',
  },
}

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  )
}

function selectSpanishVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices || voices.length === 0) return null
  const preferred = ['es-cl', 'es-419', 'es-es']
  for (const tag of preferred) {
    const match = voices.find((v) => v.lang.toLowerCase() === tag)
    if (match) return match
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith('es')) ?? null
}

function normalizeTextForSpanishVoice(text: string): string {
  return text
    .replace(/\b(\d+(?:\.\d+)?)\s*m\b/g, '$1 metros')
    .replace(/\b(\d+(?:\.\d+)?)\s*min\b/g, '$1 minutos')
    .replace(/—/g, ', ')
}

export function stopSpeech(): void {
  if (!isSpeechSupported()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    // Ignore speech synthesis errors in restricted environments
  }
}

export function speakSpanish(
  text: string,
  options?: { cancelPrevious?: boolean; onStart?: () => void; onEnd?: () => void },
): void {
  if (!isSpeechSupported() || !text.trim()) {
    options?.onEnd?.()
    return
  }
  try {
    if (options?.cancelPrevious !== false) {
      window.speechSynthesis.cancel()
    }
    const utterance = new SpeechSynthesisUtterance(normalizeTextForSpanishVoice(text))
    const voice = selectSpanishVoice()
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    } else {
      utterance.lang = 'es-CL'
    }
    utterance.rate = 1.0
    if (options?.onStart) utterance.onstart = options.onStart
    if (options?.onEnd) {
      utterance.onend = options.onEnd
      utterance.onerror = options.onEnd
    }
    window.speechSynthesis.speak(utterance)
  } catch {
    options?.onEnd?.()
  }
}

export interface RouteDirectionsProps {
  route?: CalculateRouteResponse
  error?: ApiError | null
  isLoading: boolean
  reachedGoal?: boolean
  autoVoice?: boolean
  onToggleAutoVoice?: () => void
}

export function RouteDirections({
  route,
  error,
  isLoading,
  reachedGoal = false,
  autoVoice = true,
  onToggleAutoVoice,
}: RouteDirectionsProps) {
  const [isSpeakingAll, setIsSpeakingAll] = useState(false)
  const [speakingStepOrder, setSpeakingStepOrder] = useState<number | null>(null)
  const speechAvailable = isSpeechSupported()

  const handleStopVoice = useCallback(() => {
    stopSpeech()
    setIsSpeakingAll(false)
    setSpeakingStepOrder(null)
  }, [])

  // Cancel speech on route change or component unmount
  useEffect(() => {
    handleStopVoice()
    return () => {
      stopSpeech()
    }
  }, [route?.origin_node_id, route?.destination_node_id, route?.steps.length, handleStopVoice])

  const handleSpeakRoute = () => {
    if (!route || !speechAvailable) return
    if (isSpeakingAll || speakingStepOrder !== null) {
      handleStopVoice()
      return
    }

    stopSpeech()
    setIsSpeakingAll(true)
    setSpeakingStepOrder(0)

    const summary = `Ruta calculada. Distancia total ${route.metrics.total_distance_m} metros, tiempo estimado ${route.metrics.estimated_time_min} minutos.`
    speakSpanish(summary, {
      cancelPrevious: false,
      onStart: () => setSpeakingStepOrder(0),
      onEnd: () => {
        if (route.steps.length === 0) {
          setIsSpeakingAll(false)
          setSpeakingStepOrder(null)
        }
      },
    })

    route.steps.forEach((step, idx) => {
      const isLast = idx === route.steps.length - 1
      speakSpanish(`Paso ${step.order}. ${step.instruction}`, {
        cancelPrevious: false,
        onStart: () => setSpeakingStepOrder(step.order),
        onEnd: () => {
          if (isLast) {
            setIsSpeakingAll(false)
            setSpeakingStepOrder(null)
          }
        },
      })
    })
  }

  const handleSpeakStep = (stepOrder: number, instruction: string) => {
    if (!speechAvailable) return
    if (speakingStepOrder === stepOrder && !isSpeakingAll) {
      handleStopVoice()
      return
    }
    setIsSpeakingAll(false)
    setSpeakingStepOrder(stepOrder)
    speakSpanish(`Paso ${stepOrder}. ${instruction}`, {
      cancelPrevious: true,
      onStart: () => setSpeakingStepOrder(stepOrder),
      onEnd: () => setSpeakingStepOrder((curr) => (curr === stepOrder ? null : curr)),
    })
  }

  let body
  if (reachedGoal && !route) {
    body = (
      <div className="card-3d rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
        <p className="font-display text-sm font-bold">¡Llegaste a tu destino!</p>
        <p className="mt-1 text-xs text-emerald-900">
          El recorrido finalizó en la meta seleccionada. Elige un nuevo destino para iniciar otra ruta.
        </p>
      </div>
    )
  } else if (isLoading) {
    body = <p className="text-slate-600">Calculando ruta accesible…</p>
  } else if (error) {
    const rawIds = error.details?.blocking_incident_ids
    const ids = Array.isArray(rawIds) ? rawIds.map(String) : []
    const noRoute = error.code === 'NO_ACCESSIBLE_ROUTE' || error.code === 'ROUTE_NOT_FOUND'
    body = (
      <div
        role="alert"
        className="card-3d rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-red-950"
      >
        <p className="font-display font-bold">
          <span aria-hidden="true">⚠ </span>
          {error.code === 'NO_ACCESSIBLE_ROUTE'
            ? 'Sin ruta accesible disponible'
            : error.code === 'ROUTE_NOT_FOUND'
              ? 'Ruta no encontrada'
              : `Error (${error.code})`}
        </p>
        <p className="mt-1 text-xs leading-relaxed">{error.message}</p>
        {noRoute && ids.length > 0 && (
          <p className="mt-2 text-xs">
            Incidencias bloqueantes: <strong className="font-bold">{ids.join(', ')}</strong>
          </p>
        )}
      </div>
    )
  } else if (!route) {
    body = (
      <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
        Selecciona tu ubicación actual y un destino en el mapa o en el panel para ver las indicaciones.
      </p>
    )
  } else {
    const { metrics: m, graph_stats: g } = route
    const totalSteps = route.steps.length
    body = (
      <div className="grid gap-3">
        <dl className="card-3d grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-3 text-center">
          <div>
            <dt className="text-xs text-slate-500">Distancia</dt>
            <dd className="font-display text-base font-bold text-slate-900">
              {m.total_distance_m} m
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Tiempo</dt>
            <dd className="font-display text-base font-bold text-slate-900">
              {m.estimated_time_min} min
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Pisos</dt>
            <dd className="font-display text-base font-bold text-slate-900">
              {m.floors_traversed.join(' / ')}
            </dd>
          </div>
        </dl>

        <ul className="flex flex-wrap gap-1.5" role="list" aria-label="Características de la ruta">
          {route.accessibility_verified && (
            <li className="pill-3d inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-950">
              <span aria-hidden="true">✓</span> Accesible sin escalones
            </li>
          )}
          {m.uses_elevator && (
            <li className={EDGE_STEP_META.elevator.pillClass}>
              <span aria-hidden="true">🛗</span> Ascensor
            </li>
          )}
          {m.uses_ramp && (
            <li className={EDGE_STEP_META.ramp.pillClass}>
              <span aria-hidden="true">♿</span> Rampa
            </li>
          )}
          {m.uses_stairs && (
            <li className={EDGE_STEP_META.stairs.pillClass}>
              <span aria-hidden="true">🪜</span> Escaleras
            </li>
          )}
          {route.weather_applied.rain_avoidance_active && (
            <li className="pill-3d inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-950">
              <span aria-hidden="true">☂</span> Tramos techados
            </li>
          )}
        </ul>

        {route.avoided_conflicts.length > 0 && (
          <div
            role="note"
            aria-labelledby="avoided-conflicts-heading"
            className="card-3d rounded-2xl border border-red-200 bg-red-50/90 p-3 text-red-950"
          >
            <h3 id="avoided-conflicts-heading" className="font-display text-xs font-bold">
              <span aria-hidden="true">⚠ </span>Conflictos evitados (
              {route.avoided_conflicts.length})
            </h3>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
              {route.avoided_conflicts.map((c) => (
                <li key={c.incident_id}>
                  <strong>{c.target_name}</strong> ({c.conflict_type.replace(/_/g, ' ')}):{' '}
                  {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ol
          className="ml-3 grid gap-3 border-l-2 border-slate-200 pl-4"
          role="list"
          aria-label="Pasos de la ruta"
        >
          {route.steps.map((s, idx) => {
            const meta = EDGE_STEP_META[s.edge_type] ?? {
              icon: '▪',
              label: s.edge_type,
              pillClass: softPillClass,
            }
            const isStart = idx === 0
            const isEnd = idx === totalSteps - 1
            const isCurrentlySpoken = speakingStepOrder === s.order
            const markerClass = isStart
              ? '-ml-7 grid size-6 shrink-0 place-items-center rounded-full bg-[#0EA5E9] font-display text-xs font-bold text-white ring-4 ring-white'
              : isEnd
                ? '-ml-7 grid size-6 shrink-0 place-items-center rounded-full bg-amber-400 font-display text-xs font-bold text-slate-900 ring-4 ring-white'
                : '-ml-7 grid size-6 shrink-0 place-items-center rounded-full bg-[#EF4444] font-display text-xs font-bold text-white ring-4 ring-white'
            return (
              <li
                key={s.order}
                className={
                  isCurrentlySpoken
                    ? 'relative grid gap-1 rounded-xl border border-sky-300 bg-sky-50/90 p-2 shadow-xs transition-colors'
                    : 'relative grid gap-1 rounded-xl p-1 transition-colors'
                }
              >
                <div className="flex items-start gap-2.5">
                  <span aria-hidden="true" className={markerClass}>
                    {s.order}
                  </span>
                  <div className="grid flex-1 gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-snug text-slate-800">{s.instruction}</p>
                      {speechAvailable && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleSpeakStep(s.order, s.instruction)
                          }}
                          aria-label={
                            isCurrentlySpoken
                              ? `Detener audio del paso ${s.order}`
                              : `Escuchar paso ${s.order}`
                          }
                          aria-pressed={isCurrentlySpoken}
                          className={
                            isCurrentlySpoken
                              ? 'btn-3d-primary shrink-0 rounded-lg bg-[#0EA5E9] px-2 py-1 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'
                              : 'btn-3d shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'
                          }
                        >
                          <span aria-hidden="true">{isCurrentlySpoken ? '⏹' : '🔊'}</span>
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isCurrentlySpoken && (
                        <span className="pill-3d rounded-full bg-[#0EA5E9] px-2 py-0.5 text-xs font-bold text-white">
                          Reproduciendo
                        </span>
                      )}
                      {isStart && (
                        <span className="pill-3d rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">
                          Salida
                        </span>
                      )}
                      {isEnd && (
                        <span className="pill-3d rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950">
                          Meta
                        </span>
                      )}
                      <span className={meta.pillClass}>
                        <span aria-hidden="true">{meta.icon}</span>
                        <span>{meta.label}</span>
                      </span>
                      <span className={softPillClass}>Piso {s.floor}</span>
                      <span className={softPillClass}>{s.distance_m} m</span>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        <p className="text-xs text-slate-500">
          Algoritmo {g.algorithm_used === 'astar' ? 'A*' : 'Dijkstra'} / Peso {g.total_weight} /{' '}
          {g.nodes_explored} nodos explorados
        </p>
      </div>
    )
  }

  return (
    <section aria-labelledby="route-directions-title" className="text-sm">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="route-directions-title"
          className="font-display text-sm font-bold text-slate-900"
        >
          Indicaciones paso a paso
        </h2>

        {speechAvailable && (
          <div className="flex flex-wrap items-center gap-1.5">
            {route && (
              <button
                type="button"
                onClick={handleSpeakRoute}
                aria-pressed={isSpeakingAll}
                className={
                  isSpeakingAll || speakingStepOrder !== null
                    ? 'btn-3d-primary rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white transition-all duration-150 hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
                    : 'btn-3d-primary rounded-full bg-[#0EA5E9] px-2.5 py-1 text-xs font-bold text-white transition-all duration-150 hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'
                }
              >
                {isSpeakingAll || speakingStepOrder !== null
                  ? '⏹ Detener voz'
                  : '🔊 Escuchar ruta'}
              </button>
            )}

            {onToggleAutoVoice && (
              <button
                type="button"
                onClick={onToggleAutoVoice}
                aria-pressed={autoVoice}
                className={
                  autoVoice
                    ? 'pill-3d rounded-full border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-900 transition-colors hover:bg-indigo-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
                    : 'pill-3d rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'
                }
              >
                {autoVoice ? '🔈 Auto-voz' : '🔇 Auto-voz'}
              </button>
            )}
          </div>
        )}
      </div>

      <div role="status" aria-live="polite" aria-busy={isLoading}>
        {body}
      </div>
    </section>
  )
}
