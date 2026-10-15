import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as applicationsApi from '../api/applications'
import * as boardApi from '../api/board'
import type { BoardCard } from '../api/board'
import * as jobMatchApi from '../api/jobmatch'
import * as jobsApi from '../api/jobs'
import * as settingsApi from '../api/settings'
import { resolveCompanyOption } from '../board/boardFilters'
import { TicketDrawerProvider } from '../board/TicketDrawerContext'
import { BoardPage } from './BoardPage'

const NOW = new Date().toISOString()

function card(applicationId: number, title: string, companyName: string, starred = false): BoardCard {
  return {
    applicationId,
    jobId: applicationId * 10,
    companyName,
    title,
    location: null,
    workModel: null,
    fitScore: null,
    statusCode: 'NEW',
    starred,
    discoveredAt: NOW,
    createdAt: NOW,
  }
}

const CARDS = [
  card(1, 'Alpha Role', '1GLOBAL', true),
  card(2, 'Beta Role', '1GLOBAL'),
  card(3, 'Gamma Role', 'Acme', true),
  card(4, 'Delta Role', 'Acme'),
]

function renderBoard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TicketDrawerProvider>
        <BoardPage />
      </TicketDrawerProvider>
    </QueryClientProvider>,
  )
}

const companyBox = () => screen.getByRole('combobox', { name: 'Company' })
const titles = () => ['Alpha Role', 'Beta Role', 'Gamma Role', 'Delta Role'].filter((t) => screen.queryByText(t))

async function openTicket(title: string) {
  await userEvent.click(await screen.findByText(title))
  return screen.findByRole('button', { name: 'Close ticket' })
}

describe('clicking the company in the Ticket Drawer', () => {
  beforeEach(() => {
    vi.spyOn(boardApi, 'fetchBoard').mockResolvedValue(CARDS)
    vi.spyOn(settingsApi, 'fetchSettings').mockResolvedValue({
      theme: 'SYSTEM',
      timezone: 'UTC',
      visibleBoardStatuses: ['NEW', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'ARCHIVED'],
      minimumFitScore: 70,
      aiProvider: null,
      aiModel: null,
      anthropicApiKeyConfigured: false,
      geminiApiKeyConfigured: false,
    })
    vi.spyOn(applicationsApi, 'fetchApplication').mockImplementation(async (id) => {
      const c = CARDS.find((x) => x.applicationId === id)!
      return {
        id,
        jobId: c.jobId,
        jobTitle: c.title,
        userId: 1,
        status: { code: 'NEW', label: 'New', sortOrder: 1, terminal: false },
        appliedAt: null,
        notes: null,
        starred: c.starred,
        createdAt: NOW,
        updatedAt: NOW,
      }
    })
    vi.spyOn(applicationsApi, 'fetchApplicationStages').mockResolvedValue([])
    vi.spyOn(jobMatchApi, 'fetchJobMatch').mockResolvedValue(null)
    vi.spyOn(jobsApi, 'fetchJob').mockImplementation(async (jobId) => {
      const c = CARDS.find((x) => x.jobId === jobId)!
      return {
        id: jobId, companyId: 1, companyName: c.companyName, title: c.title, description: null, descriptionDiscarded: false,
        location: null, workModel: null, url: null, salaryMin: null, salaryMax: null, currency: null, source: null,
        fitScore: null, discoveredAt: NOW, createdAt: NOW, updatedAt: NOW,
      }
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('renders the company as a keyboard-focusable link-style button, not a navigation link', async () => {
    renderBoard()
    await openTicket('Alpha Role')
    const company = await screen.findByRole('button', { name: '1GLOBAL' })

    expect(company.tagName).toBe('BUTTON')
    expect(company).not.toHaveAttribute('href')
    expect(screen.queryByText(/filter by company/i)).not.toBeInTheDocument()
    company.focus()
    expect(company).toHaveFocus()
  })

  it('closes the drawer, sets the existing Company filter and filters the Board immediately', async () => {
    renderBoard()
    const before = window.location.href
    await openTicket('Alpha Role')

    await userEvent.click(await screen.findByRole('button', { name: '1GLOBAL' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close ticket' })).not.toBeInTheDocument())
    expect(companyBox()).toHaveValue('1GLOBAL')
    expect(titles()).toEqual(['Alpha Role', 'Beta Role'])
    expect(screen.getByText('Filtered: showing 2 of 4 jobs')).toBeInTheDocument()
    expect(window.location.href).toBe(before) // no navigation / reload
  })

  it('works from the keyboard (Enter)', async () => {
    renderBoard()
    await openTicket('Gamma Role')
    const company = await screen.findByRole('button', { name: 'Acme' })
    company.focus()
    await userEvent.keyboard('{Enter}')

    await waitFor(() => expect(companyBox()).toHaveValue('Acme'))
    expect(titles()).toEqual(['Gamma Role', 'Delta Role'])
  })

  it('replaces a different active company filter and keeps the other filters', async () => {
    renderBoard()
    // Starred filter on, and a company filter for Acme chosen in the filter bar.
    await userEvent.click(await screen.findByRole('button', { name: 'Show only starred jobs' }))
    await userEvent.click(companyBox())
    await userEvent.click(await screen.findByRole('option', { name: 'Acme' }))
    expect(titles()).toEqual(['Gamma Role'])

    // Same filter state, but the ticket belongs to another company: its click must replace Acme.
    vi.spyOn(jobsApi, 'fetchJob').mockImplementation(async (jobId) => ({
      id: jobId, companyId: 1, companyName: '1global', title: 'Gamma Role', description: null, descriptionDiscarded: false,
      location: null, workModel: null, url: null, salaryMin: null, salaryMax: null, currency: null, source: null,
      fitScore: null, discoveredAt: NOW, createdAt: NOW, updatedAt: NOW,
    }))
    await userEvent.click(screen.getByText('Gamma Role'))
    await userEvent.click(await screen.findByRole('button', { name: '1global' }))

    // Canonical Board spelling is used (case-insensitive match), the starred filter survives.
    await waitFor(() => expect(companyBox()).toHaveValue('1GLOBAL'))
    expect(screen.getByRole('button', { name: 'Show only starred jobs' })).toHaveAttribute('aria-pressed', 'true')
    expect(titles()).toEqual(['Alpha Role'])
  })

  it('Clear filters still clears the company filter set from the drawer', async () => {
    renderBoard()
    await openTicket('Alpha Role')
    await userEvent.click(await screen.findByRole('button', { name: '1GLOBAL' }))
    await waitFor(() => expect(companyBox()).toHaveValue('1GLOBAL'))

    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }))

    expect(companyBox()).toHaveValue('')
    expect(titles()).toEqual(['Alpha Role', 'Beta Role', 'Gamma Role', 'Delta Role'])
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()
  })
})

describe('resolveCompanyOption', () => {
  it('matches case- and whitespace-insensitively to the Board spelling', () => {
    expect(resolveCompanyOption(['1GLOBAL', 'Acme'], ' 1global  ')).toBe('1GLOBAL')
    expect(resolveCompanyOption(['Acme Corp'], 'acme   corp')).toBe('Acme Corp')
    expect(resolveCompanyOption(['Acme'], 'Other')).toBeNull()
    expect(resolveCompanyOption(['Acme'], null)).toBeNull()
  })
})
