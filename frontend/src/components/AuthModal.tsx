import { useEffect, useRef, useState } from 'react'

export interface AuthModalProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  onAuthenticated: (token: string) => void
}

const DEMO_TOKEN = 'demo-student-token'

const fieldClass =
  'min-h-10 w-full rounded-xl border border-slate-300 bg-slate-50/90 px-3 py-2 text-sm text-slate-900 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'

export function AuthModal({ open, onOpenChange, onAuthenticated }: AuthModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const pressedOutsideRef = useRef(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  const handleDemoLogin = () => {
    setErrorMessage(null)
    onAuthenticated(DEMO_TOKEN)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setErrorMessage(null)

    const form = e.currentTarget
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }

    const supabaseUrl = (
      (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
    ).replace(/\/+$/, '')
    const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

    if (!supabaseUrl || supabaseUrl.includes('YOUR_PROJECT_REF')) {
      setErrorMessage(
        'Supabase no está configurado en este entorno. Usa el botón "Usar cuenta demo (sin Supabase)".',
      )
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      })

      const raw = await response.text()
      let data: {
        access_token?: string
        error_description?: string
        msg?: string
        message?: string
        error?: string
      } = {}
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data
        } catch {
          data = {}
        }
      }

      if (!response.ok || !data.access_token) {
        const msg =
          data.error_description ||
          data.msg ||
          data.message ||
          data.error ||
          response.statusText ||
          'Credenciales inválidas o error al iniciar sesión.'
        setErrorMessage(msg)
        return
      }

      onAuthenticated(data.access_token)
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con el servicio de autenticación.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="auth-modal-title"
      className="panel-3d m-auto w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3 dark:border-slate-700">
        <h2 id="auth-modal-title" className="font-display text-lg font-bold text-slate-900 dark:text-white">
          Iniciar sesión
        </h2>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="btn-3d min-h-10 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Cerrar
        </button>
      </div>

      <div className="card-3d mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-700 dark:bg-slate-800/80">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Para pruebas de vista previa sin credenciales de Supabase activas:
        </p>
        <button
          type="button"
          onClick={handleDemoLogin}
          className="btn-3d-primary mt-2 min-h-10 w-full rounded-xl bg-[#FACC15] px-4 py-2 font-display text-sm font-bold text-slate-900 transition-colors hover:bg-[#FACC15]/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626]"
        >
          Usar cuenta demo (sin Supabase)
        </button>
      </div>

      <form
        method="post"
        aria-labelledby="auth-modal-title"
        onSubmit={(e) => void handleSubmit(e)}
        className="mt-4 grid gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"
      >
        {errorMessage && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50/90 p-3 text-sm font-medium text-red-950 dark:border-red-800 dark:bg-red-950/70 dark:text-red-100"
          >
            <span aria-hidden="true">⚠ </span>
            {errorMessage}
          </div>
        )}

        <div className="grid gap-1">
          <label htmlFor="auth-email" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Correo electrónico *
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoFocus
            required
            autoComplete="username"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            enterKeyHint="next"
            className={fieldClass}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (errorMessage) setErrorMessage(null)
            }}
          />
        </div>

        <div className="grid gap-1">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="auth-password" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Contraseña *
            </label>
            <button
              type="button"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 underline hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] dark:text-slate-300 dark:hover:text-white"
            >
              {showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            </button>
          </div>
          <input
            id="auth-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            enterKeyHint="done"
            className={fieldClass}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (errorMessage) setErrorMessage(null)
            }}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="btn-3d min-h-10 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="min-h-10 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#B91C1C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC2626] disabled:opacity-50"
          >
            {isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
