import type { LocationItem, NodeType, SearchAlgorithm } from '@/api/types'

export type FloorView = 'stacked' | number

export interface RouteControlsPatch {
  originId: string
  destId: string
  reducedMobility: boolean
  preferCovered: boolean
  simulateRain: boolean
  algorithm: SearchAlgorithm
  floorView: FloorView
}

export interface RouteControlsProps extends Omit<RouteControlsPatch, 'originId' | 'destId'> {
  locations: LocationItem[]
  floors?: number[]
  originId?: string
  destId?: string
  onChange: (patch: Partial<RouteControlsPatch>) => void
  gpsRealActive?: boolean
  gpsStatusMessage?: string | null
  gpsError?: string | null
  autoWalking?: boolean
  hasActiveRoute?: boolean
  reachedGoal?: boolean
  onToggleRealGps?: () => void
  onStepForward?: () => void
  onToggleAutoWalk?: () => void
}

const fieldBaseClass =
  'min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50/90 px-3 py-2 text-sm text-slate-900 shadow-inner transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'

const NODE_TYPE_ICON: Record<NodeType, string> = {
  room: '🏛️',
  elevator: '🛗',
  entrance: '🚪',
  corridor: '🧭',
  ramp: '♿',
  stairs: '🪜',
}

function getFloorGroupLabel(floor: number, count: number): string {
  const suffix = count === 1 ? '1 lugar' : `${count} lugares`
  if (floor === 1) return `Piso 1 — Nivel Terreno (${suffix})`
  if (floor === 2) return `Piso 2 — Nivel Superior (${suffix})`
  return `Piso ${floor} (${suffix})`
}

export function PersonBadgeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-3.5 shrink-0"
      fill="currentColor"
    >
      <circle cx="10" cy="6.2" r="3.2" />
      <path d="M4.2 16.5c0-3.1 2.6-5.2 5.8-5.2s5.8 2.1 5.8 5.2v.5H4.2v-.5Z" />
    </svg>
  )
}

export function FlagBadgeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 17.5V3.5" />
      <path d="M4.5 4h10.5l-2.4 3.5L15 11H4.5" fill="currentColor" />
    </svg>
  )
}

function LocationSelect({
  id,
  name,
  kind,
  label,
  value,
  locations,
  floors,
  onPick,
}: {
  id: string
  name: string
  kind: 'origin' | 'dest'
  label: string
  value?: string
  locations: LocationItem[]
  floors: number[]
  onPick: (id: string) => void
}) {
  const hasSelection = Boolean(value)
  const isOrigin = kind === 'origin'
  return (
    <div className="grid gap-1">
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-xs font-semibold text-slate-800"
      >
        <span
          className={
            isOrigin
              ? 'pill-3d inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 font-display text-xs font-bold text-sky-900'
              : 'pill-3d inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-display text-xs font-bold text-amber-950'
          }
        >
          {isOrigin ? <PersonBadgeIcon /> : <FlagBadgeIcon />}
          <span>{isOrigin ? 'Tú' : 'Meta'}</span>
        </span>
        <span>{label}</span>
      </label>
      <select
        id={id}
        name={name}
        className={`${fieldBaseClass} ${
          hasSelection
            ? isOrigin
              ? 'border-l-4 border-l-[#0EA5E9] bg-white'
              : 'border-l-4 border-l-amber-400 bg-white'
            : ''
        }`}
        value={value ?? ''}
        onChange={(e) => onPick(e.target.value)}
      >
        <option value="" disabled>
          Selecciona un lugar (Piso 1, Piso 2 o Salidas)…
        </option>
        {floors.map((f) => {
          const floorLocations = locations.filter((l) => l.floor === f)
          if (floorLocations.length === 0) return null
          return (
            <optgroup key={f} label={getFloorGroupLabel(f, floorLocations.length)}>
              {floorLocations.map((l) => {
                const icon = NODE_TYPE_ICON[l.node_type] ?? '📍'
                return (
                  <option key={l.id} value={l.id}>
                    {icon} {l.name} ({l.building})
                  </option>
                )
              })}
            </optgroup>
          )
        })}
      </select>
    </div>
  )
}

function Toggle({
  id,
  name,
  label,
  checked,
  onToggle,
}: {
  id: string
  name: string
  label: string
  checked: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <div className="card-3d flex min-h-10 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-1.5 transition-colors hover:bg-slate-100/90">
      <label htmlFor={id} className="cursor-pointer text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        className="size-5 shrink-0 cursor-pointer accent-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
    </div>
  )
}

export function RouteControls({
  locations,
  floors,
  originId,
  destId,
  reducedMobility,
  preferCovered,
  simulateRain,
  algorithm,
  floorView,
  onChange,
  gpsRealActive = false,
  gpsStatusMessage = null,
  gpsError = null,
  autoWalking = false,
  hasActiveRoute = false,
  reachedGoal = false,
  onToggleRealGps,
  onStepForward,
  onToggleAutoWalk,
}: RouteControlsProps) {
  const derivedFloors =
    floors && floors.length > 0
      ? Array.from(new Set([...floors, ...locations.map((l) => l.floor)])).sort((a, b) => a - b)
      : locations.length > 0
        ? Array.from(new Set(locations.map((l) => l.floor))).sort((a, b) => a - b)
        : [1, 2]

  const floorStairsEnabled = import.meta.env.VITE_ENABLE_FLOOR_STAIRS !== 'false'
  const elevationStairsEnabled = import.meta.env.VITE_ENABLE_ELEVATION_STAIRS !== 'false'
  const stairsAllowedNow = !reducedMobility && (floorStairsEnabled || elevationStairsEnabled)

  const showGpsPanel = Boolean(onToggleRealGps || onStepForward || onToggleAutoWalk)

  return (
    <form
      className="grid gap-3"
      aria-label="Opciones de ruta"
      onSubmit={(e) => e.preventDefault()}
    >
      <LocationSelect
        id="route-origin"
        name="originId"
        kind="origin"
        label="Ubicación actual"
        value={originId}
        locations={locations}
        floors={derivedFloors}
        onPick={(id) => onChange({ originId: id })}
      />
      <button
        type="button"
        className="btn-3d min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-150 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() =>
          onChange({
            originId: destId ?? '',
            destId: originId ?? '',
          })
        }
        disabled={!originId && !destId}
      >
        <span aria-hidden="true">⇅ </span>Intercambiar ubicación y destino
      </button>
      <LocationSelect
        id="route-dest"
        name="destId"
        kind="dest"
        label="Destino"
        value={destId}
        locations={locations}
        floors={derivedFloors}
        onPick={(id) => onChange({ destId: id })}
      />

      {showGpsPanel && (
        <fieldset className="card-3d grid gap-2 rounded-2xl border border-sky-200/90 bg-sky-50/75 p-3">
          <legend className="font-display px-1 text-xs font-bold text-sky-950">
            Modo GPS en vivo
          </legend>

          {onToggleRealGps && (
            <button
              type="button"
              onClick={onToggleRealGps}
              aria-pressed={gpsRealActive}
              className={
                gpsRealActive
                  ? 'btn-3d-primary flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0EA5E9] px-3 py-2 text-xs font-bold text-white transition-all duration-150 hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700'
                  : 'btn-3d flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-900 transition-all duration-150 hover:bg-sky-100/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'
              }
            >
              <span
                aria-hidden="true"
                className={
                  gpsRealActive
                    ? 'gps-radar-dot relative inline-block size-2.5 rounded-full bg-white'
                    : 'inline-block size-2.5 rounded-full bg-[#0EA5E9]'
                }
              />
              <span>{gpsRealActive ? 'Detener GPS real' : 'Activar GPS real'}</span>
            </button>
          )}

          {(onStepForward || onToggleAutoWalk) && (
            <div className="grid grid-cols-2 gap-2">
              {onStepForward && (
                <button
                  type="button"
                  onClick={onStepForward}
                  disabled={!hasActiveRoute}
                  className="btn-3d min-h-9 rounded-xl border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-900 transition-all duration-150 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Avanzar 1 paso
                </button>
              )}
              {onToggleAutoWalk && (
                <button
                  type="button"
                  onClick={onToggleAutoWalk}
                  aria-pressed={autoWalking}
                  disabled={!hasActiveRoute && !autoWalking}
                  className={
                    autoWalking
                      ? 'btn-3d-primary min-h-9 rounded-xl bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white transition-all duration-150 hover:bg-rose-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600'
                      : 'btn-3d-primary min-h-9 rounded-xl bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-all duration-150 hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-45'
                  }
                >
                  {autoWalking ? 'Pausar recorrido' : 'Auto-recorrer ruta'}
                </button>
              )}
            </div>
          )}

          {gpsError && (
            <p
              role="alert"
              className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-950"
            >
              {gpsError}
            </p>
          )}

          {!gpsError && gpsStatusMessage && (
            <p
              role="status"
              aria-live="polite"
              className={
                reachedGoal
                  ? 'rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-950'
                  : 'rounded-xl border border-sky-200 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-sky-950'
              }
            >
              {gpsStatusMessage}
            </p>
          )}
        </fieldset>
      )}

      <div className="card-3d grid gap-1.5 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3">
        <p className="font-display text-xs font-bold text-slate-800">
          Entorno: Escaleras y Elevación
        </p>
        <p
          className={
            stairsAllowedNow
              ? 'text-xs font-medium text-amber-950'
              : 'text-xs font-semibold text-emerald-900'
          }
        >
          {stairsAllowedNow
            ? '🪜 Escaleras P1↔P2 y desniveles habilitadas'
            : '♿ Evitar escaleras — usar rampas y ascensores'}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <span className="pill-3d rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
            P1↔P2: {floorStairsEnabled ? 'Activas' : 'Desactivadas'}
          </span>
          <span className="pill-3d rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
            Desniveles Δz: {elevationStairsEnabled ? 'Activos' : 'Desactivados'}
          </span>
        </div>
      </div>

      <fieldset className="grid gap-1.5 border-t border-slate-200/80 pt-2.5">
        <legend className="font-display text-xs font-semibold text-slate-600">
          Preferencias de accesibilidad y clima
        </legend>
        <Toggle
          id="pref-reduced-mobility"
          name="reducedMobility"
          label="Tengo movilidad reducida"
          checked={reducedMobility}
          onToggle={(v) => onChange({ reducedMobility: v })}
        />
        <Toggle
          id="pref-covered"
          name="preferCovered"
          label="Preferir tramos cubiertos"
          checked={preferCovered}
          onToggle={(v) => onChange({ preferCovered: v })}
        />
        <Toggle
          id="pref-simulate-rain"
          name="simulateRain"
          label="Simular lluvia"
          checked={simulateRain}
          onToggle={(v) => onChange({ simulateRain: v })}
        />
      </fieldset>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-200/80 pt-2.5">
        <div className="grid gap-1">
          <label htmlFor="route-floor-view" className="text-xs font-semibold text-slate-700">
            Vista de pisos
          </label>
          <select
            id="route-floor-view"
            name="floorView"
            className={fieldBaseClass}
            value={String(floorView)}
            onChange={(e) => {
              const v = e.target.value
              onChange({ floorView: v === 'stacked' ? 'stacked' : Number(v) })
            }}
          >
            <option value="stacked">Ambos pisos</option>
            {derivedFloors.map((f) => (
              <option key={f} value={String(f)}>
                Piso {f}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1">
          <label htmlFor="route-algorithm" className="text-xs font-semibold text-slate-700">
            Algoritmo
          </label>
          <select
            id="route-algorithm"
            name="algorithm"
            className={fieldBaseClass}
            value={algorithm}
            onChange={(e) => onChange({ algorithm: e.target.value as SearchAlgorithm })}
          >
            <option value="astar">A* (3D)</option>
            <option value="dijkstra">Dijkstra</option>
          </select>
        </div>
      </div>
    </form>
  )
}
