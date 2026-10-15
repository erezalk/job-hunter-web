import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BoardFilterBar } from './BoardFilterBar'
import { EMPTY_FILTERS, type BoardFilters } from './boardFilters'

function renderBar(filters: BoardFilters, handlers: { onChange?: (f: BoardFilters) => void; onClear?: () => void } = {}) {
  return render(
    <BoardFilterBar
      filters={filters}
      companies={['Acme']}
      shownCount={1}
      totalCount={2}
      onChange={handlers.onChange ?? vi.fn()}
      onClear={handlers.onClear ?? vi.fn()}
    />,
  )
}

describe('BoardFilterBar date selector', () => {
  it('offers exactly the five presets', async () => {
    renderBar(EMPTY_FILTERS)
    await userEvent.click(screen.getByRole('combobox', { name: 'Date' }))
    const labels = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
    expect(labels).toEqual(['Any time', 'Today', 'Last 7 days', 'Last 30 days', 'Custom range'])
  })

  it('selecting a preset applies it immediately', async () => {
    const onChange = vi.fn()
    renderBar(EMPTY_FILTERS, { onChange })
    await userEvent.click(screen.getByRole('combobox', { name: 'Date' }))
    await userEvent.click(screen.getByRole('option', { name: 'Last 7 days' }))
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, datePreset: 'LAST_7' })
  })

  it.each(['ANY', 'TODAY', 'LAST_7', 'LAST_30'] as const)('hides From/To for %s even when old custom values exist', (datePreset) => {
    renderBar({ ...EMPTY_FILTERS, datePreset, from: '2026-10-01', to: '2026-10-02' })
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('To')).not.toBeInTheDocument()
  })

  it('shows From/To only for Custom range', () => {
    renderBar({ ...EMPTY_FILTERS, datePreset: 'CUSTOM', from: '2026-10-01' })
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-01')
    expect(screen.getByLabelText('To')).toBeInTheDocument()
  })

  it('Clear filters is offered when Date is not Any time and calls onClear', async () => {
    const onClear = vi.fn()
    renderBar({ ...EMPTY_FILTERS, datePreset: 'TODAY' }, { onClear })
    await userEvent.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(onClear).toHaveBeenCalled()
  })

  it('does not offer Clear filters at Any time', () => {
    renderBar(EMPTY_FILTERS)
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()
  })
})
