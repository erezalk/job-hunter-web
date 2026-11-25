import { apiClient } from './client'

/** The user's saved job-search instructions, exactly as entered. `prompt` is "" and `updatedAt` null when none is saved. */
export interface SearchPrompt {
  prompt: string
  updatedAt: string | null
}

/** Same limit as the server (the database column itself is unlimited). */
export const SEARCH_PROMPT_MAX_LENGTH = 100_000

const URL = '/api/settings/search-prompt'

export async function fetchSearchPrompt(): Promise<SearchPrompt> {
  const response = await apiClient.get<SearchPrompt>(URL)
  return response.data
}

/** Creates or replaces the prompt with exactly this text (never trimmed); a blank text clears it. */
export async function saveSearchPrompt(prompt: string): Promise<SearchPrompt> {
  const response = await apiClient.put<SearchPrompt>(URL, { prompt })
  return response.data
}

export async function deleteSearchPrompt(): Promise<void> {
  await apiClient.delete(URL)
}
