import { apiClient } from './client'

/** One of the user's integration tokens as listed: never the secret. `name` is null for an unnamed token. */
export interface IntegrationToken {
  id: number
  name: string | null
  createdAt: string
  regeneratedAt: string | null
  suffix: string
}

/** Returned only by create and regenerate: the token plus its new raw secret. */
export interface IssuedIntegrationToken extends IntegrationToken {
  token: string
}

const URL = '/api/settings/integrations/tokens'

/** A blank name is sent as null, the server's "unnamed" (it also trims). */
function nameBody(name: string | null | undefined) {
  const trimmed = name?.trim() ?? ''
  return { name: trimmed === '' ? null : trimmed }
}

export async function fetchIntegrationTokens(): Promise<IntegrationToken[]> {
  const response = await apiClient.get<IntegrationToken[]>(URL)
  return response.data
}

export async function createIntegrationToken(name?: string | null): Promise<IssuedIntegrationToken> {
  const response = await apiClient.post<IssuedIntegrationToken>(URL, nameBody(name))
  return response.data
}

export async function renameIntegrationToken(id: number, name: string | null): Promise<IntegrationToken> {
  const response = await apiClient.patch<IntegrationToken>(`${URL}/${id}`, nameBody(name))
  return response.data
}

export async function regenerateIntegrationToken(id: number): Promise<IssuedIntegrationToken> {
  const response = await apiClient.post<IssuedIntegrationToken>(`${URL}/${id}/regenerate`)
  return response.data
}

export async function revokeIntegrationToken(id: number): Promise<void> {
  await apiClient.delete(`${URL}/${id}`)
}
