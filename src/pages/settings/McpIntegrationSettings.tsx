import { useState } from 'react'
import { Alert, Box, Button, Paper, Typography } from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { fetchMcpTokenStatus, generateMcpToken, revokeMcpToken } from '../../api/integrations'

const STATUS_KEY = ['mcpToken']

function errorMessage(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) && err.response?.data?.message ? err.response.data.message : fallback
}

// The raw token exists only in this component's state, from the moment it is
// generated until the user leaves this tab or reloads. It is never put in the
// query cache, storage or the URL, and the status endpoint never returns it.
export function McpIntegrationSettings() {
  const queryClient = useQueryClient()
  const statusQuery = useQuery({ queryKey: STATUS_KEY, queryFn: fetchMcpTokenStatus })
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateMutation = useMutation({
    mutationFn: generateMcpToken,
    onSuccess: (generated) => {
      setNewToken(generated.token)
      setCopied(false)
      setError(null)
      queryClient.setQueryData(STATUS_KEY, {
        configured: true,
        createdAt: generated.createdAt,
        suffix: generated.suffix,
      })
    },
    onError: (err) => setError(errorMessage(err, 'Could not generate the token.')),
  })

  const revokeMutation = useMutation({
    mutationFn: revokeMcpToken,
    onSuccess: () => {
      setNewToken(null)
      setError(null)
      queryClient.setQueryData(STATUS_KEY, { configured: false, createdAt: null, suffix: null })
    },
    onError: (err) => setError(errorMessage(err, 'Could not revoke the token.')),
  })

  async function copyToken() {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken)
      setCopied(true)
    } catch {
      setError('Could not copy automatically. Select the token and copy it manually.')
    }
  }

  const status = statusQuery.data
  const busy = generateMutation.isPending || revokeMutation.isPending

  return (
    <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        Claude / MCP Integration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Connect Claude Desktop to Job Hunter and allow Claude to add jobs to your Board.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {statusQuery.isError && <Alert severity="error">Could not load the integration status.</Alert>}
      {statusQuery.isLoading && <Typography color="text.secondary">Loading…</Typography>}

      {newToken && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Copy this token now. It will not be shown again.
          </Typography>
          <Box
            component="code"
            data-testid="mcp-token"
            sx={{ display: 'block', p: 1, mb: 1, wordBreak: 'break-all', bgcolor: 'action.hover', borderRadius: 1, userSelect: 'all' }}
          >
            {newToken}
          </Box>
          <Button size="small" variant="outlined" onClick={copyToken}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Alert>
      )}

      {status && !status.configured && (
        <>
          <Typography sx={{ mb: 2 }}>Status: Not configured</Typography>
          <Button variant="contained" disabled={busy} onClick={() => generateMutation.mutate()}>
            Generate token
          </Button>
        </>
      )}

      {status?.configured && (
        <>
          <Typography>Status: Configured</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Created: {status.createdAt ? new Date(status.createdAt).toLocaleString() : 'unknown'}
            {status.suffix ? ` · ends with …${status.suffix}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" color="error" disabled={busy} onClick={() => revokeMutation.mutate()}>
              Revoke token
            </Button>
            <Button variant="contained" disabled={busy} onClick={() => generateMutation.mutate()}>
              Generate new token
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            The token does not expire. Generating a new token immediately stops the previous one from working.
          </Typography>
        </>
      )}
    </Paper>
  )
}
