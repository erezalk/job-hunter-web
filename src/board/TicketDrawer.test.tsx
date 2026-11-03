import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as applicationsApi from '../api/applications'
import type { Application, ApplicationStage } from '../api/applications'
import * as boardApi from '../api/board'
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

describe('editing job information', () => {
  const RICH_JOB: jobsApi.Job = {
    id: 10, companyId: 1, companyName: 'Acme', title: 'Alpha Role', description: 'Build Java services', descriptionDiscarded: false,
    location: 'Berlin', workModel: 'Hybrid', url: 'https://jobs.example.com/a', salaryMin: 100, salaryMax: 150, currency: '€',
    source: 'Referral', fitScore: 85, discoveredAt: NOW, createdAt: NOW, updatedAt: NOW,
  }
  const RICH_MATCH: JobMatch = {
    fitScore: 85, matchingSkills: ['Spring Boot'], missingSkills: ['Kubernetes'], concerns: ['Long commute'],
    provider: 'ANTHROPIC', model: 'claude-x', evaluatedAt: NOW,
  }
  const STAGE: ApplicationStage = {
    id: 5, name: 'Phone screen', scheduledAt: null, scheduledEndAt: null, interviewerNames: 'Dana', notes: 'Asked about Spring', outcome: 'Passed',
    createdAt: NOW, updatedAt: NOW,
  }

  // jsdom has no ResizeObserver; the description view measures itself with one.
  beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }))
  afterEach(() => vi.unstubAllGlobals())

  it('saving only a new location keeps the AI match and all ticket data on screen after the refetch', async () => {
    vi.spyOn(boardApi, 'fetchBoard').mockResolvedValue([])
    vi.spyOn(applicationsApi, 'fetchApplication').mockResolvedValue(application(1, {
      status: { code: 'CV_SENT', label: 'CV Sent', sortOrder: 2, terminal: false }, notes: 'Call the recruiter', starred: true,
    }))
    vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([STAGE])
    vi.spyOn(jobsApi, 'fetchJob').mockResolvedValue(RICH_JOB)
    // The server keeps the stored match on an edit, so the refetch returns it unchanged.
    const fetchMatch = vi.spyOn(jobMatchApi, 'fetchJobMatch').mockResolvedValue(RICH_MATCH)
    const evaluate = vi.spyOn(jobMatchApi, 'evaluateJobMatch')
    const update = vi.spyOn(jobsApi, 'updateJob').mockImplementation(async (_id, request) => ({
      ...RICH_JOB, location: request.location ?? null,
    }))
    renderDrawer(1)
    await openedTicket('Alpha Role')
    expect(await screen.findByText('Fit: 85%')).toBeInTheDocument()
    const matchFetches = fetchMatch.mock.calls.length

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const location = screen.getByRole('combobox', { name: 'Location' })
    await userEvent.clear(location)
    await userEvent.type(location, 'Munich')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    // Every other field is sent back exactly as stored.
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith(10, {
      title: 'Alpha Role', companyName: 'Acme', location: 'Munich', workModel: 'Hybrid', url: 'https://jobs.example.com/a',
      salaryMin: 100, salaryMax: 150, currency: '€', description: 'Build Java services', source: 'Referral',
    })
    expect(await screen.findByText('Job information saved')).toBeInTheDocument()
    await waitFor(() => expect(fetchMatch.mock.calls.length).toBeGreaterThan(matchFetches))

    expect(screen.getByText('Munich')).toBeInTheDocument()
    expect(screen.getByText('85% fit')).toBeInTheDocument()
    expect(screen.getByText('Fit: 85%')).toBeInTheDocument()
    expect(screen.getByText('Spring Boot')).toBeInTheDocument()
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
    expect(screen.getByText('Long commute')).toBeInTheDocument()
    expect(screen.getByText(/^ANTHROPIC · claude-x/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-evaluate' })).toBeEnabled()
    expect(screen.queryByText('Not evaluated')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('CV Sent')
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument()
    expect(notesField()).toHaveValue('Call the recruiter')
    expect(screen.getByText('Phone screen')).toBeInTheDocument()
    expect(screen.getByText('Outcome: Passed')).toBeInTheDocument()
    expect(evaluate).not.toHaveBeenCalled()
  })
})

describe('stage times in the Ticket Drawer', () => {
  // Local calendar fields, so the expectations hold in any timezone.
  const at = (d: number, h: number, min = 0) => new Date(2026, 9, d, h, min).toISOString()
  const dayText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const stage = (id: number, name: string, overrides: Partial<ApplicationStage> = {}): ApplicationStage => ({
    id, name, scheduledAt: null, scheduledEndAt: null, interviewerNames: 'Dana', notes: `${name} notes`, outcome: 'Passed',
    createdAt: NOW, updatedAt: NOW, ...overrides,
  })

  it('shows a stage without an end time as before, a same-day range once and a cross-day range with both dates', async () => {
    vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([
      stage(1, 'Recruiter call', { scheduledAt: at(29, 10) }),
      stage(2, 'Tech interview', { scheduledAt: at(29, 13), scheduledEndAt: at(29, 14) }),
      stage(3, 'Onsite', { scheduledAt: at(30, 23), scheduledEndAt: at(31, 1) }),
      stage(4, 'Take-home'),
    ])
    renderDrawer(1)
    await openedTicket('Alpha Role')

    const item = async (name: string) => (await screen.findByText(name)).closest('div')!.parentElement!.parentElement!
    const noEnd = await item('Recruiter call')
    expect(within(noEnd).getByText(new Date(at(29, 10)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))).toBeInTheDocument()
    expect(within(noEnd).queryByText(/ – /)).not.toBeInTheDocument()

    const sameDay = within(await item('Tech interview')).getByText(/ – /).textContent!
    expect(sameDay.split(dayText(at(29, 13))).length - 1).toBe(1)

    const crossDay = within(await item('Onsite')).getByText(/ – /).textContent!
    expect(crossDay).toContain(dayText(at(30, 23)))
    expect(crossDay).toContain(dayText(at(31, 1)))

    expect(within(await item('Take-home')).getByText('Not scheduled')).toBeInTheDocument()
  })

  it('adds an end time through Edit Stage and keeps the rest of the stage and ticket on screen after the refetch', async () => {
    const original = stage(5, 'Phone screen', { scheduledAt: at(29, 13) })
    const fetchStages = vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([original])
    const update = vi.spyOn(applicationsApi, 'updateApplicationStage').mockImplementation(async (_app, _id, request) => {
      const saved = { ...original, scheduledEndAt: request.scheduledEndAt ?? null }
      fetchStages.mockResolvedValue([saved])
      return saved
    })
    vi.spyOn(applicationsApi, 'fetchApplication').mockResolvedValue(application(1, { notes: 'Call the recruiter', starred: true }))
    renderDrawer(1)
    await openedTicket('Alpha Role')
    await screen.findByText('Phone screen')

    await userEvent.click(screen.getByRole('button', { name: 'Edit stage' }))
    expect(screen.getByLabelText('Ends at (optional)')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Ends at (optional)'), { target: { value: '2026-10-29T14:00' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith(1, 5, {
      name: 'Phone screen', scheduledAt: at(29, 13), scheduledEndAt: at(29, 14), interviewerNames: 'Dana', notes: 'Phone screen notes', outcome: 'Passed',
    })
    await waitFor(() => expect(screen.queryByLabelText('Ends at (optional)')).not.toBeInTheDocument())
    expect(await screen.findByText(/ – /)).toBeInTheDocument()
    expect(screen.getByText('Phone screen')).toBeInTheDocument()
    expect(screen.getByText('Interviewers: Dana')).toBeInTheDocument()
    expect(screen.getByText('Outcome: Passed')).toBeInTheDocument()
    expect(screen.getByText('Phone screen notes')).toBeInTheDocument()
    expect(notesField()).toHaveValue('Call the recruiter')
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument()
  })

  it('removes an existing end time through Edit Stage', async () => {
    const original = stage(5, 'Phone screen', { scheduledAt: at(29, 13), scheduledEndAt: at(29, 14) })
    const fetchStages = vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([original])
    const update = vi.spyOn(applicationsApi, 'updateApplicationStage').mockImplementation(async (_app, _id, request) => {
      const saved = { ...original, scheduledEndAt: request.scheduledEndAt ?? null }
      fetchStages.mockResolvedValue([saved])
      return saved
    })
    renderDrawer(1)
    await openedTicket('Alpha Role')
    expect(await screen.findByText(/ – /)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Edit stage' }))
    expect(screen.getByLabelText('Ends at (optional)')).toHaveValue('2026-10-29T14:00')
    fireEvent.change(screen.getByLabelText('Ends at (optional)'), { target: { value: '' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(update).toHaveBeenCalledWith(1, 5, expect.objectContaining({ scheduledEndAt: null })))
    await waitFor(() => expect(screen.queryByText(/ – /)).not.toBeInTheDocument())
    expect(screen.getByText('Phone screen')).toBeInTheDocument()
    expect(screen.getByText('Outcome: Passed')).toBeInTheDocument()
  })

  it('does not call the API for an invalid range', async () => {
    vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([stage(5, 'Phone screen', { scheduledAt: at(29, 13), scheduledEndAt: at(29, 14) })])
    const update = vi.spyOn(applicationsApi, 'updateApplicationStage')
    renderDrawer(1)
    await openedTicket('Alpha Role')
    await userEvent.click(await screen.findByRole('button', { name: 'Edit stage' }))

    fireEvent.change(screen.getByLabelText('Scheduled at'), { target: { value: '2026-10-29T15:00' } })

    expect(screen.getByText('End must be after the start')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('long stage text in the Ticket Drawer', () => {
  // jsdom does no layout, so the browser measurements are faked: text containing LONG overflows six lines.
  const isLong = (el: Element) => !!el.textContent?.includes('LONG')
  const stage = (id: number, name: string, overrides: Partial<ApplicationStage> = {}): ApplicationStage => ({
    id, name, scheduledAt: null, scheduledEndAt: null, interviewerNames: 'Dana', notes: 'Short notes', outcome: 'Passed',
    createdAt: NOW, updatedAt: NOW, ...overrides,
  })
  const LONG_NOTES = 'LONG notes\n\nParagraph one\n  - item with   spaces\n`code()`\n<b>not markup</b>\n\n'
  const LONG_OUTCOME = 'LONG feedback: strong on design, weaker on algorithms'

  // The clamped text element, found by its exact text (getByText would normalise the whitespace).
  const textBlock = (text: string) =>
    screen.getByText((_, el) => el?.tagName === 'DIV' && el.childElementCount === 0 && el.textContent === text)
  const control = (block: HTMLElement) => within(block.parentElement!.parentElement!).queryByRole('button', { name: /^Show (more|less)$/ })

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return isLong(this) ? 300 : 20 })
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return isLong(this) ? 120 : 20 })
  })
  afterEach(() => vi.unstubAllGlobals())

  async function renderStages(stages: ApplicationStage[]) {
    vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue(stages)
    renderDrawer(1)
    await openedTicket('Alpha Role')
    await screen.findByText(stages[0].name)
  }

  it('shows short notes and outcome normally, without a Show more control', async () => {
    await renderStages([stage(1, 'Phone screen')])

    expect(textBlock('Short notes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show (more|less)/ })).not.toBeInTheDocument()
  })

  it('starts long notes collapsed with Show more, expands to Show less and collapses again', async () => {
    await renderStages([stage(1, 'Phone screen', { notes: LONG_NOTES })])
    const notes = textBlock(LONG_NOTES)

    const showMore = control(notes)!
    expect(showMore).toHaveTextContent('Show more')
    expect(showMore).toHaveAttribute('aria-expanded', 'false')
    expect(getComputedStyle(notes).overflow).toBe('hidden')

    await userEvent.click(showMore)
    expect(control(notes)).toHaveTextContent('Show less')
    expect(control(notes)).toHaveAttribute('aria-expanded', 'true')
    expect(getComputedStyle(notes).overflow).not.toBe('hidden')
    expect(notes.textContent).toBe(LONG_NOTES)

    await userEvent.click(control(notes)!)
    expect(control(notes)).toHaveTextContent('Show more')
    expect(control(notes)).toHaveAttribute('aria-expanded', 'false')
    expect(getComputedStyle(notes).overflow).toBe('hidden')
    expect(notes.textContent).toBe(LONG_NOTES)
  })

  it('does the same for a long outcome', async () => {
    await renderStages([stage(1, 'Phone screen', { outcome: LONG_OUTCOME })])
    const outcome = textBlock(`Outcome: ${LONG_OUTCOME}`)

    expect(control(outcome)).toHaveTextContent('Show more')
    await userEvent.click(control(outcome)!)
    expect(control(outcome)).toHaveTextContent('Show less')
    expect(outcome.textContent).toBe(`Outcome: ${LONG_OUTCOME}`)
    await userEvent.click(control(outcome)!)
    expect(control(outcome)).toHaveTextContent('Show more')
  })

  it('keeps Notes and Outcome of a stage, and the same field of different stages, independent', async () => {
    await renderStages([
      stage(1, 'Phone screen', { notes: `${LONG_NOTES}A`, outcome: `${LONG_OUTCOME} A` }),
      stage(2, 'Onsite', { notes: `${LONG_NOTES}B`, outcome: `${LONG_OUTCOME} B` }),
    ])
    const notesA = textBlock(`${LONG_NOTES}A`)
    const outcomeA = textBlock(`Outcome: ${LONG_OUTCOME} A`)
    const notesB = textBlock(`${LONG_NOTES}B`)
    const outcomeB = textBlock(`Outcome: ${LONG_OUTCOME} B`)
    const states = () => [notesA, outcomeA, notesB, outcomeB].map((b) => control(b)!.getAttribute('aria-expanded'))

    expect(states()).toEqual(['false', 'false', 'false', 'false'])
    await userEvent.click(control(notesA)!)
    expect(states()).toEqual(['true', 'false', 'false', 'false'])
    await userEvent.click(control(outcomeB)!)
    expect(states()).toEqual(['true', 'false', 'false', 'true'])
    await userEvent.click(control(notesA)!)
    expect(states()).toEqual(['false', 'false', 'false', 'true'])
  })

  it('never sends an update when expanding or collapsing', async () => {
    const update = vi.spyOn(applicationsApi, 'updateApplicationStage')
    const create = vi.spyOn(applicationsApi, 'createApplicationStage')
    await renderStages([stage(1, 'Phone screen', { notes: LONG_NOTES })])
    const notes = textBlock(LONG_NOTES)

    await userEvent.click(control(notes)!)
    await userEvent.click(control(notes)!)

    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('collapses edited notes that become long and drops the control for notes that become short', async () => {
    const original = stage(5, 'Phone screen', { notes: LONG_NOTES })
    const fetchStages = vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([original])
    const update = vi.spyOn(applicationsApi, 'updateApplicationStage').mockImplementation(async (_app, _id, request) => {
      const saved = { ...original, notes: request.notes ?? null }
      fetchStages.mockResolvedValue([saved])
      return saved
    })
    renderDrawer(1)
    await openedTicket('Alpha Role')
    await userEvent.click(control(textBlock(LONG_NOTES))!)
    expect(control(textBlock(LONG_NOTES))).toHaveTextContent('Show less')

    // Long -> short: the saved text shows normally, no control.
    await userEvent.click(screen.getByRole('button', { name: 'Edit stage' }))
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Now short' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenLastCalledWith(1, 5, expect.objectContaining({ notes: 'Now short' }))
    expect(await screen.findByText('Now short')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show (more|less)/ })).not.toBeInTheDocument()

    // Short -> long: collapsed again with Show more.
    await userEvent.click(screen.getByRole('button', { name: 'Edit stage' }))
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: `${LONG_NOTES}edited` } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(update).toHaveBeenLastCalledWith(1, 5, expect.objectContaining({ notes: `${LONG_NOTES}edited` }))
    await waitFor(() => expect(control(textBlock(`${LONG_NOTES}edited`))).toHaveTextContent('Show more'))
  })

  it('keeps the stage header, schedule and edit/delete actions working next to long text', async () => {
    const at = (d: number, h: number) => new Date(2026, 9, d, h).toISOString()
    const remove = vi.spyOn(applicationsApi, 'deleteApplicationStage').mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderStages([stage(7, 'Tech interview', { scheduledAt: at(29, 13), scheduledEndAt: at(29, 14), notes: LONG_NOTES, outcome: LONG_OUTCOME })])

    expect(screen.getByText('Tech interview')).toBeInTheDocument()
    expect(screen.getByText('Interviewers: Dana')).toBeInTheDocument()
    expect(screen.getByText(/ – /)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit stage' }))
    expect(screen.getByLabelText('Ends at (optional)')).toHaveValue('2026-10-29T14:00')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByLabelText('Ends at (optional)')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'Delete stage' }))
    await waitFor(() => expect(remove).toHaveBeenCalledWith(1, 7))
  })
})
