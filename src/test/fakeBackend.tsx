import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach } from 'vitest'
import App from '../App'
import { apiClient } from '../api/client'
import { AuthProvider } from '../auth/AuthContext'
import { ThemeModeProvider } from '../theme/ThemeModeProvider'

// A fake backend behind the real axios client (interceptors included): each
// "METHOD /path" maps to a reply, or to a function returning one (possibly a
// promise the test resolves later). Every request is recorded with its body.
export type Reply = { status: number; data?: unknown }
type Handler = Reply | ((body: unknown) => Reply | Promise<Reply>)

export interface RecordedRequest {
  key: string
  body: unknown
}

export const backend = {
  routes: {} as Record<string, Handler>,
  requests: [] as RecordedRequest[],
  calls(key: string): RecordedRequest[] {
    return this.requests.filter((r) => r.key === key)
  },
}

const realAdapter = apiClient.defaults.adapter

const fakeAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const key = `${config.method?.toUpperCase()} ${config.url}`
  const body = typeof config.data === 'string' && config.data.startsWith('{') ? JSON.parse(config.data) : config.data
  backend.requests.push({ key, body })
  const handler = backend.routes[key]
  const reply = handler === undefined ? { status: 404, data: { message: 'Not Found' } } : typeof handler === 'function' ? await handler(body) : handler
  const response: AxiosResponse = { data: reply.data ?? {}, status: reply.status, statusText: '', headers: {}, config }
  if (reply.status >= 400) {
    throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response)
  }
  return response
}

export const SETTINGS = {
  theme: 'SYSTEM', timezone: 'UTC', visibleBoardStatuses: ['NEW'], minimumFitScore: 70, aiProvider: null, aiModel: null,
  anthropicApiKeyConfigured: false, geminiApiKeyConfigured: false,
}

export function loggedOutBackend() {
  backend.routes = {
    'GET /api/auth/me': { status: 401 },
    'GET /api/auth/csrf': { status: 200 },
    'GET /api/board': { status: 200, data: [] },
    'GET /api/settings': { status: 200, data: SETTINGS },
    'GET /api/stages/upcoming': { status: 200, data: [] },
  }
}

export function loggedInBackend(user = { id: 7, email: 'me@example.com', fullName: null }) {
  loggedOutBackend()
  backend.routes['GET /api/auth/me'] = { status: 200, data: user }
}

export function renderApp(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeModeProvider>
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </ThemeModeProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

/** Registers the fake adapter around each test of the calling file. */
export function installFakeBackend() {
  beforeAll(() => {
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  })
  beforeEach(() => {
    backend.requests = []
    apiClient.defaults.adapter = fakeAdapter
  })
  afterEach(() => {
    apiClient.defaults.adapter = realAdapter
  })
}

/** Everything a page could have persisted outside React state. */
export function persistedState(queryClient: QueryClient): string {
  return JSON.stringify({
    queries: queryClient.getQueryCache().getAll().map((q) => [q.queryKey, q.state.data]),
    mutations: queryClient.getMutationCache().getAll().map((m) => m.state.variables),
    local: { ...window.localStorage },
    session: { ...window.sessionStorage },
    url: window.location.href,
  })
}
