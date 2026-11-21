import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiError } from '@/api/client'
import type { CalculateRouteResponse, EdgeType } from '@/api/types'

const softPillClass =
  'pill-3d inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'

const EDGE_STEP_META: Record<EdgeType, { icon: string; label: string; pillClass: string }> = {
  elevator: {
    icon: '🛗',
    label: 'Ascensor',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-200',
  },
  stairs: {
    icon: '🪜',
    label: 'Escaleras',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200',
  },
  ramp: {
    icon: '♿',
    label: 'Rampa',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200',
  },
  corridor: {
    icon: '🏛',
    label: 'Pasillo',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-900 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-200',
  },
  outdoor: {
    icon: '☀',
    label: 'Exterior',
    pillClass:
      'pill-3d inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
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

const WEATHER_LABELS: Record<string, string> = {
  clear: 'Despejado',
  cloudy: 'Nublado',
  rain: 'Lluvia',
  storm: 'Tormenta',
  unknown: 'Sin datos',
}

export interface FullRouteStepsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  route: CalculateRouteResponse
  originName?: string | null
  destName?: string | null
  speechAvailable: boolean
  isSpeakingAll: boolean
  speakingStepOrder: number | null
  onSpeakRoute: () => void
  onSpeakStep: (stepOrder: number, instruction: string) => void
  onOpenShareModal?: () => void
}

export function FullRouteStepsModal({
  open,
  onOpenChange,
  route,
  originName,
  destName,
  speechAvailable,
  isSpeakingAll,
  speakingStepOrder,
  onSpeakRoute,
  onSpeakStep,
  onOpenShareModal,
}: FullRouteStepsModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const pressedOutsideRef = useRef(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const isOutside = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement) => {
    const r = dialog.getBoundingClientRect()
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  }

  const { metrics: m } = route
  const totalSteps = route.steps.length
  const weatherText = route.weather_applied.rain_avoidance_active
    ? 'Lluvia / priorizando techados'
    : (WEATHER_LABELS[route.weather_applied.condition] ?? route.weather_applied.condition)

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="full-steps-modal-title"
      className="panel-3d m-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      onClose={() => {
        if (open) onOpenChange(false)
      }}
      onPointerDown={(e) => {
        if (dialogRef.current) {
          pressedOutsideRef.current = isOutside(e, dialogRef.current)
        }
      }}
      onPointerUp={(e) => {
        if (
          pressedOutsideRef.current &&
          dialogRef.current &&
          isOutside(e, dialogRef.current)
        ) {
          onOpenChange(false)
        }
        pressedOutsideRef.current = false
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
        <div className="grid gap-1">
          <h2
            id="full-steps-modal-title"
            className="font-display text-lg font-bold text-slate-900 dark:text-white"
          >
            📋 Todos los pasos del recorrido ({totalSteps})
          </h2>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
            <span className="font-semibold text-sky-800 dark:text-sky-300">
              {originName || route.origin_node_id}
            </span>{' '}
            <span aria-hidden="true">→</span>{' '}
            <span className="font-semibold text-amber-800 dark:text-amber-300">
              {destName || route.destination_node_id}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenShareModal && (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onOpenShareModal()
              }}
              className="btn-3d min-h-10 rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900 transition-colors hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-sky-700 dark:bg-sky-950/80 dark:text-sky-200 dark:hover:bg-sky-900/80"
            >
              🔗 Compartir / QR
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => onOpenChange(false)}
            className="btn-3d min-h-10 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            Cerrar
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <dl className="card-3d grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-3 text-center dark:border-slate-700 dark:bg-slate-800/80">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Distancia total</dt>
            <dd className="font-display text-base font-bold text-slate-900 dark:text-white">
              {m.total_distance_m} m
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Tiempo estimado</dt>
            <dd className="font-display text-base font-bold text-slate-900 dark:text-white">
              {m.estimated_time_min} min
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Pisos</dt>
            <dd className="font-display text-base font-bold text-slate-900 dark:text-white">
              {m.floors_traversed.join(' / ')}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <ul className="flex flex-wrap gap-1.5" role="list" aria-label="Resumen de accesibilidad y clima">
            {route.accessibility_verified && (
              <li className="pill-3d inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200">
                <span aria-hidden="true">✓</span> Accesible sin escalones
              </li>
            )}
            <li className="pill-3d inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-950 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-200">
              <span aria-hidden="true">{route.weather_applied.rain_avoidance_active ? '☂' : '☀'}</span>{' '}
              Clima: {weatherText}
            </li>
          </ul>

          {speechAvailable && (
            <button
              type="button"
              onClick={onSpeakRoute}
              aria-pressed={isSpeakingAll}
              className={
                isSpeakingAll || speakingStepOrder !== null
                  ? 'btn-3d-primary min-h-9 rounded-full bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white transition-all duration-150 hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
                  : 'btn-3d-primary min-h-9 rounded-full bg-[#0EA5E9] px-3.5 py-1.5 text-xs font-bold text-white transition-all duration-150 hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'
              }
            >
              {isSpeakingAll || speakingStepOrder !== null
                ? '⏹ Detener audio'
                : '🔊 Escuchar todo el recorrido'}
            </button>
          )}
        </div>

        {route.avoided_conflicts.length > 0 && (
          <div
            role="note"
            className="rounded-2xl border border-red-200 bg-red-50/90 p-3 text-red-950 shadow-sm dark:border-red-800 dark:bg-red-950/70 dark:text-red-100"
          >
            <p className="font-display text-xs font-bold">
              <span aria-hidden="true">⚠ </span>Conflictos evitados ({route.avoided_conflicts.length})
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
              {route.avoided_conflicts.map((c) => (
                <li key={c.incident_id}>
                  <strong>{c.target_name}</strong>: {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <ol
          className="grid gap-2.5"
          role="list"
          aria-label="Itinerario completo paso a paso"
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
              ? 'grid size-7 shrink-0 place-items-center rounded-full bg-[#0EA5E9] font-display text-xs font-bold text-white'
              : isEnd
                ? 'grid size-7 shrink-0 place-items-center rounded-full bg-amber-400 font-display text-xs font-bold text-slate-900'
                : 'grid size-7 shrink-0 place-items-center rounded-full bg-[#EF4444] font-display text-xs font-bold text-white'
            return (
              <li
                key={s.order}
                className={
                  isCurrentlySpoken
                    ? 'card-3d flex items-start gap-3 rounded-2xl border border-sky-400 bg-sky-50/90 p-3.5 transition-colors dark:border-sky-600 dark:bg-sky-950/70'
                    : 'card-3d flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 transition-colors dark:border-slate-700 dark:bg-slate-800/80'
                }
              >
                <span aria-hidden="true" className={markerClass}>
                  {s.order}
                </span>
                <div className="grid flex-1 gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug text-slate-900 dark:text-slate-100">
                      {s.instruction}
                    </p>
                    {speechAvailable && (
                      <button
                        type="button"
                        onClick={() => onSpeakStep(s.order, s.instruction)}
                        aria-label={
                          isCurrentlySpoken
                            ? `Detener audio del paso ${s.order}`
                            : `Escuchar paso ${s.order}`
                        }
                        aria-pressed={isCurrentlySpoken}
                        className={
                          isCurrentlySpoken
                            ? 'btn-3d-primary shrink-0 rounded-lg bg-[#0EA5E9] px-2.5 py-1 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'
                            : 'btn-3d shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                        }
                      >
                        <span aria-hidden="true">{isCurrentlySpoken ? '⏹' : '🔊'}</span>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {isStart && (
                      <span className="pill-3d rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-200">
                        Salida
                      </span>
                    )}
                    {isEnd && (
                      <span className="pill-3d rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200">
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
              </li>
            )
          })}
        </ol>
      </div>
    </dialog>
  )
}

export interface RouteDirectionsProps {
  route?: CalculateRouteResponse
  error?: ApiError | null
  isLoading: boolean
  reachedGoal?: boolean
  autoVoice?: boolean
  onToggleAutoVoice?: () => void
  originName?: string | null
  destName?: string | null
  fullStepsOpen?: boolean
  onFullStepsOpenChange?: (open: boolean) => void
  onOpenShareModal?: () => void
}

export function RouteDirections({
  route,
  error,
  isLoading,
  reachedGoal = false,
  autoVoice = true,
  onToggleAutoVoice,
  originName,
  destName,
  fullStepsOpen,
  onFullStepsOpenChange,
  onOpenShareModal,
}: RouteDirectionsProps) {
  const [isSpeakingAll, setIsSpeakingAll] = useState(false)
  const [speakingStepOrder, setSpeakingStepOrder] = useState<number | null>(null)
  const [localModalOpen, setLocalModalOpen] = useState(false)
  const speechAvailable = isSpeechSupported()

  const isModalOpen = fullStepsOpen !== undefined ? fullStepsOpen : localModalOpen
  const setModalOpen = (next: boolean) => {
    setLocalModalOpen(next)
    onFullStepsOpenChange?.(next)
  }

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
      <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-100">
        <p className="font-display text-sm font-bold">¡Llegaste a tu destino!</p>
        <p className="mt-1 text-xs text-emerald-900 dark:text-emerald-200">
          El recorrido finalizó en la meta seleccionada. Elige un nuevo destino para iniciar otra ruta.
        </p>
      </div>
    )
  } else if (isLoading) {
    body = <p className="text-slate-600 dark:text-slate-300">Calculando ruta accesible…</p>
  } else if (error) {
    const rawIds = error.details?.blocking_incident_ids
    const ids = Array.isArray(rawIds) ? rawIds.map(String) : []
    const noRoute = error.code === 'NO_ACCESSIBLE_ROUTE' || error.code === 'ROUTE_NOT_FOUND'
    body = (
      <div
        role="alert"
        className="rounded-2xl border border-red-200 bg-red-50/90 p-3.5 text-red-950 shadow-sm dark:border-red-800 dark:bg-red-950/70 dark:text-red-100"
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
      <p className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
        Selecciona tu ubicación actual y un destino en el mapa o en el panel para ver las indicaciones.
      </p>
    )
  } else {
    const { metrics: m, graph_stats: g } = route
    const totalSteps = route.steps.length
    body = (
      <div className="grid gap-3">
        <dl className="card-3d grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/80 bg-slate-100/80 p-3 text-center dark:border-slate-700 dark:bg-slate-800/80">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Distancia</dt>
            <dd className="font-display text-base font-bold text-slate-900 dark:text-white">
              {m.total_distance_m} m
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Tiempo</dt>
            <dd className="font-display text-base font-bold text-slate-900 dark:text-white">
              {m.estimated_time_min} min
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Pisos</dt>
            <dd className="font-display text-base font-bold text-slate-900 dark:text-white">
              {m.floors_traversed.join(' / ')}
            </dd>
          </div>
        </dl>

        <ul className="flex flex-wrap gap-1.5" role="list" aria-label="Características de la ruta">
          {route.accessibility_verified && (
            <li className="pill-3d inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200">
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
            <li className="pill-3d inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-950 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-200">
              <span aria-hidden="true">☂</span> Tramos techados
            </li>
          )}
        </ul>

        {route.avoided_conflicts.length > 0 && (
          <div
            role="note"
            aria-labelledby="avoided-conflicts-heading"
            className="rounded-2xl border border-red-200 bg-red-50/90 p-3 text-red-950 shadow-sm dark:border-red-800 dark:bg-red-950/70 dark:text-red-100"
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

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn-3d-primary flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-all duration-150 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:bg-sky-600 dark:text-white dark:hover:bg-sky-500"
          >
            <span aria-hidden="true">📋</span>
            <span>Ver todos los pasos ({totalSteps})</span>
          </button>

          {onOpenShareModal && (
            <button
              type="button"
              onClick={onOpenShareModal}
              className="btn-3d flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900 transition-colors hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-sky-700 dark:bg-sky-950/80 dark:text-sky-200 dark:hover:bg-sky-900/80"
            >
              <span aria-hidden="true">🔗</span>
              <span>Compartir / QR</span>
            </button>
          )}
        </div>

        <ol
          className="ml-3 grid gap-3 border-l-2 border-slate-200 pl-4 dark:border-slate-700"
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
              ? '-ml-7 grid size-6 shrink-0 place-items-center rounded-full bg-[#0EA5E9] font-display text-xs font-bold text-white ring-4 ring-white dark:ring-slate-900'
              : isEnd
                ? '-ml-7 grid size-6 shrink-0 place-items-center rounded-full bg-amber-400 font-display text-xs font-bold text-slate-900 ring-4 ring-white dark:ring-slate-900'
                : '-ml-7 grid size-6 shrink-0 place-items-center rounded-full bg-[#EF4444] font-display text-xs font-bold text-white ring-4 ring-white dark:ring-slate-900'
            return (
              <li
                key={s.order}
                className={
                  isCurrentlySpoken
                    ? 'relative grid gap-1 rounded-xl border border-sky-300 bg-sky-50/90 p-2 shadow-xs transition-colors dark:border-sky-700 dark:bg-sky-950/60'
                    : 'relative grid gap-1 rounded-xl p-1 transition-colors'
                }
              >
                <div className="flex items-start gap-2.5">
                  <span aria-hidden="true" className={markerClass}>
                    {s.order}
                  </span>
                  <div className="grid flex-1 gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm leading-snug text-slate-800 dark:text-slate-100">{s.instruction}</p>
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
                              : 'btn-3d shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
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
                        <span className="pill-3d rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-200">
                          Salida
                        </span>
                      )}
                      {isEnd && (
                        <span className="pill-3d rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/80 dark:text-amber-200">
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

        <p className="text-xs text-slate-500 dark:text-slate-400">
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
          className="font-display text-sm font-bold text-slate-900 dark:text-white"
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
                    ? 'pill-3d rounded-full border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-900 transition-colors hover:bg-indigo-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-200 dark:hover:bg-indigo-900/80'
                    : 'pill-3d rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
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

      {route && (
        <FullRouteStepsModal
          open={isModalOpen}
          onOpenChange={setModalOpen}
          route={route}
          originName={originName}
          destName={destName}
          speechAvailable={speechAvailable}
          isSpeakingAll={isSpeakingAll}
          speakingStepOrder={speakingStepOrder}
          onSpeakRoute={handleSpeakRoute}
          onSpeakStep={handleSpeakStep}
          onOpenShareModal={onOpenShareModal}
        />
      )}
    </section>
  )
}
