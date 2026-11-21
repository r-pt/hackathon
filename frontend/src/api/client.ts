import type {
  CalculateRouteRequest,
  CalculateRouteResponse,
  CampusMapResponse,
  CreateIncidentRequest,
  ErrorCode,
  ErrorDetails,
  ErrorResponse,
  Incident,
  IncidentsListResponse,
  LocationsResponse,
  UpdateIncidentRequest,
  UpdatePreferencesRequest,
  UserProfile,
  WeatherResponse,
} from '@/api/types'

const TOKEN_STORAGE_KEY = 'campusroute_auth_token'

let currentAuthToken: string | null =
  typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null

const authListeners = new Set<(token: string | null) => void>()

export function setAuthToken(token: string | null): void {
  currentAuthToken = token
  if (typeof window !== 'undefined') {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token)
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY)
    }
  }
  authListeners.forEach((listener) => listener(currentAuthToken))
}

export function getAuthToken(): string | null {
  return currentAuthToken
}

export function subscribeAuthToken(listener: (token: string | null) => void): () => void {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

export class ApiError extends Error {
  code: ErrorCode
  status: number
  details?: ErrorDetails

  constructor(code: ErrorCode, message: string, status = 500, details?: ErrorDetails) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  if (raw) {
    const cleaned = raw.replace(/\/+$/, '')
    if (
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(cleaned)
    ) {
      return ''
    }
    return cleaned
  }
  return import.meta.env.DEV ? 'http://localhost:8000' : ''
}

function statusToErrorCode(status: number): ErrorCode {
  if (status === 400) return 'VALIDATION_ERROR'
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 404) return 'NOT_FOUND'
  if (status === 422) return 'NO_ACCESSIBLE_ROUTE'
  if (status === 502 || status === 503) return 'EXTERNAL_SERVICE_ERROR'
  return 'INTERNAL_ERROR'
}

async function runFallback<T>(
  normalizedPath: string,
  init: RequestInit,
  originalErr?: unknown,
): Promise<T> {
  const { FallbackApiError, handleFallbackRequest } = await import('@/api/fallback')
  try {
    return handleFallbackRequest<T>(normalizedPath, init)
  } catch (fallbackErr) {
    if (fallbackErr instanceof FallbackApiError) {
      throw new ApiError(
        fallbackErr.code,
        fallbackErr.message,
        fallbackErr.status,
        fallbackErr.details,
      )
    }
    throw new ApiError(
      'EXTERNAL_SERVICE_ERROR',
      originalErr instanceof Error
        ? originalErr.message
        : 'No se pudo conectar con el servidor API.',
      0,
    )
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const url = `${baseUrl}${normalizedPath}`
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (currentAuthToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${currentAuthToken}`)
  }

  let response: Response
  try {
    response = await fetch(url, { ...init, headers })
  } catch (err) {
    return runFallback<T>(normalizedPath, init, err)
  }

  const rawText = await response.text()
  let parsed: unknown = undefined
  if (rawText) {
    try {
      parsed = JSON.parse(rawText)
    } catch {
      parsed = undefined
    }
  }

  if (!response.ok) {
    if (response.status === 401 && currentAuthToken) {
      setAuthToken(null)
    }
    const maybeErr = parsed as Partial<ErrorResponse> | undefined
    if (maybeErr?.error && typeof maybeErr.error === 'object' && maybeErr.error.code) {
      throw new ApiError(
        maybeErr.error.code,
        maybeErr.error.message || response.statusText || 'Error en la solicitud',
        response.status,
        maybeErr.error.details,
      )
    }
    throw new ApiError(
      statusToErrorCode(response.status),
      response.statusText || `HTTP ${response.status}`,
      response.status,
    )
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('text/html') || (rawText && parsed === undefined)) {
    return runFallback<T>(normalizedPath, init)
  }

  return parsed as T
}

export const apiClient = {
  getMe: () => apiFetch<UserProfile>('/api/v1/auth/me'),
  updatePreferences: (data: UpdatePreferencesRequest) =>
    apiFetch<UserProfile>('/api/v1/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getCampusMap: (floor?: number) => {
    const qs = floor !== undefined ? `?floor=${encodeURIComponent(String(floor))}` : ''
    return apiFetch<CampusMapResponse>(`/api/v1/campus/map${qs}`)
  },
  getLocations: (params?: { search?: string; floor?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.set('search', params.search)
    if (params?.floor !== undefined) searchParams.set('floor', String(params.floor))
    const qs = searchParams.toString()
    return apiFetch<LocationsResponse>(`/api/v1/campus/locations${qs ? `?${qs}` : ''}`)
  },
  getIncidents: (status: 'active' | 'resolved' | 'all' = 'active') =>
    apiFetch<IncidentsListResponse>(`/api/v1/incidents?status=${encodeURIComponent(status)}`),
  createIncident: async (data: CreateIncidentRequest) => {
    const created = await apiFetch<Incident>('/api/v1/incidents', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    void import('@/api/fallback').then((m) => m.syncFallbackIncident(created))
    return created
  },
  updateIncident: async (incidentId: string, data: UpdateIncidentRequest) => {
    const updated = await apiFetch<Incident>(
      `/api/v1/incidents/${encodeURIComponent(incidentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    )
    void import('@/api/fallback').then((m) => m.syncFallbackIncident(updated))
    return updated
  },
  calculateRoute: (data: CalculateRouteRequest) =>
    apiFetch<CalculateRouteResponse>('/api/v1/routes/calculate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getWeather: () => apiFetch<WeatherResponse>('/api/v1/external/weather'),
}
