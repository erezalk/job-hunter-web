import type { BoardCard } from '../api/board'

// Filters only decide which cards are drawn. They never touch Application
// status, column visibility, or any persisted data.
export type DatePreset = 'ANY' | 'TODAY' | 'LAST_7' | 'LAST_30' | 'CUSTOM'

export const DATE_PRESET_OPTIONS: { value: DatePreset; label: string }[] = [
  { value: 'ANY', label: 'Any time' },
  { value: 'TODAY', label: 'Today' },
  { value: 'LAST_7', label: 'Last 7 days' },
  { value: 'LAST_30', label: 'Last 30 days' },
  { value: 'CUSTOM', label: 'Custom range' },
]

// Calendar days (today included), not rolling hour windows.
const PRESET_DAYS: Partial<Record<DatePreset, number>> = { TODAY: 1, LAST_7: 7, LAST_30: 30 }

export interface BoardFilters {
  company: string | null
  datePreset: DatePreset
  // Custom-range values. Only applied while datePreset is CUSTOM; kept when the
  // user switches to another preset so re-selecting Custom range restores them.
  from: string // YYYY-MM-DD, '' = unset
  to: string // YYYY-MM-DD, '' = unset
  starred: boolean // true = only starred tickets
}

export const EMPTY_FILTERS: BoardFilters = { company: null, datePreset: 'ANY', from: '', to: '', starred: false }

export function hasActiveFilters(filters: BoardFilters): boolean {
  return filters.company !== null || filters.datePreset !== 'ANY' || filters.starred
}

function companyKey(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase()
}

// Unique (case/whitespace-insensitive), alphabetically sorted company names
// present on the Board data — derived locally, no request per keystroke.
export function companyOptions(cards: BoardCard[]): string[] {
  const byKey = new Map<string, string>()
  for (const card of cards) {
    const name = card.companyName?.replace(/\s+/g, ' ').trim()
    if (name && !byKey.has(companyKey(name))) byKey.set(companyKey(name), name)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

// The option the Company filter uses for `name` (same case/whitespace-insensitive
// identity as the filter itself), or null when no card has that company. Lets a
// caller set the existing Company filter from a job's own company text.
export function resolveCompanyOption(options: string[], name: string | null | undefined): string | null {
  if (!name) return null
  const key = companyKey(name)
  if (!key) return null
  return options.find((option) => companyKey(option) === key) ?? null
}

// Calendar date (in the browser's local time zone) of a Job's discoveredAt.
export function localDateKey(iso: string): string {
  return dateKey(new Date(iso))
}

function dateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

// The inclusive YYYY-MM-DD range the filter currently applies ('' = open end).
// Same local-calendar meaning as localDateKey, so a ticket never changes day
// because of timestamp conversion. `now` is injectable for deterministic tests.
export function effectiveDateRange(filters: BoardFilters, now: Date = new Date()): { from: string; to: string } {
  const days = PRESET_DAYS[filters.datePreset]
  if (days !== undefined) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))
    return { from: dateKey(start), to: dateKey(now) }
  }
  if (filters.datePreset === 'CUSTOM') return { from: filters.from, to: filters.to }
  return { from: '', to: '' }
}

export function filterCards(cards: BoardCard[], filters: BoardFilters, now: Date = new Date()): BoardCard[] {
  if (!hasActiveFilters(filters)) return cards
  const wantedCompany = filters.company ? companyKey(filters.company) : null
  const range = effectiveDateRange(filters, now)
  return cards.filter((card) => {
    if (wantedCompany !== null && companyKey(card.companyName ?? '') !== wantedCompany) return false
    if (filters.starred && !card.starred) return false
    const date = localDateKey(card.discoveredAt)
    if (range.from && date < range.from) return false
    if (range.to && date > range.to) return false
    return true
  })
}
