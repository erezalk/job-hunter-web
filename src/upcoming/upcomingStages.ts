import type { UpcomingStage } from '../api/applications'

// Cache key of GET /api/stages/upcoming; stage/job mutations invalidate it.
export const UPCOMING_STAGES_QUERY_KEY = ['upcomingStages']

// Future = scheduled strictly after `nowMs`, compared as instants (never as
// formatted strings). Nearest first; equal instants fall back to the stage id
// so the order is deterministic.
export function selectUpcoming(stages: UpcomingStage[] | undefined, nowMs: number): UpcomingStage[] {
  return (stages ?? [])
    .filter((s) => s.scheduledAt && Date.parse(s.scheduledAt) > nowMs)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.stageId - b.stageId)
}

// Same options the Ticket Drawer uses for a stage's date, so a stage reads
// identically in both places (browser locale and the browser's local time).
const TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }

// "Today, 14:00" / "Tomorrow, 10:30" / "Oct 18, 10:30" (+ year when it isn't this year).
// Today/Tomorrow are local calendar days, so they are right around midnight and across DST changes.
export function formatUpcomingTime(iso: string, now: Date): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString(undefined, TIME_OPTIONS)
  const startOfDay = (d: Date, offsetDays = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays).getTime()
  const day = startOfDay(date)
  if (day === startOfDay(now)) return `Today, ${time}`
  if (day === startOfDay(now, 1)) return `Tomorrow, ${time}`
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
    ...TIME_OPTIONS,
  })
}
