import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
})

// Called when an API request answers 401, i.e. the session is gone (expired,
// or ended on the server). AuthProvider registers it; the client itself knows
// nothing about React or the query cache. A failed login also answers 401 but
// is a wrong password, not a lost session, so it never triggers this.
let onSessionExpired: (() => void) | null = null

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler
}

apiClient.interceptors.response.use(undefined, (error) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && error.config?.url !== '/api/auth/login') {
    onSessionExpired?.()
  }
  return Promise.reject(error)
})

export interface ApiError {
  timestamp: string
  status: number
  error: string
  message: string
  code?: string
  path: string
  fieldErrors: { field: string; message: string }[]
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'status' in value && 'message' in value
}
