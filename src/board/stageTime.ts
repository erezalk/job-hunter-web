// Same options the Ticket Drawer has always used for a stage's date, so a stage
// reads identically everywhere (browser locale and the browser's local time).
const DATE_TIME: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
const TIME: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

// "Oct 29, 01:00 PM"; a stage without a start is "Not scheduled".
export function formatStageDateTime(iso: string | null, withYear = false): string {
  if (!iso) return 'Not scheduled'
  return new Date(iso).toLocaleString(undefined, withYear ? { ...DATE_TIME, year: 'numeric' } : DATE_TIME)
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// The one range rule, shared by the Ticket Drawer and the Upcoming Stages popup; `formatPoint`
// is each place's own way of writing a single date/time.
//   same local day  -> "<start> – 02:00 PM" (the date is not repeated)
//   different days  -> "<start> – <end>" (both fully written)
export function joinStageRange(startIso: string, endIso: string, formatPoint: (iso: string) => string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (sameLocalDay(start, end)) {
    return `${formatPoint(startIso)} – ${end.toLocaleTimeString(undefined, TIME)}`
  }
  return `${formatPoint(startIso)} – ${formatPoint(endIso)}`
}

// Ticket Drawer text. Without an end this is exactly formatStageDateTime. With one:
//   "Oct 29, 01:00 PM – 02:00 PM" or "Oct 29, 11:00 PM – Oct 30, 01:00 AM"
// (with the year on both sides when the range crosses a year).
export function formatStageSchedule(startIso: string | null, endIso: string | null | undefined): string {
  if (!startIso || !endIso) return formatStageDateTime(startIso)
  const withYear = new Date(startIso).getFullYear() !== new Date(endIso).getFullYear()
  return joinStageRange(startIso, endIso, (iso) => formatStageDateTime(iso, withYear))
}

// Why the start/end pair cannot be saved, or null when it can. An end is optional,
// but when present it needs a start and must be strictly after it (the server enforces the same).
export function stageEndError(startIso: string | null | undefined, endIso: string | null | undefined): string | null {
  if (!endIso) return null
  if (!startIso) return 'Set a start time before an end time'
  if (Date.parse(endIso) <= Date.parse(startIso)) return 'End must be after the start'
  return null
}
