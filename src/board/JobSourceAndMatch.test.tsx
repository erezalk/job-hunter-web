import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as boardApi from '../api/board'
import type { Job } from '../api/jobs'
import type { JobMatch } from '../api/jobmatch'
import { AddJobDialog } from './AddJobDialog'
import { AiMatchResultView } from './AiMatchResultView'
import { JobInfoEditForm } from './JobInfoEditForm'
import { JobMetaLine } from './JobMetaLine'
import { matchAttribution } from './matchAttribution'

const JOB: Job = {
  id: 1,
  companyId: 2,
  companyName: 'Acme',
  title: 'Backend Engineer',
  description: 'Build things',
  descriptionDiscarded: false,
  location: 'Berlin',
  workModel: 'Remote',
  url: null,
  salaryMin: null,
  salaryMax: null,
  currency: null,
  source: 'External AI',
  fitScore: null,
  discoveredAt: '2026-10-06T10:00:00Z',
  createdAt: '2026-10-06T10:00:00Z',
  updatedAt: '2026-10-06T10:00:00Z',
}

const MATCH: JobMatch = {
  fitScore: 92,
  matchingSkills: ['Java', '5+ years of Java (10+ years total)'],
  missingSkills: ['Kubernetes'],
  concerns: ['On-call rotation'],
  provider: 'EXTERNAL_AI',
  model: null,
  evaluatedAt: '2026-10-06T12:00:00Z',
}

function renderEdit(job: Job, onSave = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <JobInfoEditForm job={job} pending={false} serverErrors={{}} onSave={onSave} onCancel={vi.fn()} />
    </QueryClientProvider>,
  )
  return onSave
}

describe('Source in Job information', () => {
  it('shows the source subtly next to the discovered date', () => {
    render(<JobMetaLine job={{ ...JOB, source: 'LinkedIn' }} />)
    expect(screen.getByText(/Discovered .* · Source: LinkedIn/)).toBeInTheDocument()
  })

  it.each([null, ''])('omits the Source entirely when it is %j (never shows "Manual" for old jobs)', (source) => {
    const { container } = render(<JobMetaLine job={{ ...JOB, source }} />)
    expect(screen.getByText(/^Discovered /)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/Source|Manual/)
  })
})

describe('Edit Job Information — Source', () => {
  it('prefills the current source and saves arbitrary free text', async () => {
    const onSave = renderEdit({ ...JOB, source: 'External AI' })
    const field = screen.getByLabelText('Source')
    expect(field).toHaveValue('External AI')

    await userEvent.clear(field)
    await userEvent.type(field, 'Referral from Dana (Acme)')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![0]).toMatchObject({ title: 'Backend Engineer', source: 'Referral from Dana (Acme)' })
  })

  it('starts empty for a job without a source and lets the user clear one', async () => {
    const onSave = renderEdit({ ...JOB, source: null })
    expect(screen.getByLabelText('Source')).toHaveValue('')

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]![0].source).toBe('')
  })

  it('is a plain text field, not a dropdown', () => {
    renderEdit(JOB)
    expect(screen.getByLabelText('Source').tagName).toBe('INPUT')
    expect(screen.queryByRole('combobox', { name: 'Source' })).not.toBeInTheDocument()
  })

  it('rejects a source longer than 100 characters without saving', async () => {
    const onSave = renderEdit(JOB)
    const field = screen.getByLabelText('Source')
    await userEvent.clear(field)
    await userEvent.click(field)
    await userEvent.paste('x'.repeat(101))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('At most 100 characters')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('Add Job dialog', () => {
  it('has no Source (or fit) field and never sends one', async () => {
    vi.spyOn(boardApi, 'fetchBoard').mockResolvedValue([])
    const add = vi.spyOn(boardApi, 'addAndTrackJob').mockResolvedValue({ alreadyOnBoard: false } as boardApi.AddJobResult)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AddJobDialog open onClose={vi.fn()} />
      </QueryClientProvider>,
    )

    expect(screen.getByLabelText(/^Title/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/source/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/fit|match|gap/i)).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/^Title/), 'Some Role')
    await userEvent.click(screen.getByRole('button', { name: /Add & track in New/ }))
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1))
    expect(add.mock.calls[0]![0]).not.toHaveProperty('source')
  })
})

describe('AI match section content', () => {
  it('renders an imported external match with External AI attribution and no model', () => {
    render(<AiMatchResultView match={MATCH} />)

    expect(screen.getByText('Fit: 92%')).toBeInTheDocument()
    expect(screen.getByText(/^External AI · \d/)).toBeInTheDocument()
    expect(screen.queryByText(/GEMINI|Gemini|null/)).not.toBeInTheDocument()
    expect(screen.getByText('Matching')).toBeInTheDocument()
    expect(screen.getByText('5+ years of Java (10+ years total)')).toBeInTheDocument()
    expect(screen.getByText('Gaps')).toBeInTheDocument()
    expect(screen.getByText('Kubernetes')).toBeInTheDocument()
    expect(screen.getByText('Concerns')).toBeInTheDocument()
    expect(screen.getByText('On-call rotation')).toBeInTheDocument()
  })

  it('shows the optional external model name when supplied', () => {
    render(<AiMatchResultView match={{ ...MATCH, model: 'Claude Opus 5.5' }} />)
    expect(screen.getByText(/^External AI · Claude Opus 5\.5 · \d/)).toBeInTheDocument()
  })

  it('still attributes a Gemini evaluation to Gemini exactly as before', () => {
    render(<AiMatchResultView match={{ ...MATCH, provider: 'GEMINI', model: 'gemini-3.7-flash' }} />)
    expect(screen.getByText(/^GEMINI · gemini-3\.7-flash · \d/)).toBeInTheDocument()
    expect(screen.queryByText(/External AI/)).not.toBeInTheDocument()
  })

  it('omits empty Matching / Gaps / Concerns sections like before', () => {
    render(<AiMatchResultView match={{ ...MATCH, matchingSkills: [], missingSkills: [], concerns: [] }} />)
    expect(screen.queryByText('Matching')).not.toBeInTheDocument()
    expect(screen.queryByText('Gaps')).not.toBeInTheDocument()
    expect(screen.queryByText('Concerns')).not.toBeInTheDocument()
  })

  it('formats attribution without a date dependency', () => {
    expect(matchAttribution({ provider: 'EXTERNAL_AI', model: null })).toBe('External AI')
    expect(matchAttribution({ provider: 'EXTERNAL_AI', model: 'Claude Opus 5.5' })).toBe('External AI · Claude Opus 5.5')
    expect(matchAttribution({ provider: 'ANTHROPIC', model: 'claude-x' })).toBe('ANTHROPIC · claude-x')
  })
})
