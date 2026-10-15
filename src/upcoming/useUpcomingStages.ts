import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchUpcomingStages } from '../api/applications'
import { selectUpcoming, UPCOMING_STAGES_QUERY_KEY } from './upcomingStages'

// setTimeout overflows (fires immediately) beyond ~24.8 days.
const MAX_TIMER_MS = 2_000_000_000
// Land just after the instant so the stage is certainly in the past when we re-check.
const TIMER_MARGIN_MS = 50

// The user's future scheduled stages, nearest first. The server returns what
// is in the future when it answers; as time passes while the app stays open,
// a single timer for the nearest stage re-filters the cached list (no polling,
// no refetch), and mutations refresh it through query invalidation.
export function useUpcomingStages() {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: UPCOMING_STAGES_QUERY_KEY, queryFn: fetchUpcomingStages })
  const [clockMs, setClockMs] = useState(() => Date.now())

  // The clock only moves forward: it is advanced by the timer and on refresh,
  // and a fetch that completes later than it also counts as "now".
  const nowMs = Math.max(clockMs, query.dataUpdatedAt)
  const upcoming = useMemo(() => selectUpcoming(query.data, nowMs), [query.data, nowMs])
  const nextAt = upcoming.length > 0 ? Date.parse(upcoming[0].scheduledAt) : null

  useEffect(() => {
    if (nextAt === null) return
    const delay = Math.min(Math.max(nextAt - Date.now(), 0) + TIMER_MARGIN_MS, MAX_TIMER_MS)
    const timer = setTimeout(() => setClockMs(Date.now()), delay)
    return () => clearTimeout(timer)
  }, [nextAt, nowMs])

  // Fresh data and a fresh "now" (e.g. when the list is opened).
  const refresh = useCallback(() => {
    setClockMs(Date.now())
    queryClient.invalidateQueries({ queryKey: UPCOMING_STAGES_QUERY_KEY })
  }, [queryClient])

  return { upcoming, isLoading: query.isLoading, isError: query.isError, refresh }
}
