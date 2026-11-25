import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api/excludedCompanies'
import type { ExcludedCompany } from '../../api/excludedCompanies'
import { backend, installFakeBackend, loggedInBackend, renderApp } from '../../test/fakeBackend'
import { ExcludedCompaniesSettings } from './ExcludedCompaniesSettings'

const FLIX: ExcludedCompany = { id: 1, name: 'Flix' }
const PPRO: ExcludedCompany = { id: 2, name: 'PPRO' }

function apiError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  const response: AxiosResponse = { status, data, statusText: '', headers: {}, config }
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response)
}

/** Stateful stand-in for the backend list, with the same normalization and case-insensitive uniqueness. */
function fakeServer(initial: ExcludedCompany[]) {
  let companies = [...initial]
  let nextId = 100
  const sorted = () => [...companies].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  const fetch = vi.spyOn(api, 'fetchExcludedCompanies').mockImplementation(async () => sorted().map((c) => ({ ...c })))
  const add = vi.spyOn(api, 'addExcludedCompany').mockImplementation(async (name) => {
    const created = { id: nextId++, name: name.trim() }
    companies = [...companies, created]
    return { ...created }
  })
  const rename = vi.spyOn(api, 'renameExcludedCompany').mockImplementation(async (id, name) => {
    companies = companies.map((c) => (c.id === id ? { ...c, name: name.trim() } : c))
    return { ...companies.find((c) => c.id === id)! }
  })
  const remove = vi.spyOn(api, 'removeExcludedCompany').mockImplementation(async (id) => {
    companies = companies.filter((c) => c.id !== id)
  })
  return { fetch, add, rename, remove }
}

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ExcludedCompaniesSettings />
    </QueryClientProvider>,
  )
  return client
}

const input = () => screen.getByRole('textbox', { name: 'Company name' })
const addButton = () => screen.getByRole('button', { name: 'Add' })
const listedNames = () =>
  within(screen.getByRole('list', { name: 'Excluded companies' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent)

describe('ExcludedCompaniesSettings', () => {
  beforeEach(() => {
    fakeServer([])
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the title, description, input and the empty state', async () => {
    renderSettings()
    expect(screen.getByText('Excluded Companies')).toBeInTheDocument()
    expect(screen.getByText('Companies to skip during AI job searches. This does not affect your board.')).toBeInTheDocument()
    expect(input()).toHaveAttribute('placeholder', 'Company name')
    expect(addButton()).toBeInTheDocument()
    expect(await screen.findByText('No excluded companies yet.')).toBeInTheDocument()
  })

  it('shows a loading state, then the companies loaded from the backend with edit and remove actions', async () => {
    let release!: () => void
    vi.spyOn(api, 'fetchExcludedCompanies').mockImplementation(
      () => new Promise((resolve) => (release = () => resolve([FLIX, PPRO]))),
    )
    renderSettings()
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    release()
    expect(await screen.findByText('Flix')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(listedNames()).toEqual(['Flix', 'PPRO'])
    for (const name of ['Flix', 'PPRO']) {
      expect(screen.getByRole('button', { name: `Edit ${name}` })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `Remove ${name}` })).toBeInTheDocument()
    }
  })

  it('shows an error with a retry when the list cannot be loaded', async () => {
    const fetch = vi.spyOn(api, 'fetchExcludedCompanies').mockRejectedValueOnce(apiError(500, {}))
    renderSettings()
    expect(await screen.findByText('Could not load your excluded companies.')).toBeInTheDocument()

    fetch.mockResolvedValueOnce([FLIX])
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Flix')).toBeInTheDocument()
  })

  it('adds a company with the Add button and keeps the list sorted', async () => {
    const { add } = fakeServer([PPRO])
    renderSettings()
    await screen.findByText('PPRO')

    await userEvent.type(input(), '  Example Company ')
    await userEvent.click(addButton())

    expect(add).toHaveBeenCalledWith('Example Company')
    await waitFor(() => expect(listedNames()).toEqual(['Example Company', 'PPRO']))
    expect(input()).toHaveValue('')
  })

  it('adds a company by pressing Enter', async () => {
    const { add } = fakeServer([])
    renderSettings()
    await screen.findByText('No excluded companies yet.')

    await userEvent.type(input(), 'Flix{Enter}')

    expect(add).toHaveBeenCalledWith('Flix')
    expect(await screen.findByText('Flix')).toBeInTheDocument()
    expect(screen.queryByText('No excluded companies yet.')).not.toBeInTheDocument()
  })

  it('keeps a name typed while the previous add is still in flight', async () => {
    const { add } = fakeServer([])
    let release!: () => void
    add.mockImplementationOnce((name) => new Promise((resolve) => (release = () => resolve({ id: 7, name }))))
    renderSettings()
    await screen.findByText('No excluded companies yet.')

    await userEvent.type(input(), 'PPRO{Enter}')
    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()
    await userEvent.clear(input())
    await userEvent.type(input(), 'Flix')
    release()

    expect(await screen.findByText('PPRO')).toBeInTheDocument()
    expect(input()).toHaveValue('Flix')
  })

  it('refuses an empty name without calling the backend', async () => {
    const { add } = fakeServer([])
    renderSettings()
    await screen.findByText('No excluded companies yet.')

    await userEvent.click(addButton())
    expect(screen.getByText('Enter a company name.')).toBeInTheDocument()
    await userEvent.type(input(), '   {Enter}')
    expect(screen.getByText('Enter a company name.')).toBeInTheDocument()
    expect(add).not.toHaveBeenCalled()

    // Typing clears the message.
    await userEvent.type(input(), 'F')
    expect(screen.queryByText('Enter a company name.')).not.toBeInTheDocument()
  })

  it('refuses a duplicate ignoring case and whitespace without calling the backend', async () => {
    const { add } = fakeServer([FLIX])
    renderSettings()
    await screen.findByText('Flix')

    await userEvent.type(input(), '  FLIX {Enter}')

    expect(screen.getByText('“Flix” is already in your excluded companies.')).toBeInTheDocument()
    expect(add).not.toHaveBeenCalled()
    expect(listedNames()).toEqual(['Flix'])
  })

  it('shows the server message when the backend reports a duplicate or invalid name', async () => {
    const { add } = fakeServer([])
    renderSettings()
    await screen.findByText('No excluded companies yet.')
    const message = '"Flix" is already in your excluded companies'
    add.mockRejectedValueOnce(apiError(409, { status: 409, message, fieldErrors: [{ field: 'name', message }] }))

    await userEvent.type(input(), 'Flix{Enter}')

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(input()).toHaveValue('Flix')
  })

  it('shows a general error when adding fails unexpectedly', async () => {
    const { add } = fakeServer([])
    renderSettings()
    await screen.findByText('No excluded companies yet.')
    add.mockRejectedValueOnce(apiError(500, { message: 'org.postgresql.PSQLException' }))

    await userEvent.type(input(), 'Flix{Enter}')

    expect(await screen.findByText('Could not add the company.')).toBeInTheDocument()
    expect(screen.queryByText(/PSQL/)).not.toBeInTheDocument()
  })

  it('edits a company inline and saves with the Save button', async () => {
    const { rename } = fakeServer([FLIX, PPRO])
    renderSettings()
    await screen.findByText('Flix')

    await userEvent.click(screen.getByRole('button', { name: 'Edit Flix' }))
    const field = screen.getByRole('textbox', { name: 'New name for Flix' })
    expect(field).toHaveValue('Flix')
    expect(field).toHaveFocus()
    await userEvent.clear(field)
    await userEvent.type(field, 'FlixBus')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(rename).toHaveBeenCalledWith(1, 'FlixBus')
    expect(await screen.findByText('FlixBus')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /New name/ })).not.toBeInTheDocument()
    expect(listedNames()).toEqual(['FlixBus', 'PPRO'])
  })

  it('saves an edit by pressing Enter and allows changing only the case', async () => {
    const { rename } = fakeServer([{ id: 1, name: 'ppro' }])
    renderSettings()
    await screen.findByText('ppro')

    await userEvent.click(screen.getByRole('button', { name: 'Edit ppro' }))
    const field = screen.getByRole('textbox', { name: 'New name for ppro' })
    await userEvent.clear(field)
    await userEvent.type(field, 'PPRO{Enter}')

    expect(rename).toHaveBeenCalledWith(1, 'PPRO')
    expect(await screen.findByText('PPRO')).toBeInTheDocument()
  })

  it('cancels an edit with Cancel or Escape without calling the backend', async () => {
    const { rename } = fakeServer([FLIX])
    renderSettings()
    await screen.findByText('Flix')

    await userEvent.click(screen.getByRole('button', { name: 'Edit Flix' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New name for Flix' }), 'XYZ')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Flix')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Flix' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New name for Flix' }), 'XYZ{Escape}')
    expect(screen.getByText('Flix')).toBeInTheDocument()
    expect(rename).not.toHaveBeenCalled()
  })

  it('refuses an empty or duplicate name while editing', async () => {
    const { rename } = fakeServer([FLIX, PPRO])
    renderSettings()
    await screen.findByText('Flix')

    await userEvent.click(screen.getByRole('button', { name: 'Edit PPRO' }))
    const field = screen.getByRole('textbox', { name: 'New name for PPRO' })
    await userEvent.clear(field)
    await userEvent.type(field, '  {Enter}')
    expect(screen.getByText('Enter a company name.')).toBeInTheDocument()

    await userEvent.type(field, 'flix{Enter}')
    expect(screen.getByText('“Flix” is already in your excluded companies.')).toBeInTheDocument()
    expect(rename).not.toHaveBeenCalled()
    expect(field).toBeInTheDocument()
  })

  it('keeps the edit open with the server message when renaming fails', async () => {
    const { rename } = fakeServer([FLIX])
    renderSettings()
    await screen.findByText('Flix')
    rename.mockRejectedValueOnce(apiError(404, { status: 404, message: 'Excluded company with id 1 not found' }))

    await userEvent.click(screen.getByRole('button', { name: 'Edit Flix' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New name for Flix' }), 'Bus{Enter}')

    expect(await screen.findByText('Excluded company with id 1 not found')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'New name for Flix' })).toHaveValue('FlixBus')
  })

  it('removes a company after the backend confirms the deletion', async () => {
    const { remove } = fakeServer([FLIX, PPRO])
    renderSettings()
    await screen.findByText('Flix')

    await userEvent.click(screen.getByRole('button', { name: 'Remove Flix' }))

    expect(remove).toHaveBeenCalledWith(1)
    await waitFor(() => expect(screen.queryByText('Flix')).not.toBeInTheDocument())
    expect(listedNames()).toEqual(['PPRO'])
  })

  it('keeps the company and shows an error when removing fails', async () => {
    const { remove } = fakeServer([FLIX])
    renderSettings()
    await screen.findByText('Flix')
    remove.mockRejectedValueOnce(apiError(500, {}))

    await userEvent.click(screen.getByRole('button', { name: 'Remove Flix' }))

    expect(await screen.findByText('Could not remove “Flix”.')).toBeInTheDocument()
    expect(screen.getByText('Flix')).toBeInTheDocument()
  })

  it('shows the empty state again after removing the last company', async () => {
    fakeServer([FLIX])
    renderSettings()
    await screen.findByText('Flix')

    await userEvent.click(screen.getByRole('button', { name: 'Remove Flix' }))

    expect(await screen.findByText('No excluded companies yet.')).toBeInTheDocument()
  })
})

describe('Settings → Job Search → Excluded Companies', () => {
  installFakeBackend()

  it('is a section of the Job Search tab and talks to the excluded-companies API', async () => {
    loggedInBackend()
    backend.routes['GET /api/settings/search-prompt'] = { status: 200, data: { prompt: '', updatedAt: null } }
    let companies: ExcludedCompany[] = [FLIX]
    backend.routes['GET /api/settings/excluded-companies'] = () => ({ status: 200, data: companies })
    backend.routes['POST /api/settings/excluded-companies'] = (body) => {
      const created = { id: 9, name: (body as { name: string }).name }
      companies = [...companies, created]
      return { status: 201, data: created }
    }
    backend.routes['PATCH /api/settings/excluded-companies/1'] = (body) => ({ status: 200, data: { id: 1, ...(body as object) } })
    backend.routes['DELETE /api/settings/excluded-companies/9'] = { status: 204 }
    renderApp('/settings')

    await userEvent.click(await screen.findByRole('tab', { name: 'Job Search' }))
    expect(await within(screen.getByRole('region', { name: 'Excluded Companies' })).findByText('Flix')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: 'Company name' }), ' PPRO {Enter}')
    expect(await screen.findByText('PPRO')).toBeInTheDocument()
    expect(backend.calls('POST /api/settings/excluded-companies')[0]!.body).toEqual({ name: 'PPRO' })

    await userEvent.click(screen.getByRole('button', { name: 'Edit Flix' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'New name for Flix' }), 'Bus{Enter}')
    expect(await screen.findByText('FlixBus')).toBeInTheDocument()
    expect(backend.calls('PATCH /api/settings/excluded-companies/1')[0]!.body).toEqual({ name: 'FlixBus' })

    await userEvent.click(screen.getByRole('button', { name: 'Remove PPRO' }))
    await waitFor(() => expect(screen.queryByText('PPRO')).not.toBeInTheDocument())
    expect(backend.calls('DELETE /api/settings/excluded-companies/9')).toHaveLength(1)

    // The Board is independent: nothing here refetches or changes it.
    expect(backend.requests.filter((r) => r.key !== 'GET /api/board' && r.key.includes('/api/board'))).toEqual([])
    expect(backend.requests.some((r) => r.key.startsWith('POST /api/jobs') || r.key.startsWith('PATCH /api/jobs'))).toBe(false)
  })
})
