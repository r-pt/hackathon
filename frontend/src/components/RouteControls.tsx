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

export interface RouteControlsProps extends Omit<RouteControlsPatch, 'originId' | 'destId' | 'algorithm'> {
  locations: LocationItem[]
  floors?: number[]
  originId?: string
  destId?: string
  algorithm?: SearchAlgorithm
  onChange: (patch: Partial<RouteControlsPatch>) => void
  gpsRealActive?: boolean
  gpsStatusMessage?: string | null
  gpsError?: string | null
  autoWalking?: boolean
  hasActiveRoute?: boolean
  routeStepsCount?: number
  onOpenFullSteps?: () => void
  reachedGoal?: boolean
  onToggleRealGps?: () => void
  onStepForward?: () => void
  onToggleAutoWalk?: () => void
}

const fieldBaseClass =
  'min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50/90 px-3 py-2 text-sm text-slate-900 shadow-inner transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'

const NODE_TYPE_ICON: Record<NodeType, string> = {
  room: '🏛️',
  elevator: '🛗',
  entrance: '🚪',
  corridor: '🧭',
  ramp: '♿',
  stairs: '🪜',
}

function getLocationOptionIcon(item: LocationItem): string {
  if (item.building === 'Red Vial Pavimentada') return '🛣️'
  return NODE_TYPE_ICON[item.node_type] ?? '📍'
}

function getBuildingSortRank(building: string): number {
  const b = building.trim()
  if (b.startsWith('Edificio ')) return 0
  if (b === 'Red Vial Pavimentada') return 2
  if (b === 'Exterior') return 3
  return 1
}

function getBuildingGroupLabel(building: string): string {
  const b = building.trim()
  if (b === 'Exterior') return '🚪 Exterior (Accesos y Salidas)'
  if (b === 'Red Vial Pavimentada') return '🛣️ Red Vial Pavimentada'
  return `🏛️ ${b}`
}

function groupLocationsByBuilding(locations: LocationItem[]): { building: string; label: string; items: LocationItem[] }[] {
  const map = new Map<string, LocationItem[]>()
  for (const loc of locations) {
    const key = (loc.building || 'Exterior').trim()
    const list = map.get(key) ?? []
    list.push(loc)
    map.set(key, list)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => {
      const rankDiff = getBuildingSortRank(a) - getBuildingSortRank(b)
      if (rankDiff !== 0) return rankDiff
      return a.localeCompare(b, 'es')
    })
    .map(([building, items]) => ({
      building,
      label: getBuildingGroupLabel(building),
      items: [...items].sort((a, b) => a.floor - b.floor || a.name.localeCompare(b.name, 'es')),
    }))
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
  onPick,
}: {
  id: string
  name: string
  kind: 'origin' | 'dest'
  label: string
  value?: string
  locations: LocationItem[]
  onPick: (id: string) => void
}) {
  const hasSelection = Boolean(value)
  const isOrigin = kind === 'origin'
  const buildingGroups = groupLocationsByBuilding(locations)
  return (
    <div className="grid gap-1">
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200"
      >
        <span
          className={
            isOrigin
              ? 'pill-3d inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 font-display text-xs font-bold text-sky-900 dark:border-sky-700 dark:bg-sky-950/80 dark:text-sky-200'
              : 'pill-3d inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 font-display text-xs font-bold text-amber-950 dark:border-amber-700 dark:bg-amber-950/80 dark:text-amber-200'
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
              ? 'border-l-4 border-l-[#0EA5E9] bg-white dark:border-l-sky-400 dark:bg-slate-900'
              : 'border-l-4 border-l-amber-400 bg-white dark:border-l-amber-400 dark:bg-slate-900'
            : ''
        }`}
        value={value ?? ''}
        onChange={(e) => onPick(e.target.value)}
      >
        <option value="" disabled>
          Selecciona un lugar por edificio…
        </option>
        {buildingGroups.map((group) => (
          <optgroup key={group.building} label={group.label}>
            {group.items.map((l) => {
              const icon = getLocationOptionIcon(l)
              return (
                <option key={l.id} value={l.id}>
                  {icon} {l.name} (Piso {l.floor})
                </option>
              )
            })}
          </optgroup>
        ))}
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
    <div className="card-3d flex min-h-10 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-1.5 transition-colors hover:bg-slate-100/90 dark:bg-slate-800/80 dark:hover:bg-slate-800">
      <label htmlFor={id} className="cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-100">
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
  floorView,
  onChange,
  gpsRealActive = false,
  gpsStatusMessage = null,
  gpsError = null,
  autoWalking = false,
  hasActiveRoute = false,
  routeStepsCount = 0,
  onOpenFullSteps,
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
        onPick={(id) => onChange({ originId: id })}
      />
      <button
        type="button"
        className="btn-3d min-h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-150 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
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
        onPick={(id) => onChange({ destId: id })}
      />

      {showGpsPanel && (
        <fieldset className="card-3d grid gap-2 rounded-2xl border border-sky-200/90 bg-sky-50/75 p-3 dark:border-sky-800/80 dark:bg-slate-800/80">
          <legend className="font-display px-1 text-xs font-bold text-sky-950 dark:text-sky-200">
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
                  : 'btn-3d flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-900 transition-all duration-150 hover:bg-sky-100/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-sky-700 dark:bg-slate-800 dark:text-sky-200 dark:hover:bg-slate-700'
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
                  className="btn-3d min-h-9 rounded-xl border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-900 transition-all duration-150 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-45 dark:border-indigo-700 dark:bg-slate-800 dark:text-indigo-200 dark:hover:bg-slate-700"
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
              className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-medium text-amber-950 dark:border-amber-700 dark:bg-amber-950/70 dark:text-amber-100"
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
                  ? 'rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-100'
                  : 'rounded-xl border border-sky-200 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-sky-950 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100'
              }
            >
              {gpsStatusMessage}
            </p>
          )}
        </fieldset>
      )}

      <div className="card-3d grid gap-1.5 rounded-2xl border border-slate-200/90 bg-slate-50/90 p-3 dark:border-slate-700 dark:bg-slate-800/80">
        <p className="font-display text-xs font-bold text-slate-800 dark:text-slate-100">
          Entorno: Escaleras y Elevación
        </p>
        <p
          className={
            stairsAllowedNow
              ? 'text-xs font-medium text-amber-950 dark:text-amber-200'
              : 'text-xs font-semibold text-emerald-900 dark:text-emerald-300'
          }
        >
          {stairsAllowedNow
            ? '🪜 Escaleras P1↔P2 y desniveles habilitadas'
            : '♿ Evitar escaleras — usar rampas y ascensores'}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <span className="pill-3d rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            P1↔P2: {floorStairsEnabled ? 'Activas' : 'Desactivadas'}
          </span>
          <span className="pill-3d rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            Desniveles Δz: {elevationStairsEnabled ? 'Activos' : 'Desactivados'}
          </span>
        </div>
      </div>

      <fieldset className="grid gap-1.5 border-t border-slate-200/80 pt-2.5 dark:border-slate-700/80">
        <legend className="font-display text-xs font-semibold text-slate-600 dark:text-slate-300">
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

      <div className="grid gap-1 border-t border-slate-200/80 pt-2.5 dark:border-slate-700/80">
        <label htmlFor="route-floor-view" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
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

      {hasActiveRoute && routeStepsCount > 0 && onOpenFullSteps && (
        <button
          type="button"
          onClick={onOpenFullSteps}
          className="btn-3d-primary flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-all duration-150 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:bg-sky-600 dark:text-white dark:hover:bg-sky-500"
        >
          <span aria-hidden="true">📋</span>
          <span>Ver todos los pasos del recorrido ({routeStepsCount})</span>
        </button>
      )}
    </form>
  )
}
