import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import {
  ApiError,
  apiClient,
  getAuthToken,
  setAuthToken,
  subscribeAuthToken,
} from '@/api/client'
import type {
  CalculateRouteRequest,
  CalculateRouteResponse,
  CampusMapResponse,
  CreateIncidentRequest,
  Incident,
  IncidentsListResponse,
  LocationsResponse,
  UpdateIncidentRequest,
  UpdatePreferencesRequest,
  UserProfile,
  WeatherResponse,
} from '@/api/types'

export { ApiError, getAuthToken, setAuthToken, subscribeAuthToken }

export const queryKeys = {
  campusMap: (floor?: number) => ['campusMap', floor ?? 'all'] as const,
  locations: (params?: { search?: string; floor?: number }) =>
    ['locations', params?.search ?? '', params?.floor ?? 'all'] as const,
  incidents: (status: 'active' | 'resolved' | 'all' = 'active') => ['incidents', status] as const,
  route: (req?: CalculateRouteRequest | null) => ['route', req ?? null] as const,
  weather: () => ['weather'] as const,
  me: () => ['me'] as const,
}

export function useCampusMap(floor?: number): UseQueryResult<CampusMapResponse, ApiError> {
  return useQuery<CampusMapResponse, ApiError>({
    queryKey: queryKeys.campusMap(floor),
    queryFn: () => apiClient.getCampusMap(floor),
  })
}

export function useLocations(params?: {
  search?: string
  floor?: number
}): UseQueryResult<LocationsResponse, ApiError> {
  return useQuery<LocationsResponse, ApiError>({
    queryKey: queryKeys.locations(params),
    queryFn: () => apiClient.getLocations(params),
  })
}

export function useIncidents(
  status: 'active' | 'resolved' | 'all' = 'active',
  enabled = true,
): UseQueryResult<IncidentsListResponse, ApiError> {
  return useQuery<IncidentsListResponse, ApiError>({
    queryKey: queryKeys.incidents(status),
    queryFn: () => apiClient.getIncidents(status),
    enabled,
  })
}

export function useCreateIncident(): UseMutationResult<
  Incident,
  ApiError,
  CreateIncidentRequest
> {
  const queryClient = useQueryClient()
  return useMutation<Incident, ApiError, CreateIncidentRequest>({
    mutationFn: (data) => apiClient.createIncident(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campusMap'] })
      void queryClient.invalidateQueries({ queryKey: ['incidents'] })
      void queryClient.invalidateQueries({ queryKey: ['route'] })
    },
  })
}

export type UpdateIncidentVariables = { id: string } & UpdateIncidentRequest

export function useUpdateIncident(): UseMutationResult<
  Incident,
  ApiError,
  UpdateIncidentVariables
> {
  const queryClient = useQueryClient()
  return useMutation<Incident, ApiError, UpdateIncidentVariables>({
    mutationFn: ({ id, ...payload }) => apiClient.updateIncident(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campusMap'] })
      void queryClient.invalidateQueries({ queryKey: ['incidents'] })
      void queryClient.invalidateQueries({ queryKey: ['route'] })
    },
  })
}

export function useCalculateRoute(
  request?: CalculateRouteRequest | null,
): UseQueryResult<CalculateRouteResponse, ApiError> {
  const enabled = Boolean(
    request &&
      request.origin_node_id &&
      request.destination_node_id &&
      request.origin_node_id !== request.destination_node_id,
  )
  return useQuery<CalculateRouteResponse, ApiError>({
    queryKey: queryKeys.route(request),
    queryFn: () => {
      if (!request) {
        throw new ApiError('VALIDATION_ERROR', 'Parámetros de ruta incompletos', 400)
      }
      return apiClient.calculateRoute(request)
    },
    enabled,
    retry: false,
  })
}

export function useWeather(): UseQueryResult<WeatherResponse, ApiError> {
  return useQuery<WeatherResponse, ApiError>({
    queryKey: queryKeys.weather(),
    queryFn: () => apiClient.getWeather(),
  })
}

export function useMe(enabled = true): UseQueryResult<UserProfile, ApiError> {
  return useQuery<UserProfile, ApiError>({
    queryKey: queryKeys.me(),
    queryFn: () => apiClient.getMe(),
    enabled: Boolean(getAuthToken()) && enabled,
    retry: false,
  })
}

export function useUpdatePreferences(): UseMutationResult<
  UserProfile,
  ApiError,
  UpdatePreferencesRequest
> {
  const queryClient = useQueryClient()
  return useMutation<UserProfile, ApiError, UpdatePreferencesRequest>({
    mutationFn: (data) => apiClient.updatePreferences(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.me(), updated)
      void queryClient.invalidateQueries({ queryKey: ['route'] })
    },
  })
}
