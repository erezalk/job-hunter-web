import { useQuery } from '@tanstack/react-query'
import { fetchBoard, type BoardCard } from '../api/board'

// Suggestions only — both fields stay free text and are never restricted.
export const CURRENCY_OPTIONS = ['€', '$']
export const WORK_MODEL_OPTIONS = ['Remote', 'Hybrid', 'Onsite']

// Distinct, trimmed, case-insensitively de-duplicated, alphabetical.
export function distinctLocations(cards: BoardCard[]): string[] {
  const seen = new Map<string, string>()
  for (const card of cards) {
    const location = card.location?.trim()
    if (location && !seen.has(location.toLowerCase())) seen.set(location.toLowerCase(), location)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

// /api/board already returns every ticket of the current user (hidden columns,
// Low Match and Archived included), so no dedicated endpoint is needed. Shares
// the Board's query cache, which is invalidated after job create/edit/delete.
export function useLocationSuggestions(): string[] {
  const { data } = useQuery({ queryKey: ['board'], queryFn: fetchBoard })
  return distinctLocations(data ?? [])
}
