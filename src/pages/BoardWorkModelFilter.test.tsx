import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as boardApi from '../api/board'
import type { BoardCard } from '../api/board'
import * as settingsApi from '../api/settings'
import { TicketDrawerProvider } from '../board/TicketDrawerContext'
import { BoardPage } from './BoardPage'

const NOW = new Date().toISOString()

function card(applicationId: number, title: string, statusCode: string, workModel: string | null, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    applicationId,
    jobId: applicationId * 10,
    companyName: 'Acme',
    title,
    location: null,
    workModel,
    fitScore: null,
    statusCode,
    starred: false,
    discoveredAt: NOW,
    createdAt: NOW,
    ...extra,
  }
}

const CARDS = [
  card(1, 'New Remote', 'NEW', 'Remote', { starred: true }),
  card(2, 'New Hybrid', 'NEW', 'Hybrid'),
  card(3, 'New Unspecified', 'NEW', null),
  card(4, 'Rejected Remote', 'REJECTED', 'remote', { companyName: 'Other' }),
  card(5, 'Rejected Unspecified', 'REJECTED', null),
  card(6, 'Low Match Remote', 'LOW_MATCH', 'Remote'),
  card(7, 'Low Match Onsite', 'LOW_MATCH', 'Onsite'),
]
const ALL_TITLES = CARDS.map((c) => c.title)

function mockSettings(visibleBoardStatuses: string[]) {
  vi.spyOn(settingsApi, 'fetchSettings').mockResolvedValue({
    theme: 'SYSTEM',
    timezone: 'UTC',
    visibleBoardStatuses,
    minimumFitScore: 70,
    aiProvider: null,
    aiModel: null,
    anthropicApiKeyConfigured: false,
    geminiApiKeyConfigured: false,
  })
}

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TicketDrawerProvider>
        <BoardPage />
      </TicketDrawerProvider>
    </QueryClientProvider>,
  )
  return client
}

const workModelBox = () => screen.getByRole('combobox', { name: 'Work model' })
const titles = () => ALL_TITLES.filter((t) => screen.queryByText(t))

async function optionLabels() {
  await userEvent.click(workModelBox())
  const labels = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
  await userEvent.keyboard('{Escape}')
  return labels
}

async function selectWorkModel(name: string) {
  await userEvent.click(workModelBox())
  await userEvent.click(screen.getByRole('option', { name }))
}

describe('Board Work model filter', () => {
  beforeEach(() => {
    vi.spyOn(boardApi, 'fetchBoard').mockResolvedValue(CARDS)
    mockSettings(['NEW', 'CV_SENT', 'INTERVIEW_PROCESS', 'OFFER', 'REJECTED', 'ARCHIVED', 'LOW_MATCH'])
  })
  afterEach(() => vi.restoreAllMocks())

  it('defaults to All work models: every job is shown, including jobs without a work model', async () => {
    renderBoard()
    await screen.findByText('New Remote')
    expect(workModelBox()).toHaveTextContent('All work models')
    expect(titles()).toEqual(ALL_TITLES)
    expect(screen.queryByText(/Filtered: showing/)).not.toBeInTheDocument()
  })

  it('offers the distinct work models found on the tickets, once each', async () => {
    renderBoard()
    await screen.findByText('New Remote')
    expect(await optionLabels()).toEqual(['All work models', 'Hybrid', 'Onsite', 'Remote'])
  })

  it('takes options from tickets in hidden columns too, so column visibility never changes them', async () => {
    mockSettings(['NEW', 'REJECTED'])
    renderBoard()
    await screen.findByText('New Remote')
    expect(screen.queryByText('Low Match Onsite')).not.toBeInTheDocument()
    expect(await optionLabels()).toEqual(['All work models', 'Hybrid', 'Onsite', 'Remote'])
  })

  it('filters every column (New, Rejected, Low Match) and hides jobs without a work model', async () => {
    renderBoard()
    await screen.findByText('New Remote')
    await selectWorkModel('Remote')

    expect(workModelBox()).toHaveTextContent('Remote')
    expect(titles()).toEqual(['New Remote', 'Rejected Remote', 'Low Match Remote'])
    expect(screen.getByText('Filtered: showing 3 of 7 jobs')).toBeInTheDocument()
  })

  it('All work models removes the restriction again', async () => {
    renderBoard()
    await screen.findByText('New Remote')
    await selectWorkModel('Onsite')
    expect(titles()).toEqual(['Low Match Onsite'])

    await selectWorkModel('All work models')
    expect(titles()).toEqual(ALL_TITLES)
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()
  })

  it('combines with Company and Starred (AND), and Clear filters resets it', async () => {
    renderBoard()
    await screen.findByText('New Remote')
    await selectWorkModel('Remote')
    await userEvent.click(screen.getByRole('combobox', { name: 'Company' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Acme' }))
    expect(titles()).toEqual(['New Remote', 'Low Match Remote'])

    await userEvent.click(screen.getByRole('button', { name: 'Show only starred jobs' }))
    expect(titles()).toEqual(['New Remote'])

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(workModelBox()).toHaveTextContent('All work models')
    expect(titles()).toEqual(ALL_TITLES)
  })

  it('keeps filtered cards draggable and leaves the board data untouched', async () => {
    const client = renderBoard()
    await screen.findByText('New Remote')
    const before = JSON.stringify(client.getQueryData(['board']))
    await selectWorkModel('Hybrid')

    const shown = screen.getByText('New Hybrid').closest('[aria-roledescription="draggable"]')
    expect(shown).not.toBeNull()
    expect(JSON.stringify(client.getQueryData(['board']))).toBe(before)
  })

  it('resets to All work models when the selected value no longer exists on any ticket', async () => {
    const client = renderBoard()
    await screen.findByText('New Remote')
    await selectWorkModel('Onsite')
    expect(titles()).toEqual(['Low Match Onsite'])

    // The only Onsite job is edited to Hybrid; the board query refreshes.
    const updated = CARDS.map((c) => (c.applicationId === 7 ? { ...c, workModel: 'Hybrid' } : c))
    act(() => client.setQueryData(['board'], updated))

    await waitFor(() => expect(workModelBox()).toHaveTextContent('All work models'))
    expect(titles()).toEqual(ALL_TITLES)
    expect(await optionLabels()).toEqual(['All work models', 'Hybrid', 'Remote'])

    // Onsite coming back later does not silently re-apply the old selection.
    act(() => client.setQueryData(['board'], CARDS))
    await waitFor(() => expect(screen.getByText('Low Match Onsite')).toBeInTheDocument())
    expect(workModelBox()).toHaveTextContent('All work models')
    expect(titles()).toEqual(ALL_TITLES)
  })

  it('keeps the selection when only the label spelling of that value changes', async () => {
    const client = renderBoard()
    await screen.findByText('New Remote')
    await selectWorkModel('Remote')

    // "remote" becomes the most used spelling: the option label changes, the filter stays.
    const updated = CARDS.map((c) => (c.workModel === 'Remote' ? { ...c, workModel: 'remote' } : c))
    act(() => client.setQueryData(['board'], updated))

    await waitFor(() => expect(workModelBox()).toHaveTextContent(/^remote$/))
    expect(titles()).toEqual(['New Remote', 'Rejected Remote', 'Low Match Remote'])
  })

  it('a new work model on a ticket becomes an option automatically', async () => {
    const client = renderBoard()
    await screen.findByText('New Remote')
    act(() => client.setQueryData(['board'], [...CARDS, card(8, 'New Flexible', 'NEW', 'Flexible')]))
    await screen.findByText('New Flexible')

    expect(await optionLabels()).toEqual(['All work models', 'Flexible', 'Hybrid', 'Onsite', 'Remote'])
    await selectWorkModel('Flexible')
    expect(screen.getByText('New Flexible')).toBeInTheDocument()
    expect(titles()).toEqual([])
  })
})
