import { apiClient } from './client'

export type AiProvider = 'ANTHROPIC' | 'GEMINI'

export interface Settings {
  theme: string
  timezone: string
  visibleBoardStatuses: string[]
  minimumFitScore: number
  aiProvider: AiProvider | null
  aiModel: string | null
  anthropicApiKeyConfigured: boolean
  geminiApiKeyConfigured: boolean
}

export interface TestConnectionResult {
  success: boolean
  message: string
  code?: string | null
  retryAfterSeconds?: number | null
}

export async function fetchSettings(): Promise<Settings> {
  const response = await apiClient.get<Settings>('/api/settings')
  return response.data
}

export async function updateSettings(settings: Settings): Promise<Settings> {
  const response = await apiClient.put<Settings>('/api/settings', settings)
  return response.data
}

export async function setAiApiKey(provider: AiProvider, apiKey: string): Promise<Settings> {
  const response = await apiClient.put<Settings>('/api/settings/ai/api-key', { provider, apiKey })
  return response.data
}

export async function removeAiApiKey(provider: AiProvider): Promise<Settings> {
  const response = await apiClient.delete<Settings>('/api/settings/ai/api-key', { params: { provider } })
  return response.data
}

export async function testAiConnection(): Promise<TestConnectionResult> {
  const response = await apiClient.post<TestConnectionResult>('/api/settings/ai/test-connection')
  return response.data
}

export async function removeAiConfiguration(): Promise<void> {
  await apiClient.delete('/api/settings/ai')
}
