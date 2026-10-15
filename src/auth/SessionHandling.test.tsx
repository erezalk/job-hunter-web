import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import { apiClient } from '../api/client'
import { ThemeModeProvider } from '../theme/ThemeModeProvider'
import { AuthProvider } from './AuthContext'

// A fake backend behind the real axios client (interceptors included): each
// "METHOD /path" maps to a status + body; every request is recorded.
type Reply = { status: number; data?: unknown }
let routes: Record<string, Reply> = {}
let requests: string[] = []
const realAdapter = apiClient.defaults.adapter

const fakeAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const key = `${config.method?.toUpperCase()} ${config.url}`
  requests.push(key)
  const reply = routes[key] ?? { status: 404, data: { message: 'Not Found' } }
  const response: AxiosResponse = { data: reply.data ?? {}, status: reply.status, statusText: '', headers: {}, config }
  if (reply.status >= 400) {
    throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response)
  }
  return response
}

const NOW = new Date().toISOString()
const USER = { id: 1, email: 'me@example.com', fullName: 'Me' }
const SETTINGS = {
  theme: 'DARK', timezone: 'UTC', visibleBoardStatuses: ['NEW'], minimumFitScore: 70, aiProvider: null, aiModel: null,
  anthropicApiKeyConfigured: false, geminiApiKeyConfigured: false,
}
const CARD = {
  applicationId: 1, jobId: 10, companyName: 'Acme', title: 'Alpha Role', location: null, workModel: null, fitScore: null,
  statusCode: 'NEW', starred: false, discoveredAt: NOW, createdAt: NOW,
}

function loggedInBackend() {
  routes = {
    'GET /api/auth/me': { status: 200, data: USER },
    'GET /api/board': { status: 200, data: [CARD] },
    'GET /api/settings': { status: 200, data: SETTINGS },
    'GET /api/stages/upcoming': { status: 200, data: [] },
  }
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeModeProvider>
          <MemoryRouter initialEntries={['/board']}>
            <App />
          </MemoryRouter>
        </ThemeModeProvider>
      </AuthProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

const loginScreen = () => screen.findByText('Sign in to manage your job search')

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})
beforeEach(() => {
  requests = []
  apiClient.defaults.adapter = fakeAdapter
})
afterEach(() => {
  apiClient.defaults.adapter = realAdapter
})

describe('expired session', () => {
  it('shows the login screen when a normal API request answers 401', async () => {
    loggedInBackend()
    routes['GET /api/board'] = { status: 401 }

    renderApp()

    expect(await loginScreen()).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Board' })).not.toBeInTheDocument()
  })

  it('stops showing (and drops) the cached data of the session that expired', async () => {
    loggedInBackend()
    const queryClient = renderApp()
    const card = await screen.findByText('Alpha Role')
    // The session expires on the server: the next request (opening the ticket) answers 401.
    routes['GET /api/applications/1'] = { status: 401 }
    await userEvent.click(card)

    expect(await loginScreen()).toBeInTheDocument()
    expect(screen.queryByText('Alpha Role')).not.toBeInTheDocument()
    expect(queryClient.getQueryData(['board'])).toBeUndefined()
    expect(queryClient.getQueryData(['settings'])).toBeUndefined()
  })
})

describe('failed login', () => {
  it('is reported as a wrong password and does not end any session or clear the cache', async () => {
    routes = {
      'GET /api/auth/me': { status: 401 },
      'GET /api/auth/csrf': { status: 200 },
      'POST /api/auth/login': { status: 401, data: { message: 'Invalid email or password' } },
    }
    const queryClient = renderApp()
    await loginScreen()
    queryClient.setQueryData(['sentinel'], 'kept')

    await userEvent.type(screen.getByLabelText(/Email/), 'me@example.com')
    await userEvent.type(screen.getByLabelText(/Password/), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument()
    expect(queryClient.getQueryData(['sentinel'])).toBe('kept')
  })
})

describe('explicit logout', () => {
  it("clears the user's cached data and shows the login screen", async () => {
    loggedInBackend()
    routes['POST /api/auth/logout'] = { status: 204 }
    const queryClient = renderApp()
    await screen.findByText('Alpha Role')
    expect(queryClient.getQueryData(['board'])).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await loginScreen()).toBeInTheDocument()
    expect(queryClient.getQueryData(['board'])).toBeUndefined()
    expect(queryClient.getQueryData(['settings'])).toBeUndefined()
    // Nothing user-specific is left cached, and nothing is fetched again after logging out.
    expect(queryClient.getQueryCache().getAll().filter((query) => query.state.data !== undefined)).toEqual([])
    expect(requests.at(-1)).toBe('POST /api/auth/logout')
  })
})

describe('logging in', () => {
  it('starts the new session with an empty cache', async () => {
    routes = {
      'GET /api/auth/me': { status: 401 },
      'GET /api/auth/csrf': { status: 200 },
      'POST /api/auth/login': { status: 200, data: USER },
      'GET /api/board': { status: 200, data: [CARD] },
      'GET /api/settings': { status: 200, data: SETTINGS },
      'GET /api/stages/upcoming': { status: 200, data: [] },
    }
    const queryClient = renderApp()
    await loginScreen()
    // Anything cached before this login (e.g. by a previous user of this tab).
    queryClient.setQueryData(['application', 99], { id: 99, jobTitle: 'Previous User Role' })

    await userEvent.type(screen.getByLabelText(/Email/), 'me@example.com')
    await userEvent.type(screen.getByLabelText(/Password/), 'right')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Alpha Role')).toBeInTheDocument()
    expect(queryClient.getQueryData(['application', 99])).toBeUndefined()
  })
})

describe('settings while logged out', () => {
  it('are never requested on the login screen, and are loaded after logging in', async () => {
    routes = {
      'GET /api/auth/me': { status: 401 },
      'GET /api/auth/csrf': { status: 200 },
      'POST /api/auth/login': { status: 200, data: USER },
      'GET /api/board': { status: 200, data: [CARD] },
      'GET /api/settings': { status: 200, data: SETTINGS },
      'GET /api/stages/upcoming': { status: 200, data: [] },
    }
    renderApp()
    await loginScreen()
    expect(requests).not.toContain('GET /api/settings')

    await userEvent.type(screen.getByLabelText(/Email/), 'me@example.com')
    await userEvent.type(screen.getByLabelText(/Password/), 'right')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Alpha Role')).toBeInTheDocument()
    await waitFor(() => expect(requests).toContain('GET /api/settings'))
  })
})
