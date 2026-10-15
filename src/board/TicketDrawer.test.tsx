import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as applicationsApi from '../api/applications'
import type { Application } from '../api/applications'
import * as jobMatchApi from '../api/jobmatch'
import type { JobMatch } from '../api/jobmatch'
import * as jobsApi from '../api/jobs'
import * as settingsApi from '../api/settings'
import { TicketDrawer } from './TicketDrawer'

// Ticket A = application 1 / job 10, ticket B = application 2 / job 20.
const NOW = new Date().toISOString()
const TITLES: Record<number, string> = { 1: 'Alpha Role', 2: 'Beta Role' }

function application(id: number, overrides: Partial<Application> = {}): Application {
  return {
    id, jobId: id * 10, jobTitle: TITLES[id], userId: 1, status: { code: 'NEW', label: 'New', sortOrder: 1, terminal: false },
    appliedAt: null, notes: null, starred: false, createdAt: NOW, updatedAt: NOW, ...overrides,
  }
}

const MATCH_A: JobMatch = {
  fitScore: 91, matchingSkills: ['Alpha skill'], missingSkills: [], concerns: [], provider: 'GEMINI', model: 'model-a', evaluatedAt: NOW,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function renderDrawer(applicationId: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const ui = (id: number) => (
    <QueryClientProvider client={client}>
      <TicketDrawer applicationId={id} onClose={vi.fn()} />
    </QueryClientProvider>
  )
  const view = render(ui(applicationId))
  return { client, open: (id: number) => view.rerender(ui(id)) }
}

const notesField = () => screen.getByPlaceholderText(/Recruiter details/)
const openedTicket = (title: string) => screen.findByRole('heading', { name: title })

beforeEach(() => {
  vi.spyOn(settingsApi, 'fetchSettings').mockResolvedValue({
    theme: 'SYSTEM', timezone: 'UTC', visibleBoardStatuses: ['NEW', 'CV_SENT'], minimumFitScore: 70, aiProvider: null,
    aiModel: null, anthropicApiKeyConfigured: false, geminiApiKeyConfigured: false,
  })
  vi.spyOn(applicationsApi, 'fetchApplication').mockImplementation(async (id) => application(id))
  vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([])
  vi.spyOn(jobMatchApi, 'fetchJobMatch').mockResolvedValue(null)
  vi.spyOn(jobsApi, 'fetchJob').mockImplementation(async (jobId) => ({
    id: jobId, companyId: 1, companyName: 'Acme', title: TITLES[jobId / 10], description: null, descriptionDiscarded: false,
    location: null, workModel: null, url: null, salaryMin: null, salaryMax: null, currency: null, source: null,
    fitScore: null, discoveredAt: NOW, createdAt: NOW, updatedAt: NOW,
  }))
})
afterEach(() => vi.restoreAllMocks())

describe('switching tickets in the Ticket Drawer', () => {
  it("never shows ticket A's unsaved notes on ticket B, even when B is already cached", async () => {
    const drawer = renderDrawer(2)
    await openedTicket('Beta Role')
    drawer.open(1)
    await openedTicket('Alpha Role')
    await userEvent.type(notesField(), 'unsaved draft for A')

    drawer.open(2)
    await openedTicket('Beta Role')

    expect(notesField()).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save notes' })).toBeDisabled()
  })

  it("writes an Evaluate fit result for A only to A, even if B is open when it arrives", async () => {
    const pending = deferred<JobMatch>()
    const evaluate = vi.spyOn(jobMatchApi, 'evaluateJobMatch').mockReturnValue(pending.promise)
    const drawer = renderDrawer(1)
    await openedTicket('Alpha Role')
    await userEvent.click(await screen.findByRole('button', { name: 'Evaluate fit' }))
    expect(evaluate).toHaveBeenCalledWith(10, false)

    drawer.open(2)
    await openedTicket('Beta Role')
    // A's evaluation in flight is not B's: B's own button is idle.
    expect(await screen.findByRole('button', { name: 'Evaluate fit' })).toBeEnabled()

    pending.resolve(MATCH_A)

    await waitFor(() => expect(drawer.client.getQueryData(['jobMatch', 10])).toEqual(MATCH_A))
    expect(drawer.client.getQueryData(['jobMatch', 20])).toBeNull()
    expect(screen.queryByText('Fit: 91%')).not.toBeInTheDocument()
    expect(screen.getByText('Not evaluated')).toBeInTheDocument()
  })

  it("applies a status change for A to A's cache only, even if B is open when it completes", async () => {
    const pending = deferred<Application>()
    const change = vi.spyOn(applicationsApi, 'changeApplicationStatus').mockReturnValue(pending.promise)
    const drawer = renderDrawer(1)
    await openedTicket('Alpha Role')
    await userEvent.click(screen.getByRole('combobox', { name: 'Status' }))
    await userEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'CV Sent' }))
    expect(change).toHaveBeenCalledWith(1, 'CV_SENT')

    drawer.open(2)
    await openedTicket('Beta Role')
    pending.resolve(application(1, { status: { code: 'CV_SENT', label: 'CV Sent', sortOrder: 2, terminal: false }, notes: 'A notes' }))

    await waitFor(() => expect(drawer.client.getQueryData<Application>(['application', 1])?.status.code).toBe('CV_SENT'))
    expect(drawer.client.getQueryData<Application>(['application', 2])?.id).toBe(2)
    expect(notesField()).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('New')
  })

  it('sends a notes save to the application it was started for', async () => {
    const pending = deferred<Application>()
    const save = vi.spyOn(applicationsApi, 'updateApplicationNotes').mockReturnValue(pending.promise)
    const drawer = renderDrawer(1)
    await openedTicket('Alpha Role')
    await userEvent.type(notesField(), 'notes for A')
    await userEvent.click(screen.getByRole('button', { name: 'Save notes' }))

    drawer.open(2)
    await openedTicket('Beta Role')
    pending.resolve(application(1, { notes: 'notes for A' }))

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(1, 'notes for A')
    await waitFor(() => expect(applicationsApi.fetchApplication).toHaveBeenCalledWith(1))
    expect(notesField()).toHaveValue('')
  })
})
