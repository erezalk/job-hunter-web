import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as jobDataApi from '../../api/jobData'
import { DataSettings } from './DataSettings'

function apiError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  const response: AxiosResponse = { status, data, statusText: '', headers: {}, config }
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response)
}

const FILE_CONTENT = '{"format":"job-hunter-jobs","formatVersion":1,"exportedAt":"2025-06-01T00:00:00Z","jobs":[]}'

function renderData() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <DataSettings />
    </QueryClientProvider>,
  )
  return { invalidate }
}

async function chooseFile() {
  const file = new File([FILE_CONTENT], 'job-hunter-export-2025-06-01.json', { type: 'application/json' })
  await userEvent.upload(screen.getByTestId('job-data-file'), file)
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:export')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('Data settings', () => {
  it('explains that CV, account information, settings and secrets are not included, and offers no destructive action', () => {
    renderData()

    expect(screen.getByText(/CV, account information, settings and secrets are not included/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear|replace|delete|overwrite/i })).not.toBeInTheDocument()
  })

  it('downloads the export as a file', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' })
    const exportCall = vi.spyOn(jobDataApi, 'fetchJobDataExport').mockResolvedValue({ blob, fileName: 'job-hunter-export-2025-06-01.json' })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderData()

    await userEvent.click(screen.getByRole('button', { name: 'Export job data' }))

    expect(exportCall).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })

  it('shows the server message when the export fails', async () => {
    const body = new Blob([JSON.stringify({ status: 500, message: 'An unexpected error occurred' })], { type: 'application/json' })
    vi.spyOn(jobDataApi, 'fetchJobDataExport').mockRejectedValue(apiError(500, body))
    renderData()

    await userEvent.click(screen.getByRole('button', { name: 'Export job data' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('An unexpected error occurred')
  })

  it('imports only after a file is chosen and the confirmation is accepted, then refreshes the Board', async () => {
    const importCall = vi.spyOn(jobDataApi, 'importJobData').mockResolvedValue({ jobs: 3, stages: 2, statusHistoryEntries: 5, aiMatches: 1 })
    const { invalidate } = renderData()
    expect(screen.getByRole('button', { name: 'Import job data' })).toBeDisabled()

    await chooseFile()
    expect(screen.getByText('job-hunter-export-2025-06-01.json')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Import job data' }))

    const dialog = await screen.findByRole('dialog', { name: 'Import job data?' })
    expect(dialog).toHaveTextContent('rejected if you already have jobs on your Board')
    expect(importCall).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

    expect(importCall).toHaveBeenCalledWith(FILE_CONTENT)
    expect(await screen.findByText(/Imported 3 jobs with 2 stages, 5 status history entries and 1 AI matches/)).toBeInTheDocument()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['board'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['upcomingStages'] })
  })

  it('cancelling the confirmation imports nothing', async () => {
    const importCall = vi.spyOn(jobDataApi, 'importJobData')
    renderData()
    await chooseFile()
    await userEvent.click(screen.getByRole('button', { name: 'Import job data' }))

    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))

    expect(importCall).not.toHaveBeenCalled()
  })

  it('shows why the server rejected the import, including problems in the file', async () => {
    vi.spyOn(jobDataApi, 'importJobData').mockRejectedValue(apiError(400, {
      status: 400, message: 'The import file is invalid',
      fieldErrors: [{ field: 'jobs[2].application.status', message: 'unknown status "OUTREACH"' }],
    }))
    const { invalidate } = renderData()
    await chooseFile()
    await userEvent.click(screen.getByRole('button', { name: 'Import job data' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The import file is invalid')
    expect(alert).toHaveTextContent('jobs[2].application.status: unknown status "OUTREACH"')
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('shows the non-empty Board rejection', async () => {
    vi.spyOn(jobDataApi, 'importJobData').mockRejectedValue(apiError(409, {
      status: 409, message: 'Import needs an empty Board, but you already have job data. Nothing was imported or changed.',
    }))
    renderData()
    await chooseFile()
    await userEvent.click(screen.getByRole('button', { name: 'Import job data' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Import' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Import needs an empty Board')
  })
})
