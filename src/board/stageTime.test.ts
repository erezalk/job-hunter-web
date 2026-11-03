import { describe, expect, it } from 'vitest'
import { formatStageDateTime, formatStageSchedule, stageEndError } from './stageTime'

// Dates are built from local calendar fields, so the suite behaves the same in any timezone it runs in.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString()
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const occurrences = (text: string, part: string) => text.split(part).length - 1
const plain = (text: string) => text.replace(/\s/g, ' ')

describe('formatStageSchedule', () => {
  const start = local(2026, 10, 29, 13, 0)

  it('without an end time reads exactly as a stage always did', () => {
    expect(formatStageSchedule(start, null)).toBe(formatStageDateTime(start))
    expect(formatStageSchedule(start, undefined)).toBe(formatStageDateTime(start))
    expect(formatStageSchedule(null, null)).toBe('Not scheduled')
  })

  it('shows a same-day range with the date only once', () => {
    const text = formatStageSchedule(start, local(2026, 10, 29, 14, 0))
    expect(text).toContain(' – ')
    expect(occurrences(text, day(start))).toBe(1)
    expect(text.startsWith(formatStageDateTime(start))).toBe(true)
  })

  it.runIf(Intl.DateTimeFormat().resolvedOptions().locale.startsWith('en-US'))('formats the same-day example as "Oct 29, 01:00 PM – 02:00 PM"', () => {
    expect(plain(formatStageSchedule(start, local(2026, 10, 29, 14, 0)))).toBe('Oct 29, 01:00 PM – 02:00 PM')
  })

  it('shows both dates and times when the end is on another day', () => {
    const lateStart = local(2026, 10, 29, 23, 0)
    const end = local(2026, 10, 30, 1, 0)
    const text = formatStageSchedule(lateStart, end)
    expect(text).toBe(`${formatStageDateTime(lateStart)} – ${formatStageDateTime(end)}`)
    expect(text).toContain(day(lateStart))
    expect(text).toContain(day(end))
    expect(day(lateStart)).not.toBe(day(end))
  })

  it('adds the year to both sides when the range crosses a year', () => {
    const text = formatStageSchedule(local(2026, 12, 31, 23, 0), local(2027, 1, 1, 1, 0))
    expect(text).toContain('2026')
    expect(text).toContain('2027')
  })

  it('treats the end as the same day only by local calendar day, not by 24 hours', () => {
    const text = formatStageSchedule(local(2026, 10, 29, 9, 0), local(2026, 10, 30, 8, 0))
    expect(occurrences(text, day(local(2026, 10, 30)))).toBe(1)
    expect(occurrences(text, day(local(2026, 10, 29)))).toBe(1)
  })
})

describe('stageEndError', () => {
  const start = local(2026, 10, 29, 13, 0)

  it('allows no end time at all, with or without a start', () => {
    expect(stageEndError(start, null)).toBeNull()
    expect(stageEndError(null, null)).toBeNull()
    expect(stageEndError(undefined, undefined)).toBeNull()
  })

  it('allows an end strictly after the start', () => {
    expect(stageEndError(start, local(2026, 10, 29, 13, 1))).toBeNull()
  })

  it('rejects an end equal to or before the start', () => {
    expect(stageEndError(start, start)).toMatch(/after the start/)
    expect(stageEndError(start, local(2026, 10, 29, 12, 0))).toMatch(/after the start/)
  })

  it('rejects an end without a start', () => {
    expect(stageEndError(null, start)).toMatch(/start time/)
  })
})
