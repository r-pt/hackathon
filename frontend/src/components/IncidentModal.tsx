import { useEffect, useMemo, useRef, useState } from 'react'
import {
  setAuthToken,
  useCreateIncident,
  useIncidents,
  useUpdateIncident,
} from '@/api/hooks'
import type {
  CampusEdge,
  CampusNode,
  ConflictType,
  EdgeType,
  Incident,
  IncidentSeverity,
} from '@/api/types'

export interface IncidentModalProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  nodes: CampusNode[]
  edges: CampusEdge[]
  isAuthenticated: boolean
  onRequireAuth: () => void
  activeIncidents?: Incident[]
  onIncidentChanged?: (summary: string) => void
}

const CONFLICT_LABELS: Record<ConflictType, string> = {
  elevator_broken: 'Ascensor fuera de servicio',
  stairs_blocked: 'Escaleras bloqueadas',
  ramp_obstructed: 'Rampa obstruida',
  corridor_closed: 'Pasillo o camino cerrado',
  crowd_congestion: 'Congestión / aglomeración',
}

const EDGE_TYPE_LABELS: Record<EdgeType, string> = {
  corridor: 'Pasillo',
  ramp: 'Rampa pavimentada',
  outdoor: 'Calzada exterior',
  elevator: 'Ascensor',
  stairs: 'Escaleras',
}

const DEMO_TOKEN = 'demo-student-token'

const fieldClass =
  'min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50/90 px-3 py-2 text-sm text-slate-900 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'

export function IncidentModal({
  open,
  onOpenChange,
  nodes,
  edges,
  isAuthenticated,
  onRequireAuth,
  activeIncidents: propActiveIncidents,
  onIncidentChanged,
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

  const [targetType, setTargetType] = useState<'node' | 'edge'>('edge')
  const [targetId, setTargetId] = useState<string>('')
  const [conflictType, setConflictType] = useState<ConflictType>('corridor_closed')
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
  const shortNodeNameById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n.name])),
    [nodes],
  )

  const edgeNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of edges) {
      const from = shortNodeNameById.get(e.from_node_id) ?? e.from_node_id
      const to = shortNodeNameById.get(e.to_node_id) ?? e.to_node_id
      const typeLabel = EDGE_TYPE_LABELS[e.edge_type] ?? e.edge_type
      map.set(e.id, `🛣️ [${e.id}] ${from} ↔ ${to} (${e.distance_m}m · ${typeLabel})`)
    }
    return map
  }, [edges, shortNodeNameById])

  const activeIncidents = useMemo(() => {
    const fromQuery = incidentsData?.items ?? []
    const fromProps = propActiveIncidents ?? []
    const byId = new Map<string, Incident>()
    for (const item of fromProps) {
      if (item.status === 'active') byId.set(item.id, item)
    }
    for (const item of fromQuery) {
      if (item.status === 'active') byId.set(item.id, item)
    }
    return Array.from(byId.values())
  }, [incidentsData?.items, propActiveIncidents])

  const pathStats = useMemo(() => {
    const blockedNodes = new Set<string>()
    const blockedEdges = new Set<string>()
    for (const inc of activeIncidents) {
      if (inc.severity === 'blocking') {
        if (inc.target_type === 'node' && inc.node_id) blockedNodes.add(inc.node_id)
        if (inc.target_type === 'edge' && inc.edge_id) blockedEdges.add(inc.edge_id)
      }
    }
    let closedCount = 0
    for (const e of edges) {
      if (
        blockedEdges.has(e.id) ||
        blockedNodes.has(e.from_node_id) ||
        blockedNodes.has(e.to_node_id)
      ) {
        closedCount++
      }
    }
    return {
      total: edges.length,
      available: Math.max(0, edges.length - closedCount),
      closed: closedCount,
    }
  }, [edges, activeIncidents])

  const isOutside = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement) => {
    const r = dialog.getBoundingClientRect()
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  }

  const ensureAuthForAction = () => {
    if (!isAuthenticated) {
      setAuthToken(DEMO_TOKEN)
    }
  }

  const handleResolve = (inc: Incident) => {
    setStatusMessage(null)
    setFormError(null)
    ensureAuthForAction()
    const targetLabel =
      inc.target_type === 'node'
        ? (inc.node_id ? (nodeNameById.get(inc.node_id) ?? inc.node_id) : 'Nodo')
        : (inc.edge_id ? (edgeNameById.get(inc.edge_id) ?? inc.edge_id) : 'Tramo')

    updateIncident.mutate(
      { id: inc.id, status: 'resolved' },
      {
        onSuccess: () => {
          const msg = `Incidencia resuelta en ${targetLabel}. Caminos habilitados y ruta recalculados.`
          setStatusMessage(msg)
          onIncidentChanged?.(msg)
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
      setFormError('Selecciona un nodo o camino pavimentado afectado.')
      return
    }

    ensureAuthForAction()
    const targetLabel =
      targetType === 'node'
        ? (nodeNameById.get(effectiveTargetId) ?? effectiveTargetId)
        : (edgeNameById.get(effectiveTargetId) ?? effectiveTargetId)

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
          const msg = `Incidencia reportada en ${targetLabel}. Caminos disponibles y ruta actualizados en tiempo real.`
          setStatusMessage(msg)
          onIncidentChanged?.(msg)
        },
        onError: (err) => {
          setFormError(err.message || 'No se pudo reportar la incidencia.')
        },
      },
    )
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="incident-modal-title"
      className="panel-3d m-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-xs"
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
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div>
          <h2 id="incident-modal-title" className="font-display text-lg font-bold text-slate-900">
            Incidencias y disponibilidad de caminos
          </h2>
          <p className="mt-0.5 text-xs font-medium text-slate-600">
            🛣️ Caminos habilitados: <strong>{pathStats.available}</strong> de{' '}
            <strong>{pathStats.total}</strong> · ⛔ <strong>{pathStats.closed}</strong> tramos
            cerrados por incidencias
          </p>
        </div>
        <button
          type="button"
          autoFocus
          onClick={() => onOpenChange(false)}
          className="btn-3d min-h-10 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]"
        >
          Cerrar
        </button>
      </div>

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="card-3d mt-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-semibold text-emerald-950"
        >
          ✓ {statusMessage}
        </div>
      )}

      {formError && (
        <div
          role="alert"
          className="card-3d mt-3 rounded-2xl border border-red-200 bg-red-50/90 p-3 text-sm font-medium text-red-950"
        >
          <span aria-hidden="true">⚠ </span>
          {formError}
        </div>
      )}

      <section aria-labelledby="active-incidents-heading" className="mt-4">
        <h3 id="active-incidents-heading" className="font-display text-sm font-bold text-slate-900">
          Incidencias activas ({activeIncidents.length})
        </h3>
        {loadingIncidents && activeIncidents.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Cargando incidencias…</p>
        ) : listError && activeIncidents.length === 0 ? (
          <div
            role="alert"
            className="mt-2 rounded-2xl border border-red-200 bg-red-50/90 p-2.5 text-sm text-red-950"
          >
            {listError.message}
          </div>
        ) : activeIncidents.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            No hay incidencias activas. Todos los caminos pavimentados y ascensores están operativos.
          </p>
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
                  className="card-3d flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 text-sm"
                >
                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          inc.severity === 'blocking'
                            ? 'pill-3d rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-900'
                            : 'pill-3d rounded-full bg-amber-300 px-2.5 py-0.5 text-xs font-bold text-slate-900'
                        }
                      >
                        <span aria-hidden="true">
                          {inc.severity === 'blocking' ? '⛔ ' : '⚠ '}
                        </span>
                        {inc.severity === 'blocking' ? 'Bloqueante' : 'Advertencia'}
                      </span>
                      <strong className="text-slate-900">{targetLabel}</strong>
                      <span className="text-xs text-slate-600">
                        ({CONFLICT_LABELS[inc.conflict_type] ?? inc.conflict_type})
                      </span>
                    </div>
                    <p className="text-slate-700">{inc.description}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Resolver: ${inc.description}`}
                    disabled={updateIncident.isPending}
                    onClick={() => handleResolve(inc)}
                    className="btn-3d min-h-10 shrink-0 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-950 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] disabled:opacity-50"
                  >
                    ✓ Resolver y habilitar
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="report-incident-heading"
        className="mt-6 border-t border-slate-200 pt-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id="report-incident-heading"
            className="font-display text-sm font-bold text-slate-900"
          >
            Reportar nueva incidencia o corte de camino
          </h3>
          {!isAuthenticated && (
            <button
              type="button"
              onClick={onRequireAuth}
              className="text-xs font-semibold text-indigo-700 underline hover:text-indigo-900"
            >
              O iniciar sesión con cuenta propia
            </button>
          )}
        </div>

        <form
          method="post"
          aria-labelledby="report-incident-heading"
          onSubmit={handleSubmit}
          className="mt-3 grid gap-3"
        >
          <fieldset className="grid gap-1">
            <legend className="text-xs font-semibold text-slate-700">
              Tipo de elemento afectado
            </legend>
            <div className="flex flex-wrap gap-4 pt-1">
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
                    setConflictType('corridor_closed')
                  }}
                  className="size-4 accent-[#DC2626]"
                />
                <label htmlFor="target-type-edge" className="text-sm font-medium text-slate-800">
                  🛣️ Tramo / Camino pavimentado / Rampa
                </label>
              </div>
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
                    setConflictType('elevator_broken')
                  }}
                  className="size-4 accent-[#DC2626]"
                />
                <label htmlFor="target-type-node" className="text-sm font-medium text-slate-800">
                  📍 Punto / Nodo (ascensor, plaza, acceso, aula)
                </label>
              </div>
            </div>
          </fieldset>

          <div className="grid gap-1">
            <label htmlFor="incident-target-select" className="text-xs font-semibold text-slate-700">
              {targetType === 'node' ? 'Nodo o acceso afectado' : 'Camino pavimentado o tramo afectado'} *
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
                      📍 [{n.id}] {n.name} ({n.building}, Piso {n.floor})
                    </option>
                  ))
                : edges.map((e) => (
                    <option key={e.id} value={e.id}>
                      {edgeNameById.get(e.id) ?? e.id}
                    </option>
                  ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor="incident-conflict-type" className="text-xs font-semibold text-slate-700">
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
              <label htmlFor="incident-severity" className="text-xs font-semibold text-slate-700">
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
                <option value="blocking">⛔ Bloqueante (cierra el camino y recalcula ruta)</option>
                <option value="warning">⚠ Advertencia (penaliza el paso por el tramo)</option>
              </select>
            </div>
          </div>

          <div className="grid gap-1">
            <label htmlFor="incident-description" className="text-xs font-semibold text-slate-700">
              Descripción *
            </label>
            <span id="incident-description-hint" className="text-xs text-slate-500">
              Describe el bloqueo o desperfecto (entre 3 y 280 caracteres).
            </span>
            <textarea
              id="incident-description"
              name="description"
              required
              minLength={3}
              maxLength={280}
              rows={2}
              placeholder="Ej: Obras en calzada pavimentada frente al patio central"
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
              className="btn-3d min-h-10 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createIncident.isPending}
              className="btn-3d-primary min-h-10 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] disabled:opacity-50"
            >
              {createIncident.isPending
                ? 'Actualizando caminos…'
                : '⛔ Reportar y actualizar caminos'}
            </button>
          </div>
        </form>
      </section>
    </dialog>
  )
}
