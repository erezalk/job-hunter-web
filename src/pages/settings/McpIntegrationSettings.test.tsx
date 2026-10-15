import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api/integrations'
import { McpIntegrationSettings } from './McpIntegrationSettings'

const RAW = 'jh_RAW_TOKEN_VALUE_SHOWN_ONCE_0123456789abcdef'
const NOT_CONFIGURED = { configured: false, createdAt: null, suffix: null }
const CONFIGURED = { configured: true, createdAt: '2026-10-06T10:00:00Z', suffix: 'cdef' }

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <McpIntegrationSettings />
    </QueryClientProvider>,
  )
  return { ...view, client }
}

describe('McpIntegrationSettings', () => {
  beforeEach(() => {
    vi.spyOn(api, 'fetchMcpTokenStatus').mockResolvedValue(NOT_CONFIGURED)
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the intro text and Generate token when not configured', async () => {
    renderSettings()
    expect(screen.getByText('Connect Claude Desktop to Job Hunter and allow Claude to add jobs to your Board.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Generate token' })).toBeInTheDocument()
    expect(screen.getByText('Status: Not configured')).toBeInTheDocument()
  })

  it('shows the raw token once right after generation, then only safe state after remount', async () => {
    vi.spyOn(api, 'generateMcpToken').mockResolvedValue({ token: RAW, createdAt: CONFIGURED.createdAt, suffix: 'cdef' })
    const first = renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: 'Generate token' }))

    expect(await screen.findByText('Copy this token now. It will not be shown again.')).toBeInTheDocument()
    expect(screen.getByTestId('mcp-token')).toHaveTextContent(RAW)
    expect(screen.getByText('Status: Configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revoke token' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate new token' })).toBeInTheDocument()
    // The raw token is never written to the shared query cache.
    expect(JSON.stringify(first.client.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(RAW)

    // Reload / navigating away and back: component remounts, the server no longer has the secret.
    first.unmount()
    vi.spyOn(api, 'fetchMcpTokenStatus').mockResolvedValue(CONFIGURED)
    renderSettings()
    expect(await screen.findByText('Status: Configured')).toBeInTheDocument()
    expect(screen.getByText(/ends with …cdef/)).toBeInTheDocument()
    expect(screen.queryByText(RAW)).not.toBeInTheDocument()
    expect(screen.queryByText('Copy this token now. It will not be shown again.')).not.toBeInTheDocument()
  })

  it('copies the token to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.spyOn(api, 'generateMcpToken').mockResolvedValue({ token: RAW, createdAt: CONFIGURED.createdAt, suffix: 'cdef' })
    renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: 'Generate token' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(RAW)
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('revoking returns to not configured and hides the token', async () => {
    vi.spyOn(api, 'fetchMcpTokenStatus').mockResolvedValue(CONFIGURED)
    const revoke = vi.spyOn(api, 'revokeMcpToken').mockResolvedValue()
    renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke token' }))
    await waitFor(() => expect(revoke).toHaveBeenCalled())
    expect(await screen.findByText('Status: Not configured')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate token' })).toBeInTheDocument()
  })

  it('generating a replacement shows the new token and the new suffix', async () => {
    vi.spyOn(api, 'fetchMcpTokenStatus').mockResolvedValue(CONFIGURED)
    vi.spyOn(api, 'generateMcpToken').mockResolvedValue({ token: 'jh_NEW_TOKEN_wxyz', createdAt: '2026-10-07T10:00:00Z', suffix: 'wxyz' })
    renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: 'Generate new token' }))
    expect(await screen.findByTestId('mcp-token')).toHaveTextContent('jh_NEW_TOKEN_wxyz')
    expect(screen.getByText(/ends with …wxyz/)).toBeInTheDocument()
  })

  it('shows a safe error when generation fails and no token', async () => {
    vi.spyOn(api, 'generateMcpToken').mockRejectedValue(new Error('boom'))
    renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: 'Generate token' }))
    expect(await screen.findByText('Could not generate the token.')).toBeInTheDocument()
    expect(screen.queryByTestId('mcp-token')).not.toBeInTheDocument()
  })

  it('shows a safe error when revocation fails and keeps the configured state', async () => {
    vi.spyOn(api, 'fetchMcpTokenStatus').mockResolvedValue(CONFIGURED)
    vi.spyOn(api, 'revokeMcpToken').mockRejectedValue(new Error('boom'))
    renderSettings()
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke token' }))
    expect(await screen.findByText('Could not revoke the token.')).toBeInTheDocument()
    expect(screen.getByText('Status: Configured')).toBeInTheDocument()
  })
})
