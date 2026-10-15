import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Application } from '../api/applications'
import * as boardApi from '../api/board'
import { AddJobDialog } from './AddJobDialog'

function apiError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() }
  const response: AxiosResponse = { status, data, statusText: '', headers: {}, config }
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response)
}

const APPLICATION = { id: 1, jobId: 10 } as Application

function renderDialog() {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <AddJobDialog open onClose={onClose} />
    </QueryClientProvider>,
  )
  return onClose
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText(/Title/), 'Backend Engineer')
  await userEvent.type(screen.getByLabelText(/Job URL/), 'linkedin.com/jobs/123')
  await userEvent.click(screen.getByRole('button', { name: 'Add & track in New' }))
}

beforeEach(() => {
  vi.spyOn(boardApi, 'fetchBoard').mockResolvedValue([])
})
afterEach(() => vi.restoreAllMocks())

describe('Add Job validation errors', () => {
  it('shows a backend field error on its field and keeps the dialog and the entered values', async () => {
    const add = vi.spyOn(boardApi, 'addAndTrackJob').mockRejectedValue(apiError(400, {
      status: 400, message: 'Validation failed',
      fieldErrors: [{ field: 'url', message: 'Enter a valid http(s) URL' }],
    }))
    const onClose = renderDialog()

    await fillAndSubmit()

    expect(add).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Enter a valid http(s) URL')).toBeInTheDocument()
    expect(screen.getByLabelText(/Job URL/)).toHaveAccessibleDescription('Enter a valid http(s) URL')
    expect(screen.getByLabelText(/Job URL/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Add Job' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/)).toHaveValue('Backend Engineer')
    expect(screen.getByLabelText(/Job URL/)).toHaveValue('linkedin.com/jobs/123')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still shows a non-field API error as the general error', async () => {
    vi.spyOn(boardApi, 'addAndTrackJob').mockRejectedValue(
      apiError(400, { status: 400, message: 'salaryMin must not be greater than salaryMax', fieldErrors: [] }),
    )
    const onClose = renderDialog()

    await fillAndSubmit()

    expect(await screen.findByRole('alert')).toHaveTextContent('salaryMin must not be greater than salaryMax')
    expect(screen.getByLabelText(/Title/)).toHaveValue('Backend Engineer')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a successful add still closes the dialog as before', async () => {
    const add = vi.spyOn(boardApi, 'addAndTrackJob').mockResolvedValue({ application: APPLICATION, alreadyOnBoard: false })
    const onClose = renderDialog()

    await fillAndSubmit()

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ title: 'Backend Engineer', url: 'linkedin.com/jobs/123' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('an already-tracked job still reports that it is on the Board', async () => {
    vi.spyOn(boardApi, 'addAndTrackJob').mockResolvedValue({ application: APPLICATION, alreadyOnBoard: true })
    const onClose = renderDialog()

    await fillAndSubmit()

    expect(await screen.findByText('This job is already on your Board.')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
