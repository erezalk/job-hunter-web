import { apiClient } from './client'

export interface McpTokenStatus {
  configured: boolean
  createdAt: string | null
  suffix: string | null
}

export interface GeneratedMcpToken {
  token: string
  createdAt: string
  suffix: string
}

const URL = '/api/settings/integrations/mcp-token'

export async function fetchMcpTokenStatus(): Promise<McpTokenStatus> {
  const response = await apiClient.get<McpTokenStatus>(URL)
  return response.data
}

export async function generateMcpToken(): Promise<GeneratedMcpToken> {
  const response = await apiClient.post<GeneratedMcpToken>(URL)
  return response.data
}

export async function revokeMcpToken(): Promise<void> {
  await apiClient.delete(URL)
}
