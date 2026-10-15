import { describe, expect, it } from 'vitest'
import type { BoardCard } from '../api/board'
import { EMPTY_FILTERS, effectiveDateRange, filterCards, hasActiveFilters, type BoardFilters } from './boardFilters'

// All dates are built from LOCAL calendar components, so the tests behave the
// same in any timezone the suite runs in. "Today" is fixed: Oct 10, 2026.
const NOW = new Date(2026, 9, 10, 15, 0)

let nextId = 1
function card(overrides: Partial<BoardCard> & { at: Date }): BoardCard {
  const { at, ...rest } = overrides
  return {
    applicationId: nextId++,
    jobId: 1,
    title: 'Engineer',
    companyName: 'Acme',
    location: null,
    workModel: null,
    statusCode: 'NEW',
    starred: false,
    fitScore: null,
    discoveredAt: at.toISOString(),
    ...rest,
  } as BoardCard
}

const filters = (patch: Partial<BoardFilters>): BoardFilters => ({ ...EMPTY_FILTERS, ...patch })
const day = (month: number, d: number, h = 12, m = 0) => new Date(2026, month - 1, d, h, m)
const ids = (cards: BoardCard[]) => cards.map((c) => c.applicationId)

describe('date presets (calendar days)', () => {
  it('Any time applies no date restriction', () => {
    const cards = [card({ at: day(1, 1) }), card({ at: day(10, 10) })]
    expect(filterCards(cards, EMPTY_FILTERS, NOW)).toEqual(cards)
    expect(effectiveDateRange(EMPTY_FILTERS, NOW)).toEqual({ from: '', to: '' })
  })

  it('Today keeps only today, from 00:00 to 23:59', () => {
    const start = card({ at: day(10, 10, 0, 0) })
    const end = card({ at: day(10, 10, 23, 59) })
    const yesterday = card({ at: day(10, 9, 23, 59) })
    const result = filterCards([yesterday, start, end], filters({ datePreset: 'TODAY' }), NOW)
    expect(ids(result)).toEqual([start.applicationId, end.applicationId])
  })

  it('Last 7 days is today + previous 6 calendar dates (Oct 4 - Oct 10)', () => {
    expect(effectiveDateRange(filters({ datePreset: 'LAST_7' }), NOW)).toEqual({ from: '2026-10-04', to: '2026-10-10' })
    const first = card({ at: day(10, 4, 0, 0) })
    const last = card({ at: day(10, 10, 23, 59) })
    const tooOld = card({ at: day(10, 3, 23, 59) })
    const result = filterCards([tooOld, first, last], filters({ datePreset: 'LAST_7' }), NOW)
    expect(ids(result)).toEqual([first.applicationId, last.applicationId])
  })

  it('Last 30 days is today + previous 29 calendar dates (Sep 11 - Oct 10)', () => {
    expect(effectiveDateRange(filters({ datePreset: 'LAST_30' }), NOW)).toEqual({ from: '2026-09-11', to: '2026-10-10' })
    const first = card({ at: day(9, 11, 0, 0) })
    const tooOld = card({ at: day(9, 10, 23, 59) })
    const result = filterCards([tooOld, first], filters({ datePreset: 'LAST_30' }), NOW)
    expect(ids(result)).toEqual([first.applicationId])
  })

  it('is not a rolling window: Today at 00:10 still excludes 23:50 yesterday, includes 00:05 today', () => {
    const justAfterMidnight = day(10, 10, 0, 10)
    const yesterdayLate = card({ at: day(10, 9, 23, 50) }) // 20 minutes ago
    const todayEarly = card({ at: day(10, 10, 0, 5) })
    const result = filterCards([yesterdayLate, todayEarly], filters({ datePreset: 'TODAY' }), justAfterMidnight)
    expect(ids(result)).toEqual([todayEarly.applicationId])
  })

  it('Last 7 days is not 168 hours', () => {
    const now = day(10, 10, 23, 0)
    const within168h = card({ at: day(10, 3, 23, 30) }) // 167.5 hours ago, but Oct 3
    const inCalendarWindow = card({ at: day(10, 4, 0, 10) }) // Oct 4: included
    const result = filterCards([within168h, inCalendarWindow], filters({ datePreset: 'LAST_7' }), now)
    expect(ids(result)).toEqual([inCalendarWindow.applicationId])
  })

  it('Last 30 days is not 720 hours', () => {
    const now = day(10, 10, 23, 0)
    const within720h = card({ at: day(9, 10, 23, 30) }) // 719.5 hours ago, but Sep 10
    const inCalendarWindow = card({ at: day(9, 11, 0, 10) })
    const result = filterCards([within720h, inCalendarWindow], filters({ datePreset: 'LAST_30' }), now)
    expect(ids(result)).toEqual([inCalendarWindow.applicationId])
  })

  it('crosses month and year boundaries by calendar date', () => {
    const newYear = new Date(2027, 0, 2, 10, 0)
    expect(effectiveDateRange(filters({ datePreset: 'LAST_7' }), newYear)).toEqual({ from: '2026-12-27', to: '2027-01-02' })
  })
})

describe('custom range and hidden values', () => {
  const cards = [card({ at: day(10, 1) }), card({ at: day(10, 5) }), card({ at: day(10, 9) })]

  it('Custom range keeps the existing From/To behaviour (inclusive, open ends)', () => {
    const custom = filters({ datePreset: 'CUSTOM', from: '2026-10-05', to: '2026-10-09' })
    expect(ids(filterCards(cards, custom, NOW))).toEqual([cards[1].applicationId, cards[2].applicationId])
    expect(ids(filterCards(cards, filters({ datePreset: 'CUSTOM', from: '2026-10-05' }), NOW))).toHaveLength(2)
    expect(ids(filterCards(cards, filters({ datePreset: 'CUSTOM', to: '2026-10-05' }), NOW))).toHaveLength(2)
  })

  it('switching away from Custom range stops using the old From/To values', () => {
    const stale = { from: '2026-10-05', to: '2026-10-05' }
    expect(filterCards(cards, filters({ datePreset: 'ANY', ...stale }), NOW)).toEqual(cards)
    expect(hasActiveFilters(filters({ datePreset: 'ANY', ...stale }))).toBe(false)
    expect(effectiveDateRange(filters({ datePreset: 'LAST_7', ...stale }), NOW).from).toBe('2026-10-04')
  })
})

describe('combination, clearing and ordering', () => {
  it('Date combines with Company and Starred', () => {
    const match = card({ at: day(10, 8), companyName: '1GLOBAL', starred: true })
    const wrongCompany = card({ at: day(10, 8), companyName: 'Other', starred: true })
    const notStarred = card({ at: day(10, 8), companyName: '1GLOBAL' })
    const tooOld = card({ at: day(8, 1), companyName: '1GLOBAL', starred: true })
    const active = filters({ company: '1global', datePreset: 'LAST_30', starred: true })
    expect(ids(filterCards([wrongCompany, notStarred, tooOld, match], active, NOW))).toEqual([match.applicationId])
  })

  it('a non-Any-time preset counts as active; resetting to EMPTY_FILTERS clears Date and custom values', () => {
    const active = filters({ datePreset: 'CUSTOM', from: '2026-10-01', to: '2026-10-02' })
    expect(hasActiveFilters(active)).toBe(true)
    expect(EMPTY_FILTERS.datePreset).toBe('ANY')
    expect(EMPTY_FILTERS.from).toBe('')
    expect(EMPTY_FILTERS.to).toBe('')
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
  })

  it('filtering keeps the persisted order and never mutates the input list', () => {
    const cards = [card({ at: day(10, 10) }), card({ at: day(10, 2) }), card({ at: day(10, 9) }), card({ at: day(10, 8) })]
    const before = ids(cards)
    const shown = filterCards(cards, filters({ datePreset: 'LAST_7' }), NOW)
    expect(ids(shown)).toEqual([cards[0].applicationId, cards[2].applicationId, cards[3].applicationId])
    expect(ids(cards)).toEqual(before)
    expect(ids(filterCards(cards, EMPTY_FILTERS, NOW))).toEqual(before)
  })
})
