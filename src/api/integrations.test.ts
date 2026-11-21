import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  createIntegrationToken,
  fetchIntegrationTokens,
  regenerateIntegrationToken,
  renameIntegrationToken,
  revokeIntegrationToken,
} from './integrations'

const URL = '/api/settings/integrations/tokens'

afterEach(() => vi.restoreAllMocks())

describe('integration token API', () => {
  it('trims names and sends a blank name as null (unnamed)', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })
    const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ data: {} })

    await createIntegrationToken('  Codex  ')
    await createIntegrationToken('   ')
    await createIntegrationToken()
    await renameIntegrationToken(7, ' Claude Desktop ')
    await renameIntegrationToken(7, '')
    await renameIntegrationToken(7, null)

    expect(post.mock.calls).toEqual([
      [URL, { name: 'Codex' }],
      [URL, { name: null }],
      [URL, { name: null }],
    ])
    expect(patch.mock.calls).toEqual([
      [`${URL}/7`, { name: 'Claude Desktop' }],
      [`${URL}/7`, { name: null }],
      [`${URL}/7`, { name: null }],
    ])
  })

  it('addresses each token by its id for regenerate and revoke', async () => {
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] })
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })
    const del = vi.spyOn(apiClient, 'delete').mockResolvedValue({ data: undefined })

    await fetchIntegrationTokens()
    await regenerateIntegrationToken(3)
    await revokeIntegrationToken(4)

    expect(get).toHaveBeenCalledWith(URL)
    expect(post).toHaveBeenCalledWith(`${URL}/3/regenerate`)
    expect(del).toHaveBeenCalledWith(`${URL}/4`)
  })
})
