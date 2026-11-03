import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ApplicationStage } from '../api/applications'
import { StageDialog } from './StageDialog'

// Built from local calendar fields (what a datetime-local input shows), so it passes in any timezone.
const local = (h: number, min = 0) => new Date(2026, 9, 29, h, min).toISOString()
const NOW = new Date().toISOString()

const STAGE: ApplicationStage = {
  id: 5, name: 'Phone screen', scheduledAt: local(13), scheduledEndAt: local(14), interviewerNames: 'Dana', notes: 'Asked about Spring',
  outcome: 'Passed', createdAt: NOW, updatedAt: NOW,
}
const WITHOUT_END: ApplicationStage = { ...STAGE, scheduledEndAt: null }

function renderDialog(stage: ApplicationStage | null) {
  const onSubmit = vi.fn()
  render(<StageDialog open stage={stage} onClose={vi.fn()} onSubmit={onSubmit} submitting={false} error={null} />)
  return onSubmit
}

const startField = () => screen.getByLabelText('Scheduled at')
const endField = () => screen.getByLabelText('Ends at (optional)')
const save = () => screen.getByRole('button', { name: 'Save' })
const setLocal = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } })

describe('Add Stage', () => {
  it('saves with only a start time and sends no end time', async () => {
    const onSubmit = renderDialog(null)
    await userEvent.type(screen.getByLabelText(/Stage name/), 'Recruiter call')
    setLocal(startField(), '2026-10-29T13:00')

    expect(endField()).toHaveValue('')
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Recruiter call', scheduledAt: local(13), scheduledEndAt: null }))
  })

  it('saves with no times at all, as before', async () => {
    const onSubmit = renderDialog(null)
    await userEvent.type(screen.getByLabelText(/Stage name/), 'Take-home')
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: null, scheduledEndAt: null }))
  })

  it('accepts an end time after the start', async () => {
    const onSubmit = renderDialog(null)
    await userEvent.type(screen.getByLabelText(/Stage name/), 'Tech interview')
    setLocal(startField(), '2026-10-29T13:00')
    setLocal(endField(), '2026-10-29T14:00')
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: local(13), scheduledEndAt: local(14) }))
  })

  it('cannot be saved with an end equal to or before the start, and says why', async () => {
    const onSubmit = renderDialog(null)
    await userEvent.type(screen.getByLabelText(/Stage name/), 'Tech interview')
    setLocal(startField(), '2026-10-29T13:00')

    setLocal(endField(), '2026-10-29T13:00')
    expect(screen.getByText('End must be after the start')).toBeInTheDocument()
    expect(save()).toBeDisabled()
    setLocal(endField(), '2026-10-29T12:00')
    expect(save()).toBeDisabled()

    setLocal(endField(), '2026-10-29T15:00')
    expect(screen.queryByText('End must be after the start')).not.toBeInTheDocument()
    expect(save()).toBeEnabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('cannot be saved with an end but no start', async () => {
    renderDialog(null)
    await userEvent.type(screen.getByLabelText(/Stage name/), 'Tech interview')
    setLocal(endField(), '2026-10-29T14:00')

    expect(screen.getByText('Set a start time before an end time')).toBeInTheDocument()
    expect(save()).toBeDisabled()
  })
})

describe('Edit Stage', () => {
  it('loads the existing end time and the rest of the stage', () => {
    renderDialog(STAGE)

    expect(startField()).toHaveValue('2026-10-29T13:00')
    expect(endField()).toHaveValue('2026-10-29T14:00')
    expect(screen.getByLabelText(/Stage name/)).toHaveValue('Phone screen')
    expect(screen.getByLabelText('Interviewer names')).toHaveValue('Dana')
    expect(screen.getByLabelText('Outcome')).toHaveValue('Passed')
    expect(screen.getByLabelText('Notes')).toHaveValue('Asked about Spring')
  })

  it('leaves the end empty for a stage that has none and saves it unchanged', async () => {
    const onSubmit = renderDialog(WITHOUT_END)
    expect(endField()).toHaveValue('')

    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Phone screen', scheduledAt: local(13), scheduledEndAt: null, interviewerNames: 'Dana', notes: 'Asked about Spring', outcome: 'Passed',
    })
  })

  it('can add an end time to a stage that has none', async () => {
    const onSubmit = renderDialog(WITHOUT_END)
    setLocal(endField(), '2026-10-29T13:45')
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ scheduledEndAt: local(13, 45) }))
  })

  it('can change the end time', async () => {
    const onSubmit = renderDialog(STAGE)
    setLocal(endField(), '2026-10-29T15:30')
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: local(13), scheduledEndAt: local(15, 30) }))
  })

  it('always sends scheduledEndAt, even when the loaded stage has no such property, so the server never has to guess', async () => {
    const legacy = { ...WITHOUT_END } as Partial<ApplicationStage>
    delete legacy.scheduledEndAt
    const onSubmit = renderDialog(legacy as ApplicationStage)
    await userEvent.click(save())

    expect(onSubmit.mock.calls[0][0]).toHaveProperty('scheduledEndAt', null)
  })

  it('can remove the end time, sending null so the stage has no end again', async () => {
    const onSubmit = renderDialog(STAGE)
    setLocal(endField(), '')
    expect(save()).toBeEnabled()
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Phone screen', scheduledAt: local(13), scheduledEndAt: null, interviewerNames: 'Dana', notes: 'Asked about Spring', outcome: 'Passed',
    })
  })

  it('keeps a valid end when only the start moves earlier', async () => {
    const onSubmit = renderDialog(STAGE)
    setLocal(startField(), '2026-10-29T13:30')
    await userEvent.click(save())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: local(13, 30), scheduledEndAt: local(14) }))
  })

  it('does not silently drop or change the end when the start moves to or past it: saving is blocked until one is fixed', async () => {
    renderDialog(STAGE)
    setLocal(startField(), '2026-10-29T14:00')

    expect(endField()).toHaveValue('2026-10-29T14:00')
    expect(screen.getByText('End must be after the start')).toBeInTheDocument()
    expect(save()).toBeDisabled()

    setLocal(startField(), '2026-10-29T16:00')
    expect(endField()).toHaveValue('2026-10-29T14:00')
    expect(save()).toBeDisabled()

    // Fixing the end (or moving the start back) re-enables saving.
    setLocal(endField(), '2026-10-29T17:00')
    expect(save()).toBeEnabled()
  })
})
