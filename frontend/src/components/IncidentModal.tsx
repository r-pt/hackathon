import { useEffect, useMemo, useRef, useState } from 'react'
import { useCreateIncident, useIncidents, useUpdateIncident } from '@/api/hooks'
import type {
  CampusEdge,
  CampusNode,
  ConflictType,
  IncidentSeverity,
} from '@/api/types'

export interface IncidentModalProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  nodes: CampusNode[]
  edges: CampusEdge[]
  isAuthenticated: boolean
  onRequireAuth: () => void
}

const CONFLICT_LABELS: Record<ConflictType, string> = {
  elevator_broken: 'Ascensor fuera de servicio',
  stairs_blocked: 'Escaleras bloqueadas',
  ramp_obstructed: 'Rampa obstruida',
  corridor_closed: 'Pasillo cerrado',
  crowd_congestion: 'Congestión / aglomeración',
}

const fieldClass =
  'min-h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-900 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]'

export function IncidentModal({
  open,
  onOpenChange,
  nodes,
  edges,
  isAuthenticated,
  onRequireAuth,
}: IncidentModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const pressedOutsideRef = useRef(false)

  const {
    data: incidentsData,
    isLoading: loadingIncidents,
    error: listError,
  } = useIncidents('active', open)
  const createIncident = useCreateIncident()
  const updateIncident = useUpdateIncident()

  const [targetType, setTargetType] = useState<'node' | 'edge'>('node')
  const [targetId, setTargetId] = useState<string>('')
  const [conflictType, setConflictType] = useState<ConflictType>('elevator_broken')
  const [severity, setSeverity] = useState<IncidentSeverity>('blocking')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const effectiveTargetId = useMemo(() => {
    if (targetType === 'node') {
      if (targetId && nodes.some((n) => n.id === targetId)) return targetId
      return nodes[0]?.id ?? ''
    }
    if (targetId && edges.some((e) => e.id === targetId)) return targetId
    return edges[0]?.id ?? ''
  }, [targetType, targetId, nodes, edges])

  const nodeNameById = useMemo(
    () => new Map(nodes.map((n) => [n.id, `${n.name} (Piso ${n.floor})`])),
    [nodes],
  )
  const edgeLabel = (e: CampusEdge) => {
    const from = nodeNameById.get(e.from_node_id) ?? e.from_node_id
    const to = nodeNameById.get(e.to_node_id) ?? e.to_node_id
    return `${from} / ${to} (${e.edge_type})`
  }
  const edgeNameById = useMemo(
    () => new Map(edges.map((e) => [e.id, edgeLabel(e)])),
    [edges, nodeNameById],
  )

  const isOutside = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement) => {
    const r = dialog.getBoundingClientRect()
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  }

  const handleResolve = (incidentId: string) => {
    setStatusMessage(null)
    setFormError(null)
    if (!isAuthenticated) {
      onRequireAuth()
      return
    }
    updateIncident.mutate(
      { id: incidentId, status: 'resolved' },
      {
        onSuccess: () => {
          setStatusMessage('Incidencia marcada como resuelta.')
        },
        onError: (err) => {
          setFormError(err.message || 'No se pudo resolver la incidencia.')
        },
      },
    )
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    setStatusMessage(null)

    if (!isAuthenticated) {
      onRequireAuth()
      return
    }

    const form = e.currentTarget
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }

    const trimmed = description.trim()
    if (trimmed.length < 3 || trimmed.length > 280) {
      setFormError('La descripción debe tener entre 3 y 280 caracteres.')
      return
    }
    if (!effectiveTargetId) {
      setFormError('Selecciona un nodo o tramo afectado.')
      return
    }

    createIncident.mutate(
      {
        target_type: targetType,
        node_id: targetType === 'node' ? effectiveTargetId : null,
        edge_id: targetType === 'edge' ? effectiveTargetId : null,
        conflict_type: conflictType,
        severity,
        description: trimmed,
      },
      {
        onSuccess: () => {
          setDescription('')
          setStatusMessage('Incidencia reportada correctamente.')
        },
        onError: (err) => {
          setFormError(err.message || 'No se pudo reportar la incidencia.')
        },
      },
    )
  }

  const activeIncidents = incidentsData?.items ?? []

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="incident-modal-title"
      className="m-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40 backdrop:backdrop-blur-xs"
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
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 pb-3">
        <h2 id="incident-modal-title" className="font-display text-lg font-bold text-zinc-900">
          Incidencias de accesibilidad en el campus
        </h2>
        <button
          type="button"
          autoFocus
          onClick={() => onOpenChange(false)}
          className="min-h-10 rounded-xl border border-zinc-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
        >
          Cerrar
        </button>
      </div>

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 rounded-2xl bg-[#FACC15]/30 p-3 text-sm font-semibold text-zinc-900"
        >
          {statusMessage}
        </div>
      )}

      {formError && (
        <div
          role="alert"
          className="mt-3 rounded-2xl border border-red-200 bg-red-50/90 p-3 text-sm font-medium text-red-950"
        >
          <span aria-hidden="true">⚠ </span>
          {formError}
        </div>
      )}

      <section aria-labelledby="active-incidents-heading" className="mt-4">
        <h3 id="active-incidents-heading" className="font-display text-sm font-bold text-zinc-900">
          Incidencias activas ({activeIncidents.length})
        </h3>
        {loadingIncidents ? (
          <p className="mt-2 text-sm text-zinc-600">Cargando incidencias…</p>
        ) : listError ? (
          <div
            role="alert"
            className="mt-2 rounded-2xl border border-red-200 bg-red-50/90 p-2.5 text-sm text-red-950"
          >
            {listError.message}
          </div>
        ) : activeIncidents.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No hay incidencias activas reportadas.</p>
        ) : (
          <ul className="mt-2.5 grid gap-2" role="list">
            {activeIncidents.map((inc) => {
              const targetLabel =
                inc.target_type === 'node'
                  ? (inc.node_id ? (nodeNameById.get(inc.node_id) ?? inc.node_id) : 'Nodo')
                  : (inc.edge_id ? (edgeNameById.get(inc.edge_id) ?? inc.edge_id) : 'Tramo')
              return (
                <li
                  key={inc.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3.5 text-sm"
                >
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          inc.severity === 'blocking'
                            ? 'rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-900'
                            : 'rounded-full bg-[#FACC15] px-2.5 py-0.5 text-xs font-bold text-zinc-900'
                        }
                      >
                        <span aria-hidden="true">
                          {inc.severity === 'blocking' ? '⛔ ' : '⚠ '}
                        </span>
                        {inc.severity === 'blocking' ? 'Bloqueante' : 'Advertencia'}
                      </span>
                      <strong className="text-zinc-900">{targetLabel}</strong>
                      <span className="text-xs text-zinc-600">
                        ({CONFLICT_LABELS[inc.conflict_type] ?? inc.conflict_type})
                      </span>
                    </div>
                    <p className="text-zinc-700">{inc.description}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Resolver: ${inc.description}`}
                    disabled={updateIncident.isPending}
                    onClick={() => handleResolve(inc.id)}
                    className="min-h-10 shrink-0 rounded-xl border border-zinc-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] disabled:opacity-50"
                  >
                    Resolver
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="report-incident-heading" className="mt-6 border-t border-zinc-200 pt-4">
        <h3 id="report-incident-heading" className="font-display text-sm font-bold text-zinc-900">
          Reportar nueva incidencia
        </h3>

        {!isAuthenticated ? (
          <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800">
            <p className="font-medium">
              Se requiere iniciar sesión para reportar o resolver incidencias en el campus.
            </p>
            <button
              type="button"
              onClick={onRequireAuth}
              className="mt-3 min-h-10 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
            >
              Iniciar sesión
            </button>
          </div>
        ) : (
          <form
            method="post"
            aria-labelledby="report-incident-heading"
            onSubmit={handleSubmit}
            className="mt-3 grid gap-3"
          >
            <fieldset className="grid gap-1">
              <legend className="text-xs font-semibold text-zinc-700">
                Tipo de elemento afectado
              </legend>
              <div className="flex flex-wrap gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    id="target-type-node"
                    type="radio"
                    name="target_type"
                    value="node"
                    checked={targetType === 'node'}
                    onChange={() => {
                      setTargetType('node')
                      setTargetId(nodes[0]?.id ?? '')
                    }}
                    className="size-4 accent-[#DC2626]"
                  />
                  <label htmlFor="target-type-node" className="text-sm font-medium text-zinc-800">
                    Punto / Nodo (ascensor, acceso, aula)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="target-type-edge"
                    type="radio"
                    name="target_type"
                    value="edge"
                    checked={targetType === 'edge'}
                    onChange={() => {
                      setTargetType('edge')
                      setTargetId(edges[0]?.id ?? '')
                    }}
                    className="size-4 accent-[#DC2626]"
                  />
                  <label htmlFor="target-type-edge" className="text-sm font-medium text-zinc-800">
                    Tramo / Pasillo / Rampa
                  </label>
                </div>
              </div>
            </fieldset>

            <div className="grid gap-1">
              <label htmlFor="incident-target-select" className="text-xs font-semibold text-zinc-700">
                {targetType === 'node' ? 'Nodo afectado' : 'Tramo afectado'} *
              </label>
              <select
                id="incident-target-select"
                name="target_id"
                required
                className={fieldClass}
                value={effectiveTargetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {targetType === 'node'
                  ? nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.building}, Piso {n.floor})
                      </option>
                    ))
                  : edges.map((e) => (
                      <option key={e.id} value={e.id}>
                        {edgeLabel(e)}
                      </option>
                    ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <label htmlFor="incident-conflict-type" className="text-xs font-semibold text-zinc-700">
                  Tipo de conflicto *
                </label>
                <select
                  id="incident-conflict-type"
                  name="conflict_type"
                  required
                  className={fieldClass}
                  value={conflictType}
                  onChange={(e) => setConflictType(e.target.value as ConflictType)}
                >
                  {(Object.keys(CONFLICT_LABELS) as ConflictType[]).map((ct) => (
                    <option key={ct} value={ct}>
                      {CONFLICT_LABELS[ct]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-1">
                <label htmlFor="incident-severity" className="text-xs font-semibold text-zinc-700">
                  Severidad *
                </label>
                <select
                  id="incident-severity"
                  name="severity"
                  required
                  className={fieldClass}
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                >
                  <option value="blocking">Bloqueante (impide el paso)</option>
                  <option value="warning">Advertencia (paso con dificultad)</option>
                </select>
              </div>
            </div>

            <div className="grid gap-1">
              <label htmlFor="incident-description" className="text-xs font-semibold text-zinc-700">
                Descripción *
              </label>
              <span id="incident-description-hint" className="text-xs text-zinc-500">
                Describe el problema (entre 3 y 280 caracteres).
              </span>
              <textarea
                id="incident-description"
                name="description"
                required
                minLength={3}
                maxLength={280}
                rows={3}
                aria-describedby="incident-description-hint"
                aria-invalid={formError ? 'true' : undefined}
                className={fieldClass}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  e.currentTarget.setCustomValidity('')
                  if (formError) setFormError(null)
                }}
                onInvalid={(e) => {
                  e.currentTarget.setCustomValidity(
                    'Ingresa una descripción de entre 3 y 280 caracteres.',
                  )
                }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="min-h-10 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createIncident.isPending}
                className="min-h-10 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] disabled:opacity-50"
              >
                {createIncident.isPending ? 'Enviando…' : 'Reportar incidencia'}
              </button>
            </div>
          </form>
        )}
      </section>
    </dialog>
  )
}
