import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api/searchPrompt'
import type { SearchPrompt } from '../../api/searchPrompt'
import { backend, installFakeBackend, loggedInBackend, renderApp, type Reply } from '../../test/fakeBackend'
import { SearchPromptSettings } from './SearchPromptSettings'

/** Free-form text with everything that must survive unchanged. */
const RICH_PROMPT = [
  '# Job search — Berlin 🚀',
  '',
  'Find **senior backend** roles that match my CV.',
  '',
  '1. Skip companies from get_excluded_companies.',
  '2. Remote *or* hybrid; salary ≥ 85.000 €.',
  '   - Nested bullet with\ttab and  double  spaces',
  '',
  '> "Quotes", \'apostrophes\', backslash \\ and {braces} [brackets] <b>not HTML</b> &amp;',
  'Unicode: Ünïcödé · עברית · 日本語 · 👩‍💻',
  'Trailing space ',
  '',
].join('\n')

const SAVED_AT = '2026-11-23T13:49:14Z'

function apiError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  const response: AxiosResponse = { status, data, statusText: '', headers: {}, config }
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response)
}

/** Stateful stand-in for the backend: stores exactly what is sent; blank clears. */
function fakeServer(initial: SearchPrompt) {
  let current = { ...initial }
  const fetch = vi.spyOn(api, 'fetchSearchPrompt').mockImplementation(async () => ({ ...current }))
  const save = vi.spyOn(api, 'saveSearchPrompt').mockImplementation(async (prompt) => {
    current = prompt.trim() === '' ? { prompt: '', updatedAt: null } : { prompt, updatedAt: '2026-11-24T09:00:00Z' }
    return { ...current }
  })
  const remove = vi.spyOn(api, 'deleteSearchPrompt').mockImplementation(async () => {
    current = { prompt: '', updatedAt: null }
  })
  return { fetch, save, remove, current: () => current }
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SearchPromptSettings />
    </QueryClientProvider>,
  )
  return client
}

const editor = () => screen.getByRole('textbox', { name: 'Search prompt' }) as HTMLTextAreaElement
const saveButton = () => screen.getByRole('button', { name: 'Save' })
const discardButton = () => screen.getByRole('button', { name: 'Discard changes' })
const deleteButton = () => screen.getByRole('button', { name: 'Delete prompt' })
// fireEvent sets the exact value (userEvent.type would interpret { [ and similar).
const setText = (value: string) => fireEvent.change(editor(), { target: { value } })

describe('SearchPromptSettings', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads the saved prompt into the editor exactly as stored', async () => {
    fakeServer({ prompt: RICH_PROMPT, updatedAt: SAVED_AT })
    renderTab()

    expect(await screen.findByRole('textbox', { name: 'Search prompt' })).toHaveValue(RICH_PROMPT)
    expect(screen.getByText('Search Prompt')).toBeInTheDocument()
    expect(screen.getByText(/^Last saved /)).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(discardButton()).toBeDisabled()
    expect(deleteButton()).toBeEnabled()
    expect(screen.getByTestId('search-prompt-length')).toHaveTextContent(`${RICH_PROMPT.length.toLocaleString()} / 100,000 characters`)
  })

  it('starts empty, without a template, when no prompt is saved', async () => {
    fakeServer({ prompt: '', updatedAt: null })
    renderTab()

    expect(await screen.findByRole('textbox', { name: 'Search prompt' })).toHaveValue('')
    expect(screen.getByText('No search prompt saved yet.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
    expect(deleteButton()).toBeDisabled()
  })

  it('creates a new prompt, sending the exact multiline text with special characters', async () => {
    const server = fakeServer({ prompt: '', updatedAt: null })
    renderTab()
    await screen.findByRole('textbox', { name: 'Search prompt' })

    setText(RICH_PROMPT)
    expect(saveButton()).toBeEnabled()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await userEvent.click(saveButton())

    expect(await screen.findByText('Search prompt saved.')).toBeInTheDocument()
    expect(server.save).toHaveBeenCalledExactlyOnceWith(RICH_PROMPT)
    expect(server.current().prompt).toBe(RICH_PROMPT)
    expect(editor()).toHaveValue(RICH_PROMPT)
    expect(saveButton()).toBeDisabled()
    expect(deleteButton()).toBeEnabled()
    expect(screen.getByText(/^Last saved /)).toBeInTheDocument()
  })

  it('edits and saves changes to an existing prompt', async () => {
    const server = fakeServer({ prompt: 'Old instructions', updatedAt: SAVED_AT })
    renderTab()
    await screen.findByRole('textbox', { name: 'Search prompt' })

    await userEvent.click(editor())
    await userEvent.keyboard('{End}{Enter}{Enter}- Also consider Hamburg.')
    expect(editor()).toHaveValue('Old instructions\n\n- Also consider Hamburg.')
    await userEvent.click(saveButton())

    expect(await screen.findByText('Search prompt saved.')).toBeInTheDocument()
    expect(server.save).toHaveBeenCalledExactlyOnceWith('Old instructions\n\n- Also consider Hamburg.')
  })

  it('tracks unsaved changes: Save is enabled only while the text differs from the saved one', async () => {
    fakeServer({ prompt: 'Saved', updatedAt: SAVED_AT })
    renderTab()
    await screen.findByRole('textbox', { name: 'Search prompt' })

    setText('Saved!')
    expect(saveButton()).toBeEnabled()
    setText('Saved')
    expect(saveButton()).toBeDisabled()
    // Whitespace is significant: nothing is trimmed.
    setText('Saved ')
    expect(saveButton()).toBeEnabled()

    await userEvent.click(discardButton())
    expect(editor()).toHaveValue('Saved')
    expect(saveButton()).toBeDisabled()
  })

  it('clears the prompt by saving an empty text', async () => {
    const server = fakeServer({ prompt: 'To be removed', updatedAt: SAVED_AT })
    renderTab()
    await screen.findByRole('textbox', { name: 'Search prompt' })

    await userEvent.clear(editor())
    await userEvent.click(saveButton())

    expect(await screen.findByText('Search prompt cleared.')).toBeInTheDocument()
    expect(server.save).toHaveBeenCalledExactlyOnceWith('')
    expect(editor()).toHaveValue('')
    expect(deleteButton()).toBeDisabled()
    expect(screen.getByText('No search prompt saved yet.')).toBeInTheDocument()
  })

  it('deletes the prompt after confirmation', async () => {
    const server = fakeServer({ prompt: 'To be deleted', updatedAt: SAVED_AT })
    renderTab()
    await screen.findByRole('textbox', { name: 'Search prompt' })

    await userEvent.click(deleteButton())
    const dialog = screen.getByRole('dialog', { name: 'Delete search prompt?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.remove).not.toHaveBeenCalled()

    await userEvent.click(deleteButton())
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Search prompt deleted.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(server.remove).toHaveBeenCalledTimes(1)
    expect(editor()).toHaveValue('')
    expect(deleteButton()).toBeDisabled()
  })

  it('shows a load error with Retry and no editor, so nothing can be overwritten blindly', async () => {
    const fetch = vi.spyOn(api, 'fetchSearchPrompt').mockRejectedValueOnce(apiError(500, {}))
    renderTab()

    expect(await screen.findByText('Could not load your search prompt.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Search prompt' })).not.toBeInTheDocument()

    fetch.mockResolvedValueOnce({ prompt: 'Recovered', updatedAt: SAVED_AT })
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('textbox', { name: 'Search prompt' })).toHaveValue('Recovered')
  })

  it('shows a save error, keeps the text and lets the user retry', async () => {
    const server = fakeServer({ prompt: '', updatedAt: null })
    server.save.mockRejectedValueOnce(apiError(500, { message: 'internal details' }))
    renderTab()
    await screen.findByRole('textbox', { name: 'Search prompt' })

    setText('My instructions')
    await userEvent.click(saveButton())

    expect(await screen.findByText('Could not save the search prompt. Try again.')).toBeInTheDocument()
    expect(screen.queryByText('internal details')).not.toBeInTheDocument()
    expect(editor()).toHaveValue('My instructions')
    expect(saveButton()).toBeEnabled()

    await userEvent.click(saveButton())
    expect(await screen.findByText('Search prompt saved.')).toBeInTheDocument()
    expect(screen.queryByText('Could not save the search prompt. Try again.')).not.toBeInTheDocument()
  })

  it("shows the server's validation message for the prompt", async () => {
    const server = fakeServer({ prompt: '', updatedAt: null })
    server.save.mockRejectedValueOnce(
      apiError(400, { message: 'Validation failed', fieldErrors: [{ field: 'prompt', message: 'Prompt must be at most 100,000 characters' }] }),
    )
    renderTab()
    await screen.findByRole('textbox', { name: 'Search prompt' })

    setText('x')
    await userEvent.click(saveButton())
    expect(await screen.findByText('Prompt must be at most 100,000 characters')).toBeInTheDocument()
  })

  it('limits the editor to the server maximum', async () => {
    fakeServer({ prompt: '', updatedAt: null })
    renderTab()
    expect(await screen.findByRole('textbox', { name: 'Search prompt' })).toHaveAttribute('maxlength', '100000')
  })

  it('arms the browser leave-page prompt only while there are unsaved changes', async () => {
    fakeServer({ prompt: 'Saved', updatedAt: SAVED_AT })
    renderTab()
    await screen.findByRole('textbox', { name: 'Search prompt' })

    const unload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(unload()).toBe(false)
    setText('Changed')
    expect(unload()).toBe(true)
    await userEvent.click(saveButton())
    await screen.findByText('Search prompt saved.')
    expect(unload()).toBe(false)
  })
})

describe('Job Search tab in the app', () => {
  installFakeBackend()

  function promptBackend(initial = 'Saved instructions') {
    loggedInBackend()
    let stored = initial
    let companies = [{ id: 1, name: 'Flix' }]
    backend.routes['GET /api/settings/search-prompt'] = () => ({ status: 200, data: { prompt: stored, updatedAt: stored ? SAVED_AT : null } })
    backend.routes['PUT /api/settings/search-prompt'] = (body): Reply => {
      stored = (body as { prompt: string }).prompt
      return { status: 200, data: { prompt: stored, updatedAt: '2026-11-24T09:00:00Z' } }
    }
    backend.routes['DELETE /api/settings/search-prompt'] = (): Reply => {
      stored = ''
      return { status: 204 }
    }
    backend.routes['GET /api/settings/excluded-companies'] = () => ({ status: 200, data: companies })
    backend.routes['POST /api/settings/excluded-companies'] = (body): Reply => {
      const created = { id: 9, name: (body as { name: string }).name }
      companies = [...companies, created]
      return { status: 201, data: created }
    }
    backend.routes['DELETE /api/settings/excluded-companies/1'] = (): Reply => {
      companies = companies.filter((c) => c.id !== 1)
      return { status: 204 }
    }
    backend.routes['POST /api/auth/logout'] = { status: 204 }
  }

  async function openJobSearch() {
    await userEvent.click(await screen.findByRole('tab', { name: 'Job Search' }))
    return screen.findByRole('textbox', { name: 'Search prompt' })
  }

  const section = (name: string) => screen.getByRole('region', { name })

  async function dialogClosed() {
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  }

  it('replaces Job Discovery and Search Prompt with one Job Search tab; the other tabs are unchanged', async () => {
    promptBackend()
    renderApp('/settings')

    await screen.findByRole('tab', { name: 'Job Search' })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Appearance', 'Board', 'AI Matching', 'Job Search', 'Claude / MCP', 'Data', 'Account',
    ])
    expect(screen.queryByRole('tab', { name: 'Job Discovery' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Search Prompt' })).not.toBeInTheDocument()
  })

  it('shows Search Prompt above Excluded Companies as two separate sections', async () => {
    promptBackend()
    renderApp('/settings')
    expect(await openJobSearch()).toHaveValue('Saved instructions')

    const prompt = section('Search Prompt')
    const excluded = section('Excluded Companies')
    expect(prompt.compareDocumentPosition(excluded) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(prompt).not.toContainElement(excluded)

    // Each section holds only its own controls.
    expect(within(prompt).getByRole('textbox', { name: 'Search prompt' })).toBeInTheDocument()
    for (const name of ['Save', 'Discard changes', 'Delete prompt']) {
      expect(within(prompt).getByRole('button', { name })).toBeInTheDocument()
    }
    expect(within(prompt).getByTestId('search-prompt-length')).toBeInTheDocument()
    expect(within(prompt).queryByRole('textbox', { name: 'Company name' })).not.toBeInTheDocument()
    expect(within(excluded).getByRole('textbox', { name: 'Company name' })).toBeInTheDocument()
    expect(await within(excluded).findByText('Flix')).toBeInTheDocument()
    expect(within(excluded).queryByRole('textbox', { name: 'Search prompt' })).not.toBeInTheDocument()
  })

  it('saves the prompt through the real API client with the exact text', async () => {
    promptBackend('')
    renderApp('/settings')
    await openJobSearch()

    fireEvent.change(editor(), { target: { value: 'Line 1\n\nLine 3 — ✓' } })
    await userEvent.click(saveButton())

    expect(await within(section('Search Prompt')).findByText('Search prompt saved.')).toBeInTheDocument()
    expect(backend.calls('PUT /api/settings/search-prompt')[0]!.body).toEqual({ prompt: 'Line 1\n\nLine 3 — ✓' })
  })

  it('deletes the prompt through the real API client after confirmation', async () => {
    promptBackend()
    renderApp('/settings')
    await openJobSearch()

    await userEvent.click(deleteButton())
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete search prompt?' })).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('Search prompt deleted.')).toBeInTheDocument()
    await dialogClosed()
    expect(backend.calls('DELETE /api/settings/search-prompt')).toHaveLength(1)
    expect(editor()).toHaveValue('')
    // The Excluded Companies section is untouched.
    expect(within(section('Excluded Companies')).getByText('Flix')).toBeInTheDocument()
  })

  it('manages excluded companies on the same tab without disturbing an unsaved prompt', async () => {
    promptBackend()
    renderApp('/settings')
    await openJobSearch()
    fireEvent.change(editor(), { target: { value: 'Unsaved edit' } })

    const excluded = section('Excluded Companies')
    await userEvent.type(within(excluded).getByRole('textbox', { name: 'Company name' }), 'PPRO{Enter}')
    expect(await within(excluded).findByText('PPRO')).toBeInTheDocument()
    await userEvent.click(within(excluded).getByRole('button', { name: 'Remove Flix' }))
    await waitFor(() => expect(within(excluded).queryByText('Flix')).not.toBeInTheDocument())

    expect(backend.calls('POST /api/settings/excluded-companies')[0]!.body).toEqual({ name: 'PPRO' })
    expect(backend.calls('DELETE /api/settings/excluded-companies/1')).toHaveLength(1)
    // Working in the other section is not "leaving": no prompt, and the draft is kept.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(editor()).toHaveValue('Unsaved edit')
    expect(saveButton()).toBeEnabled()
    expect(backend.calls('PUT /api/settings/search-prompt')).toHaveLength(0)
  })

  it('switches tabs freely when nothing is unsaved', async () => {
    promptBackend()
    renderApp('/settings')
    await openJobSearch()

    await userEvent.click(screen.getByRole('tab', { name: 'Account' }))
    expect(await screen.findByText('Signed in as me@example.com')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before leaving the Job Search tab for another Settings tab with unsaved changes', async () => {
    promptBackend()
    renderApp('/settings')
    await openJobSearch()
    fireEvent.change(editor(), { target: { value: 'Unsaved edit' } })

    await userEvent.click(screen.getByRole('tab', { name: 'Account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await dialogClosed()
    expect(editor()).toHaveValue('Unsaved edit')
    expect(screen.getByRole('tab', { name: 'Job Search' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('tab', { name: 'Account' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByText('Signed in as me@example.com')).toBeInTheDocument()
    expect(backend.calls('PUT /api/settings/search-prompt')).toHaveLength(0)

    // Coming back shows the saved text, not the discarded edit.
    expect(await openJobSearch()).toHaveValue('Saved instructions')
  })

  it('asks before leaving Settings through the main navigation with unsaved changes', async () => {
    promptBackend()
    renderApp('/settings')
    await openJobSearch()
    fireEvent.change(editor(), { target: { value: 'Unsaved edit' } })

    await userEvent.click(screen.getByRole('button', { name: 'Board' }))
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    await dialogClosed()
    expect(editor()).toHaveValue('Unsaved edit')

    await userEvent.click(screen.getByRole('button', { name: 'Board' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search prompt' })).not.toBeInTheDocument())
    expect(screen.queryByRole('tab', { name: 'Job Search' })).not.toBeInTheDocument()
  })

  it('asks before logging out with unsaved changes', async () => {
    promptBackend()
    renderApp('/settings')
    await openJobSearch()
    fireEvent.change(editor(), { target: { value: 'Unsaved edit' } })

    await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).toBeInTheDocument()
    expect(backend.calls('POST /api/auth/logout')).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(backend.calls('POST /api/auth/logout')).toHaveLength(1))
  })

  it('leaves without asking once the changes are saved', async () => {
    promptBackend()
    renderApp('/settings')
    await openJobSearch()
    fireEvent.change(editor(), { target: { value: 'Saved now' } })
    await userEvent.click(saveButton())
    await screen.findByText('Search prompt saved.')

    await userEvent.click(screen.getByRole('button', { name: 'Board' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Search prompt' })).not.toBeInTheDocument())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
