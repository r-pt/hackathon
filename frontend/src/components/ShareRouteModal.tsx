import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { CalculateRouteResponse } from '@/api/types'

export interface ShareRouteModalProps {
  open: boolean
  onClose: () => void
  shareUrl: string
  originName: string
  destName: string
  route: CalculateRouteResponse | undefined
  reducedMobility: boolean
  preferCovered: boolean
  evacuationMode?: boolean
}

export function ShareRouteModal({
  open,
  onClose,
  shareUrl,
  originName,
  destName,
  route,
  reducedMobility,
  preferCovered,
  evacuationMode = false,
}: ShareRouteModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const pressedOutsideRef = useRef(false)
  const copyTimerRef = useRef<number | null>(null)

  const [copied, setCopied] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const qrSvg = useMemo(() => {
    const payload = shareUrl?.trim() || 'https://campusroute-frontend.vercel.app'
    try {
      const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' })
      const size = qr.modules.size
      const margin = 4
      const parts: string[] = []
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (qr.modules.get(row, col)) {
            parts.push(`M${col + margin} ${row + margin}h1v1h-1z`)
          }
        }
      }
      return {
        viewBoxSize: size + margin * 2,
        pathData: parts.join(''),
      }
    } catch {
      return null
    }
  }, [shareUrl])

  const isOutside = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement) => {
    const r = dialog.getBoundingClientRect()
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
  }

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const temp = document.createElement('textarea')
        temp.value = shareUrl
        temp.setAttribute('readonly', '')
        temp.style.position = 'fixed'
        temp.style.opacity = '0'
        document.body.appendChild(temp)
        temp.select()
        document.execCommand('copy')
        document.body.removeChild(temp)
      }
      setCopied(true)
      setCopyFeedback('Enlace copiado al portapapeles.')
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false)
        setCopyFeedback(null)
      }, 2500)
    } catch {
      setCopyFeedback('No se pudo copiar automáticamente. Selecciona el enlace manualmente.')
    }
  }

  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const handleNativeShare = async () => {
    if (!canNativeShare) return
    try {
      await navigator.share({
        title: evacuationMode
          ? `Ruta de evacuación: ${originName} → ${destName}`
          : `RutaCampus: ${originName} → ${destName}`,
        text: route
          ? `${originName} → ${destName} (${route.metrics.total_distance_m} m, ${route.metrics.estimated_time_min} min)`
          : `${originName} → ${destName}`,
        url: shareUrl,
      })
    } catch {
      // User cancelled native share sheet
    }
  }

  const showAccessibleBadge = reducedMobility || Boolean(route?.accessibility_verified)
  const showCoveredBadge = preferCovered || Boolean(route?.weather_applied.rain_avoidance_active)

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="share-route-modal-title"
      className="panel-3d m-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      onClose={() => {
        if (open) onClose()
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
          onClose()
        }
        pressedOutsideRef.current = false
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-700">
        <h2
          id="share-route-modal-title"
          className="font-display text-lg font-bold text-slate-900 dark:text-white"
        >
          🔗 Compartir ruta por enlace y QR
        </h2>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="btn-3d min-h-10 shrink-0 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          Cerrar
        </button>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="card-3d grid gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-3.5 dark:border-slate-700 dark:bg-slate-800/80">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            <span className="text-sky-800 dark:text-sky-300">{originName}</span>{' '}
            <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">
              →
            </span>{' '}
            <span className="text-amber-800 dark:text-amber-300">{destName}</span>
          </p>

          {route && (
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200">
              <span>📏 {route.metrics.total_distance_m} m</span>
              <span>⏱ {route.metrics.estimated_time_min} min</span>
              <span>🏢 Pisos {route.metrics.floors_traversed.join(' / ')}</span>
            </div>
          )}

          {(showAccessibleBadge || showCoveredBadge || evacuationMode) && (
            <ul className="flex flex-wrap gap-1.5 pt-0.5" role="list" aria-label="Opciones incluidas en el enlace">
              {evacuationMode && (
                <li className="pill-3d rounded-full border border-red-300 bg-[#DC2626] px-2.5 py-0.5 text-xs font-bold text-white dark:border-red-700">
                  🚨 Evacuación
                </li>
              )}
              {showAccessibleBadge && (
                <li className="pill-3d rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200">
                  ♿ Accesible
                </li>
              )}
              {showCoveredBadge && (
                <li className="pill-3d rounded-full border border-sky-300 bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-950 dark:border-sky-800 dark:bg-sky-950/80 dark:text-sky-200">
                  ☔ Bajo techo
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-md">
            {qrSvg ? (
              <svg
                viewBox={`0 0 ${qrSvg.viewBoxSize} ${qrSvg.viewBoxSize}`}
                shapeRendering="crispEdges"
                className="size-48 sm:size-52"
                role="img"
                aria-label={`Código QR para abrir la ruta de ${originName} a ${destName}`}
              >
                <rect width={qrSvg.viewBoxSize} height={qrSvg.viewBoxSize} fill="#FFFFFF" />
                <path d={qrSvg.pathData} fill="#0F172A" />
              </svg>
            ) : (
              <p className="p-4 text-xs text-slate-600">No se pudo generar el código QR.</p>
            )}
          </div>
          <p className="text-center text-xs text-slate-600 dark:text-slate-300">
            Escanea con la cámara de tu teléfono para abrir esta ruta con tus preferencias.
          </p>
        </div>

        <div className="grid gap-2">
          <label
            htmlFor="share-route-url-input"
            className="text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            Enlace directo a esta ruta
          </label>
          <input
            id="share-route-url-input"
            name="shareUrl"
            type="text"
            readOnly
            value={shareUrl}
            onClick={(e) => e.currentTarget.select()}
            className="min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />

          <div className={`grid gap-2 ${canNativeShare ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={
                copied
                  ? 'btn-3d-primary min-h-10 w-full rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white transition-all duration-150 hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600'
                  : 'btn-3d-primary min-h-10 w-full rounded-xl bg-[#0EA5E9] px-3.5 py-2 text-xs font-bold text-white transition-all duration-150 hover:bg-sky-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9]'
              }
            >
              {copied ? '✅ ¡Enlace copiado!' : '📋 Copiar enlace'}
            </button>

            {canNativeShare && (
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="btn-3d min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0EA5E9] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                📱 Compartir
              </button>
            )}
          </div>

          <p
            role="status"
            aria-live="polite"
            className="min-h-4 text-xs font-medium text-emerald-800 dark:text-emerald-300"
          >
            {copyFeedback ?? ''}
          </p>
        </div>
      </div>
    </dialog>
  )
}
