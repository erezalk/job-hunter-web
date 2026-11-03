import { describe, expect, it } from 'vitest'
import type { UpcomingStage } from '../api/applications'
import { formatStageSchedule } from '../board/stageTime'
import { formatUpcomingSchedule, formatUpcomingTime, selectUpcoming } from './upcomingStages'

// Dates are built from local calendar fields, so the suite behaves the same in any timezone it runs in.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min)
const iso = (date: Date) => date.toISOString()

function stage(stageId: number, scheduledAt: string | null, name = `Stage ${stageId}`): UpcomingStage {
  return {
    stageId,
    stageName: name,
    scheduledAt: scheduledAt as string,
    scheduledEndAt: null,
    applicationId: stageId * 10,
    jobId: stageId * 100,
    jobTitle: 'Backend Engineer',
    companyName: 'Acme',
  }
}

describe('selectUpcoming', () => {
  const now = local(2026, 10, 13, 12, 0)

  it('keeps only stages scheduled strictly after now, compared as instants', () => {
    const result = selectUpcoming(
      [
        stage(1, iso(local(2026, 10, 13, 11, 59))), // past
        stage(2, iso(now)), // exactly now is not "future"
        stage(3, iso(local(2026, 10, 13, 12, 1))),
        stage(4, null), // unscheduled
      ],
      now.getTime(),
    )
    expect(result.map((s) => s.stageId)).toEqual([3])
  })

  it('sorts nearest first regardless of input order, ties by stage id', () => {
    const same = iso(local(2026, 10, 14, 15, 0))
    const result = selectUpcoming(
      [
        stage(5, iso(local(2026, 11, 2, 9, 0))),
        stage(7, same),
        stage(3, iso(local(2026, 10, 18, 11, 30))),
        stage(6, same),
        stage(4, iso(local(2026, 10, 14, 10, 0))),
      ],
      now.getTime(),
    )
    expect(result.map((s) => s.stageId)).toEqual([4, 6, 7, 3, 5])
  })

  it('handles missing data', () => {
    expect(selectUpcoming(undefined, now.getTime())).toEqual([])
  })
})

describe('formatUpcomingTime', () => {
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const now = local(2026, 10, 13, 12, 0)

  it('says Today for a later time on the same local day', () => {
    const at = local(2026, 10, 13, 14, 0)
    expect(formatUpcomingTime(iso(at), now)).toBe(`Today, ${time(at)}`)
  })

  it('says Tomorrow for the next local day', () => {
    const at = local(2026, 10, 14, 10, 30)
    expect(formatUpcomingTime(iso(at), now)).toBe(`Tomorrow, ${time(at)}`)
  })

  it('uses local calendar days, not 24-hour distance, around midnight', () => {
    const lateEvening = local(2026, 10, 13, 23, 45)
    const justAfterMidnight = local(2026, 10, 14, 0, 30)
    expect(formatUpcomingTime(iso(justAfterMidnight), lateEvening)).toBe(`Tomorrow, ${time(justAfterMidnight)}`)
    const earlyMorning = local(2026, 10, 13, 0, 10)
    const lateTonight = local(2026, 10, 13, 23, 30)
    expect(formatUpcomingTime(iso(lateTonight), earlyMorning)).toBe(`Today, ${time(lateTonight)}`)
  })

  it('handles month and year boundaries for Tomorrow', () => {
    const at = local(2027, 1, 1, 9, 0)
    expect(formatUpcomingTime(iso(at), local(2026, 12, 31, 20, 0))).toMatch(/^Tomorrow, /)
  })

  it('uses the short date style of the Ticket Drawer otherwise', () => {
    const at = local(2026, 10, 18, 10, 30)
    const text = formatUpcomingTime(iso(at), now)
    expect(text).toBe(at.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
    expect(text).not.toMatch(/Today|Tomorrow|2026/)
  })

  it('adds the year only when it differs from the current year', () => {
    expect(formatUpcomingTime(iso(local(2027, 3, 5, 10, 0)), now)).toContain('2027')
  })
})

describe('formatUpcomingSchedule', () => {
  const now = local(2026, 10, 13, 12, 0)
  const day = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const occurrences = (text: string, part: string) => text.split(part).length - 1

  it('without an end time is exactly the existing display', () => {
    const start = local(2026, 11, 6, 15, 0)
    expect(formatUpcomingSchedule(iso(start), null, now)).toBe(formatUpcomingTime(iso(start), now))
    expect(formatUpcomingSchedule(iso(start), undefined, now)).toBe(formatUpcomingTime(iso(start), now))
  })

  it('shows a same-day end as a compact range without repeating the date', () => {
    const start = local(2026, 11, 6, 15, 0)
    const end = local(2026, 11, 6, 16, 0)
    const text = formatUpcomingSchedule(iso(start), iso(end), now)
    expect(text).toBe(`${formatUpcomingTime(iso(start), now)} – ${time(end)}`)
    expect(occurrences(text, day(start))).toBe(1)
  })

  it('keeps the Today / Tomorrow style of the start in a same-day range', () => {
    expect(formatUpcomingSchedule(iso(local(2026, 10, 13, 15, 0)), iso(local(2026, 10, 13, 16, 0)), now)).toMatch(/^Today, .* – /)
    expect(formatUpcomingSchedule(iso(local(2026, 10, 14, 10, 0)), iso(local(2026, 10, 14, 11, 0)), now)).toMatch(/^Tomorrow, .* – /)
  })

  it('writes both ends out when the stage spans days', () => {
    const start = local(2026, 11, 6, 23, 0)
    const end = local(2026, 11, 7, 1, 0)
    const text = formatUpcomingSchedule(iso(start), iso(end), now)
    expect(text).toBe(`${formatUpcomingTime(iso(start), now)} – ${formatUpcomingTime(iso(end), now)}`)
    expect(text).toContain(day(start))
    expect(text).toContain(day(end))
  })

  it('matches the Ticket Drawer wording for the same stage when the date is not relative', () => {
    const start = iso(local(2026, 11, 6, 15, 0))
    const end = iso(local(2026, 11, 6, 16, 0))
    expect(formatUpcomingSchedule(start, end, now)).toBe(formatStageSchedule(start, end))
    const lateEnd = iso(local(2026, 11, 7, 1, 0))
    const lateStart = iso(local(2026, 11, 6, 23, 0))
    expect(formatUpcomingSchedule(lateStart, lateEnd, now)).toBe(formatStageSchedule(lateStart, lateEnd))
  })
})
