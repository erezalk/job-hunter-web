import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api/integrations'
import type { IntegrationToken } from '../../api/integrations'
import { McpIntegrationSettings } from './McpIntegrationSettings'

const CLAUDE: IntegrationToken = { id: 1, name: 'Claude Desktop', createdAt: '2026-10-06T10:00:00Z', regeneratedAt: null, suffix: 'cdef' }
const UNNAMED: IntegrationToken = { id: 2, name: null, createdAt: '2026-10-07T10:00:00Z', regeneratedAt: null, suffix: 'wxyz' }
const REMINDER = /Copy it now and save it in your client's settings\. It will not be shown again\./

function apiError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  const response: AxiosResponse = { status, data, statusText: '', headers: {}, config }
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response)
}

/**
 * Stateful stand-in for the backend: list, create, rename, regenerate and revoke
 * act on one in-memory list (never containing a secret), like the real API.
 */
function fakeServer(initial: IntegrationToken[]) {
  let tokens = [...initial]
  let nextId = 100
  let secretSeq = 0
  const secret = () => `jh_FAKE_SECRET_${++secretSeq}_abcd`
  vi.spyOn(api, 'fetchIntegrationTokens').mockImplementation(async () => tokens.map((t) => ({ ...t })))
  const create = vi.spyOn(api, 'createIntegrationToken').mockImplementation(async (name) => {
    const token = secret()
    const created = { id: nextId++, name: name?.trim() || null, createdAt: '2026-10-09T10:00:00Z', regeneratedAt: null, suffix: token.slice(-4) }
    tokens = [...tokens, created]
    return { ...created, token }
  })
  const rename = vi.spyOn(api, 'renameIntegrationToken').mockImplementation(async (id, name) => {
    tokens = tokens.map((t) => (t.id === id ? { ...t, name: name?.trim() || null } : t))
    return { ...tokens.find((t) => t.id === id)! }
  })
  const regenerate = vi.spyOn(api, 'regenerateIntegrationToken').mockImplementation(async (id) => {
    const token = `jh_NEW_SECRET_${++secretSeq}_NEW${secretSeq}`
    tokens = tokens.map((t) => (t.id === id ? { ...t, suffix: token.slice(-4), regeneratedAt: '2026-10-10T10:00:00Z' } : t))
    return { ...tokens.find((t) => t.id === id)!, token }
  })
  const revoke = vi.spyOn(api, 'revokeIntegrationToken').mockImplementation(async (id) => {
    tokens = tokens.filter((t) => t.id !== id)
  })
  return { create, rename, regenerate, revoke }
}

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <McpIntegrationSettings />
    </QueryClientProvider>,
  )
  return { ...view, client }
}

function row(id: number) {
  return within(screen.getByTestId(`token-${id}`))
}

async function findRow(id: number) {
  return within(await screen.findByTestId(`token-${id}`))
}

function cachedData(client: QueryClient): string {
  return JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data))
}

describe('McpIntegrationSettings', () => {
  beforeEach(() => {
    fakeServer([])
  })
  afterEach(() => vi.restoreAllMocks())

  it('explains independent tokens for clients such as Claude and Codex and shows the empty state', async () => {
    renderSettings()
    expect(screen.getByText(/such as Claude Desktop or Codex/)).toBeInTheDocument()
    expect(screen.getByText(/Every token works on its own: renaming, regenerating or revoking one never affects the others/)).toBeInTheDocument()
    expect(screen.getByText(/Tokens do not expire/)).toBeInTheDocument()
    expect(await screen.findByText(/No active tokens/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate token' })).toBeInTheDocument()
    expect(screen.getByLabelText('Name (optional)')).toBeInTheDocument()
  })

  it('lists every active token with its name, creation date and masked suffix, and "Unnamed token" for no name', async () => {
    fakeServer([CLAUDE, { ...UNNAMED, regeneratedAt: '2026-10-08T10:00:00Z' }])
    renderSettings()

    expect(await (await findRow(1)).findByText('Claude Desktop')).toBeInTheDocument()
    expect(row(1).getByText(/ends with …cdef/)).toBeInTheDocument()
    expect(row(1).getByText(new RegExp(`Created ${new Date(CLAUDE.createdAt).toLocaleString()}`))).toBeInTheDocument()
    expect(row(2).getByText('Unnamed token')).toBeInTheDocument()
    expect(row(2).getByText(/ends with …wxyz · regenerated/)).toBeInTheDocument()
    for (const id of [1, 2]) {
      for (const action of ['Rename', 'Regenerate', 'Revoke']) {
        expect(row(id).getByRole('button', { name: new RegExp(`^${action}`) })).toBeInTheDocument()
      }
    }
    expect(screen.queryByTestId('mcp-token')).not.toBeInTheDocument()
  })

  it('creates a named token next to the existing ones and shows its secret only right after creation', async () => {
    const { create } = fakeServer([CLAUDE])
    const first = renderSettings()
    await findRow(1)

    await userEvent.type(screen.getByLabelText('Name (optional)'), '  Codex ')
    await userEvent.click(screen.getByRole('button', { name: 'Generate token' }))

    expect(create).toHaveBeenCalledWith('  Codex ')
    const secret = (await create.mock.results[0].value).token
    expect(await screen.findByText(REMINDER)).toBeInTheDocument()
    expect(screen.getByText(/Token created: “Codex”/)).toBeInTheDocument()
    expect(screen.getByTestId('mcp-token')).toHaveTextContent(secret)
    expect(await (await findRow(100)).findByText('Codex')).toBeInTheDocument()
    expect(row(1).getByText('Claude Desktop')).toBeInTheDocument()
    expect(screen.getByLabelText('Name (optional)')).toHaveValue('')
    // The raw token is never written to the shared query cache.
    await waitFor(() => expect(first.client.isFetching()).toBe(0))
    expect(cachedData(first.client)).not.toContain(secret)

    // Reload / navigating away and back: the server no longer has the secret.
    first.unmount()
    renderSettings()
    expect(await (await findRow(100)).findByText('Codex')).toBeInTheDocument()
    expect(row(1).getByText('Claude Desktop')).toBeInTheDocument()
    expect(screen.queryByText(secret)).not.toBeInTheDocument()
    expect(screen.queryByText(REMINDER)).not.toBeInTheDocument()
  })

  it('creates an unnamed token when no name is entered, and the secret can be copied and dismissed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { create } = fakeServer([])
    renderSettings()
    await screen.findByText(/No active tokens/)

    await userEvent.click(screen.getByRole('button', { name: 'Generate token' }))

    expect(create).toHaveBeenCalledWith('')
    const secret = (await create.mock.results[0].value).token
    expect(await screen.findByText(/Token created: “Unnamed token”/)).toBeInTheDocument()
    expect(await (await findRow(100)).findByText('Unnamed token')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(secret)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByTestId('mcp-token')).not.toBeInTheDocument()
  })

  it('renames a token and can clear its name back to "Unnamed token"', async () => {
    const { rename } = fakeServer([CLAUDE, UNNAMED])
    renderSettings()
    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Rename Claude Desktop' }))

    const dialog = within(screen.getByRole('dialog', { name: 'Rename token' }))
    const input = dialog.getByLabelText('Name')
    expect(input).toHaveValue('Claude Desktop')
    await userEvent.clear(input)
    await userEvent.type(input, 'Laptop Claude')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(rename).toHaveBeenCalledWith(1, 'Laptop Claude')
    expect(await (await findRow(1)).findByText('Laptop Claude')).toBeInTheDocument()

    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Rename Laptop Claude' }))
    const second = within(screen.getByRole('dialog', { name: 'Rename token' }))
    await userEvent.clear(second.getByLabelText('Name'))
    await userEvent.click(second.getByRole('button', { name: 'Save' }))

    expect(rename).toHaveBeenLastCalledWith(1, '')
    expect(await (await findRow(1)).findByText('Unnamed token')).toBeInTheDocument()
    expect(row(2).getByText('Unnamed token')).toBeInTheDocument()
  })

  it('keeps the rename dialog open with the server error when renaming fails', async () => {
    fakeServer([CLAUDE])
    vi.spyOn(api, 'renameIntegrationToken').mockRejectedValue(
      apiError(400, { message: 'Validation failed', fieldErrors: [{ field: 'name', message: 'Name must be at most 100 characters' }] }),
    )
    renderSettings()
    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Rename Claude Desktop' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Rename token' }))
    await userEvent.type(dialog.getByLabelText('Name'), ' 2')
    await userEvent.click(dialog.getByRole('button', { name: 'Save' }))

    expect(await dialog.findByText('Name must be at most 100 characters')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Rename token' })).toBeInTheDocument()
  })

  it('asks for confirmation before revoking, then removes only that token', async () => {
    const { revoke } = fakeServer([CLAUDE, UNNAMED])
    renderSettings()

    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Revoke Claude Desktop' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Revoke “Claude Desktop”?' }))
    expect(dialog.getByText(/Any client using it \(ending with …cdef\) loses access to Job Hunter immediately/)).toBeInTheDocument()
    expect(dialog.getByText(/Your other tokens keep working/)).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(revoke).not.toHaveBeenCalled()

    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Revoke Claude Desktop' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke token' }))

    expect(revoke).toHaveBeenCalledWith(1)
    await waitFor(() => expect(screen.queryByTestId('token-1')).not.toBeInTheDocument())
    expect(await (await findRow(2)).findByText('Unnamed token')).toBeInTheDocument()
  })

  it('asks for confirmation before regenerating, then shows the new secret for the same token', async () => {
    const { regenerate } = fakeServer([CLAUDE, UNNAMED])
    const view = renderSettings()

    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Regenerate Claude Desktop' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Regenerate “Claude Desktop”?' }))
    expect(dialog.getByText(/The current secret \(ending with …cdef\) stops working immediately, so any client using it loses access/)).toBeInTheDocument()
    expect(regenerate).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('button', { name: 'Regenerate token' }))

    expect(regenerate).toHaveBeenCalledWith(1)
    const { token: secret, suffix } = await regenerate.mock.results[0].value
    expect(await screen.findByText(/New secret for “Claude Desktop”/)).toBeInTheDocument()
    expect(screen.getByTestId('mcp-token')).toHaveTextContent(secret)
    expect(await (await findRow(1)).findByText(new RegExp(`ends with …${suffix} · regenerated`))).toBeInTheDocument()
    expect(row(1).getByText('Claude Desktop')).toBeInTheDocument()
    expect(row(2).getByText(/ends with …wxyz/)).toBeInTheDocument()
    await waitFor(() => expect(view.client.isFetching()).toBe(0))
    expect(cachedData(view.client)).not.toContain(secret)
  })

  it('hides a displayed secret when its token is revoked', async () => {
    fakeServer([CLAUDE])
    renderSettings()
    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Regenerate Claude Desktop' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Regenerate token' }))
    expect(await screen.findByTestId('mcp-token')).toBeInTheDocument()

    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Revoke Claude Desktop' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke token' }))

    await waitFor(() => expect(screen.queryByTestId('mcp-token')).not.toBeInTheDocument())
    expect(await screen.findByText(/No active tokens/)).toBeInTheDocument()
  })

  it('shows a safe error and no secret when creating fails', async () => {
    vi.spyOn(api, 'createIntegrationToken').mockRejectedValue(new Error('boom'))
    renderSettings()
    await screen.findByText(/No active tokens/)
    await userEvent.click(screen.getByRole('button', { name: 'Generate token' }))
    expect(await screen.findByText('Could not create the token.')).toBeInTheDocument()
    expect(screen.queryByTestId('mcp-token')).not.toBeInTheDocument()
  })

  it('shows the error and keeps the token when revoking or regenerating fails', async () => {
    fakeServer([CLAUDE])
    vi.spyOn(api, 'revokeIntegrationToken').mockRejectedValue(apiError(404, { message: 'Integration token with id 1 not found' }))
    vi.spyOn(api, 'regenerateIntegrationToken').mockRejectedValue(new Error('boom'))
    renderSettings()

    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Revoke Claude Desktop' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke token' }))
    expect(await screen.findByText('Integration token with id 1 not found')).toBeInTheDocument()
    expect(await (await findRow(1)).findByText('Claude Desktop')).toBeInTheDocument()

    await userEvent.click(await (await findRow(1)).findByRole('button', { name: 'Regenerate Claude Desktop' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Regenerate token' }))
    expect(await screen.findByText('Could not regenerate the token.')).toBeInTheDocument()
    expect(row(1).getByText(/ends with …cdef/)).toBeInTheDocument()
    expect(screen.queryByTestId('mcp-token')).not.toBeInTheDocument()
  })

  it('shows an error when the token list cannot be loaded', async () => {
    vi.spyOn(api, 'fetchIntegrationTokens').mockRejectedValue(new Error('boom'))
    renderSettings()
    expect(await screen.findByText('Could not load your integration tokens.')).toBeInTheDocument()
  })
})
