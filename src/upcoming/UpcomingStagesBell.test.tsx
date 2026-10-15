import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as applicationsApi from '../api/applications'
import type { UpcomingStage } from '../api/applications'
import * as boardApi from '../api/board'
import type { BoardCard } from '../api/board'
import * as jobMatchApi from '../api/jobmatch'
import * as jobsApi from '../api/jobs'
import * as settingsApi from '../api/settings'
import { TicketDrawerProvider } from '../board/TicketDrawerContext'
import { AppLayout } from '../layout/AppLayout'
import { BoardPage } from '../pages/BoardPage'
import { UpcomingStagesBell } from './UpcomingStagesBell'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ user: { fullName: 'Test User' }, logout: vi.fn() }),
}))

const NOW_ISO = new Date().toISOString()
const HOUR = 3_600_000
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString()

const JOBS = [
  { applicationId: 1, title: 'Alpha Role', company: '1GLOBAL', statusCode: 'NEW' },
  { applicationId: 2, title: 'Beta Role', company: 'Acme', statusCode: 'NEW' },
  { applicationId: 3, title: 'Hidden Role', company: 'Zeta', statusCode: 'REJECTED' }, // column hidden in settings
]
const CARDS: BoardCard[] = JOBS.map((j) => ({
  applicationId: j.applicationId, jobId: j.applicationId * 10, companyName: j.company, title: j.title, location: null,
  workModel: null, fitScore: null, statusCode: j.statusCode, starred: false, discoveredAt: NOW_ISO, createdAt: NOW_ISO,
}))

function upcomingStage(stageId: number, applicationId: number, name: string, scheduledAt: string | null): UpcomingStage {
  const job = JOBS.find((j) => j.applicationId === applicationId)!
  return { stageId, stageName: name, scheduledAt: scheduledAt as string, applicationId, jobId: applicationId * 10, jobTitle: job.title, companyName: job.company }
}

function mockApis(upcoming: () => UpcomingStage[]) {
  vi.spyOn(applicationsApi, 'fetchUpcomingStages').mockImplementation(async () => upcoming())
  vi.spyOn(boardApi, 'fetchBoard').mockResolvedValue(CARDS)
  vi.spyOn(settingsApi, 'fetchSettings').mockResolvedValue({
    theme: 'SYSTEM', timezone: 'UTC', visibleBoardStatuses: ['NEW'], minimumFitScore: 70, aiProvider: null, aiModel: null,
    anthropicApiKeyConfigured: false, geminiApiKeyConfigured: false,
  })
  vi.spyOn(applicationsApi, 'fetchApplication').mockImplementation(async (id) => {
    const j = JOBS.find((x) => x.applicationId === id)!
    return {
      id, jobId: id * 10, jobTitle: j.title, userId: 1, status: { code: j.statusCode, label: j.statusCode, sortOrder: 1, terminal: false },
      appliedAt: null, notes: null, starred: false, createdAt: NOW_ISO, updatedAt: NOW_ISO,
    }
  })
  vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([])
  vi.spyOn(jobMatchApi, 'fetchJobMatch').mockResolvedValue(null)
  vi.spyOn(jobsApi, 'fetchJob').mockImplementation(async (jobId) => {
    const j = JOBS.find((x) => x.applicationId * 10 === jobId)!
    return {
      id: jobId, companyId: 1, companyName: j.company, title: j.title, description: null, descriptionDiscarded: false,
      location: null, workModel: null, url: null, salaryMin: null, salaryMax: null, currency: null, source: null,
      fitScore: null, discoveredAt: NOW_ISO, createdAt: NOW_ISO, updatedAt: NOW_ISO,
    }
  })
}

function renderWith(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

const renderBell = () => renderWith(<TicketDrawerProvider><UpcomingStagesBell /></TicketDrawerProvider>)
const bell = () => screen.findByRole('button', { name: 'Upcoming stages' })
const dot = () => screen.getByTestId('upcoming-stages-dot').querySelector('.MuiBadge-badge')!
const hasDot = () => !dot().classList.contains('MuiBadge-invisible')
const rowNames = () => screen.getAllByRole('button').filter((b) => b.closest('.MuiList-root')).map((b) => b.querySelector('p')?.textContent)

beforeEach(() => mockApis(() => []))
afterEach(() => vi.restoreAllMocks())

describe('bell without upcoming stages', () => {
  it('stays visible, shows no red dot and opens an empty state', async () => {
    renderBell()
    await userEvent.click(await bell())
    expect(await screen.findByText('No upcoming stages')).toBeInTheDocument()
    expect(screen.getByText('Upcoming stages', { selector: 'h6, p' })).toBeInTheDocument()
    expect(hasDot()).toBe(false)
  })

  it('ignores past and unscheduled stages the cache may still hold', async () => {
    mockApis(() => [upcomingStage(1, 1, 'Past', inHours(-1)), upcomingStage(2, 1, 'Unscheduled', null)])
    renderBell()
    await userEvent.click(await bell())
    expect(await screen.findByText('No upcoming stages')).toBeInTheDocument()
    expect(hasDot()).toBe(false)
  })
})

describe('bell with upcoming stages', () => {
  beforeEach(() =>
    mockApis(() => [
      upcomingStage(3, 2, 'Final Round', inHours(50)),
      upcomingStage(1, 1, 'Technical Interview', inHours(1)),
      upcomingStage(2, 1, 'Past Call', inHours(-2)),
      upcomingStage(4, 2, 'Team Interview', inHours(26)),
    ]),
  )

  it('shows the red dot (no count) once a future stage is loaded', async () => {
    renderBell()
    await waitFor(() => expect(hasDot()).toBe(true))
    expect(screen.getByTestId('upcoming-stages-dot').textContent).toBe('')
  })

  it('lists future stages nearest first with name, job, company and time', async () => {
    renderBell()
    await userEvent.click(await bell())
    await screen.findByText('Technical Interview')

    expect(rowNames()).toEqual(['Technical Interview', 'Team Interview', 'Final Round'])
    const first = screen.getByRole('button', { name: /Technical Interview/ })
    expect(within(first).getByText('Alpha Role · 1GLOBAL')).toBeInTheDocument()
    expect(within(first).getByText(/^(Today|Tomorrow), /)).toBeInTheDocument() // the date/time line
    expect(screen.queryByText('Past Call')).not.toBeInTheDocument()
  })

  it('closes with Escape', async () => {
    renderBell()
    await userEvent.click(await bell())
    await screen.findByText('Technical Interview')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Technical Interview')).not.toBeInTheDocument())
  })

  it('closes the popover and opens that exact job in the Ticket Drawer', async () => {
    renderBell()
    await userEvent.click(await bell())
    await userEvent.click(await screen.findByRole('button', { name: /Final Round/ }))

    await waitFor(() => expect(screen.queryByText('Final Round')).not.toBeInTheDocument())
    expect(await screen.findByRole('button', { name: 'Close ticket' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Beta Role' })).toBeInTheDocument()
    expect(applicationsApi.fetchApplication).toHaveBeenCalledWith(2)
  })
})

describe('time passing', () => {
  it('drops a stage from the list and clears the dot once it is in the past, without refetching', async () => {
    mockApis(() => [upcomingStage(1, 1, 'Soon', new Date(Date.now() + 400).toISOString())])
    renderBell()
    await waitFor(() => expect(hasDot()).toBe(true))
    await waitFor(() => expect(hasDot()).toBe(false), { timeout: 3000 })
    expect(applicationsApi.fetchUpcomingStages).toHaveBeenCalledTimes(1)
  })
})

describe('reacting to stage changes', () => {
  it('refreshes the bell after a stage is deleted in the Ticket Drawer', async () => {
    let stages = [upcomingStage(1, 1, 'Technical Interview', inHours(3))]
    mockApis(() => stages)
    vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([
      { id: 1, name: 'Technical Interview', scheduledAt: inHours(3), interviewerNames: null, notes: null, outcome: null, createdAt: NOW_ISO, updatedAt: NOW_ISO },
    ])
    vi.spyOn(applicationsApi, 'deleteApplicationStage').mockImplementation(async () => {
      stages = []
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderBell()
    await waitFor(() => expect(hasDot()).toBe(true))
    await userEvent.click(await bell())
    await userEvent.click(await screen.findByRole('button', { name: /Technical Interview/ }))

    await userEvent.click(await screen.findByRole('button', { name: 'Delete stage' }))

    await waitFor(() => expect(hasDot()).toBe(false))
  })

  it('refreshes the bell after a stage is added in the Ticket Drawer', async () => {
    let stages: UpcomingStage[] = []
    mockApis(() => stages)
    vi.spyOn(applicationsApi, 'createApplicationStage').mockImplementation(async () => {
      stages = [upcomingStage(9, 1, 'Phone Screen', inHours(5))]
      return { id: 9, name: 'Phone Screen', scheduledAt: inHours(5), interviewerNames: null, notes: null, outcome: null, createdAt: NOW_ISO, updatedAt: NOW_ISO }
    })
    // Open ticket 1 through the Board, as a user without any upcoming stage would.
    renderWith(<TicketDrawerProvider><UpcomingStagesBell /><BoardPage /></TicketDrawerProvider>)
    expect(hasDot()).toBe(false)
    await userEvent.click(await screen.findByText('Alpha Role'))
    await userEvent.click(await screen.findByRole('button', { name: 'Add stage' }))
    await userEvent.type(await screen.findByLabelText(/Stage name/), 'Phone Screen')
    await userEvent.click(screen.getByRole('button', { name: /^(Add|Save)$/ }))

    await waitFor(() => expect(hasDot()).toBe(true))
  })
})

describe('Board filters and hidden columns', () => {
  beforeEach(() =>
    mockApis(() => [
      upcomingStage(1, 1, 'Alpha Stage', inHours(1)),
      upcomingStage(3, 3, 'Hidden Column Stage', inHours(2)),
    ]),
  )

  it('lists stages of jobs in hidden columns and of jobs the filters hide', async () => {
    renderWith(<TicketDrawerProvider><UpcomingStagesBell /><BoardPage /></TicketDrawerProvider>)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Company' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Acme' }))
    expect(screen.queryByText('Alpha Role')).not.toBeInTheDocument() // filtered out of the Board
    expect(screen.queryByText('Hidden Role')).not.toBeInTheDocument() // hidden column

    await userEvent.click(await bell())
    expect(await screen.findByText('Alpha Stage')).toBeInTheDocument()
    expect(screen.getByText('Hidden Column Stage')).toBeInTheDocument()
  })

  it('opens a job the filters hide without changing filters or columns, and they stay after closing', async () => {
    renderWith(<TicketDrawerProvider><UpcomingStagesBell /><BoardPage /></TicketDrawerProvider>)
    const companyBox = () => screen.getByRole('combobox', { name: 'Company', hidden: true })
    await userEvent.click(await screen.findByRole('combobox', { name: 'Company' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Acme' }))

    await userEvent.click(await bell())
    await userEvent.click(await screen.findByRole('button', { name: /Alpha Stage/ }))
    expect(await screen.findByRole('heading', { name: 'Alpha Role' })).toBeInTheDocument()
    expect(applicationsApi.fetchApplication).toHaveBeenCalledWith(1)
    expect(companyBox()).toHaveValue('Acme')

    await userEvent.click(screen.getByRole('button', { name: 'Close ticket' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close ticket' })).not.toBeInTheDocument())
    expect(companyBox()).toHaveValue('Acme')
    expect(screen.getByText('Beta Role')).toBeInTheDocument()
    expect(screen.queryByText('Alpha Role')).not.toBeInTheDocument()
  })

  it('opens a job from a hidden column without moving it or showing the column', async () => {
    renderWith(<TicketDrawerProvider><UpcomingStagesBell /><BoardPage /></TicketDrawerProvider>)
    await screen.findByText('Alpha Role')
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument() // hidden column
    await userEvent.click(await bell())
    await userEvent.click(await screen.findByRole('button', { name: /Hidden Column Stage/ }))

    expect(await screen.findByRole('heading', { name: 'Hidden Role' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Close ticket' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close ticket' })).not.toBeInTheDocument())
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument() // still hidden, nothing moved
    expect(boardApi.fetchBoard).toHaveBeenCalledTimes(1)
  })
})

describe('header placement', () => {
  it('puts the bell on the right of the top header row, next to the "Job Hunter" title', async () => {
    mockApis(() => [upcomingStage(1, 1, 'Alpha Stage', inHours(1))])
    renderWith(<AppLayout><div /></AppLayout>)
    const header = screen.getByRole('banner')
    expect(within(header).getByText('Job Hunter')).toBeInTheDocument()
    expect(await within(header).findByRole('button', { name: 'Upcoming stages' })).toBeInTheDocument()
    expect(within(document.querySelector<HTMLElement>('.MuiDrawer-docked')!).queryByRole('button', { name: 'Upcoming stages' })).toBeNull()
  })
})
