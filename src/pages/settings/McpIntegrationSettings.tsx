import { useRef, useState, type FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createIntegrationToken,
  fetchIntegrationTokens,
  regenerateIntegrationToken,
  renameIntegrationToken,
  revokeIntegrationToken,
  type IntegrationToken,
  type IssuedIntegrationToken,
} from '../../api/integrations'
import { formErrors } from '../../api/formErrors'

const INTEGRATION_TOKENS_KEY = ['integrationTokens']
const UNNAMED_TOKEN = 'Unnamed token'
const NAME_MAX_LENGTH = 100

/** Display label only; the stored name stays null for an unnamed token. */
function tokenLabel(token: Pick<IntegrationToken, 'name'>): string {
  return token.name ?? UNNAMED_TOKEN
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'unknown'
}

function withoutSecret({ token: _secret, ...summary }: IssuedIntegrationToken): IntegrationToken {
  return summary
}

function failure(err: unknown, fallback: string): string {
  const result = formErrors(err, fallback)
  return result.message ?? Object.values(result.fields)[0] ?? fallback
}

type Confirmation = { kind: 'revoke' | 'regenerate'; token: IntegrationToken }

// A raw secret exists only in this component's state, from the moment it is
// created or regenerated until it is dismissed, its token is revoked, or the
// user leaves this tab / reloads. It is never put in the query cache, storage
// or the URL, and the list endpoint never returns it.
export function McpIntegrationSettings() {
  const queryClient = useQueryClient()
  const tokensQuery = useQuery({ queryKey: INTEGRATION_TOKENS_KEY, queryFn: fetchIntegrationTokens })
  const [newName, setNewName] = useState('')
  const [issued, setIssued] = useState<{ id: number; label: string; token: string; regenerated: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<IntegrationToken | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  function updateList(update: (tokens: IntegrationToken[]) => IntegrationToken[]) {
    queryClient.setQueryData<IntegrationToken[]>(INTEGRATION_TOKENS_KEY, (current) => update(current ?? []))
    queryClient.invalidateQueries({ queryKey: INTEGRATION_TOKENS_KEY })
  }

  function showSecret(result: IssuedIntegrationToken, regenerated: boolean) {
    setIssued({ id: result.id, label: tokenLabel(result), token: result.token, regenerated })
    setCopied(false)
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => createIntegrationToken(name),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      showSecret(result, false)
      setNewName('')
      updateList((tokens) => [...tokens.filter((t) => t.id !== result.id), withoutSecret(result)])
    },
    onError: (err) => setError(failure(err, 'Could not create the token.')),
  })

  const regenerateMutation = useMutation({
    mutationFn: (token: IntegrationToken) => regenerateIntegrationToken(token.id),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      showSecret(result, true)
      updateList((tokens) => tokens.map((t) => (t.id === result.id ? withoutSecret(result) : t)))
    },
    onError: (err) => {
      setError(failure(err, 'Could not regenerate the token.'))
      queryClient.invalidateQueries({ queryKey: INTEGRATION_TOKENS_KEY })
    },
    onSettled: () => setConfirmation(null),
  })

  const revokeMutation = useMutation({
    mutationFn: (token: IntegrationToken) => revokeIntegrationToken(token.id),
    onMutate: () => setError(null),
    onSuccess: (_, token) => {
      setIssued((current) => (current?.id === token.id ? null : current))
      updateList((tokens) => tokens.filter((t) => t.id !== token.id))
    },
    onError: (err) => {
      setError(failure(err, 'Could not revoke the token.'))
      queryClient.invalidateQueries({ queryKey: INTEGRATION_TOKENS_KEY })
    },
    onSettled: () => setConfirmation(null),
  })

  async function copySecret() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.token)
      setCopied(true)
    } catch {
      setError('Could not copy automatically. Select the token and copy it manually.')
    }
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!createMutation.isPending) createMutation.mutate(newName)
  }

  const tokens = tokensQuery.data
  const confirming = regenerateMutation.isPending || revokeMutation.isPending

  return (
    <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        Claude / MCP Integration
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Connect MCP clients such as Claude Desktop or Codex to Job Hunter so they can add jobs to your Board and see
        which companies you already have.
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create a separate token for each client. Every token works on its own: renaming, regenerating or revoking one
        never affects the others. Tokens do not expire.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {issued && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            {issued.regenerated ? 'New secret for' : 'Token created:'} “{issued.label}”. Copy it now and save it in your
            client&apos;s settings. It will not be shown again.
          </Typography>
          <Box
            component="code"
            data-testid="mcp-token"
            sx={{ display: 'block', p: 1, mb: 1, wordBreak: 'break-all', bgcolor: 'action.hover', borderRadius: 1, userSelect: 'all' }}
          >
            {issued.token}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" onClick={copySecret}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button size="small" onClick={() => setIssued(null)}>
              Done
            </Button>
          </Box>
        </Alert>
      )}

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        New token
      </Typography>
      <Box component="form" onSubmit={handleCreate} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Name (optional)"
          placeholder="e.g. Claude Desktop or Codex"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
          sx={{ minWidth: 260, flex: '1 1 260px', maxWidth: 400 }}
        />
        <Button type="submit" variant="contained" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Generating…' : 'Generate token'}
        </Button>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Active tokens
      </Typography>
      {tokensQuery.isError && <Alert severity="error">Could not load your integration tokens.</Alert>}
      {tokensQuery.isLoading && <Typography color="text.secondary">Loading…</Typography>}
      {tokens && tokens.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No active tokens. Generate one for each client you want to connect.
        </Typography>
      )}
      {tokens && tokens.length > 0 && (
        <Box component="ul" aria-label="Active tokens" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {tokens.map((token) => (
            <Box
              component="li"
              key={token.id}
              data-testid={`token-${token.id}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                flexWrap: 'wrap',
                py: 1.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                '&:first-of-type': { borderTop: 'none' },
              }}
            >
              <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                <Typography
                  sx={{ fontWeight: 600, overflowWrap: 'anywhere', fontStyle: token.name ? 'normal' : 'italic' }}
                  color={token.name ? 'text.primary' : 'text.secondary'}
                >
                  {tokenLabel(token)}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Created {formatDate(token.createdAt)} · ends with …{token.suffix}
                  {token.regeneratedAt ? ` · regenerated ${formatDate(token.regeneratedAt)}` : ''}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" variant="outlined" onClick={() => setRenaming(token)} aria-label={`Rename ${tokenLabel(token)}`}>
                  Rename
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setConfirmation({ kind: 'regenerate', token })}
                  aria-label={`Regenerate ${tokenLabel(token)}`}
                >
                  Regenerate
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={() => setConfirmation({ kind: 'revoke', token })}
                  aria-label={`Revoke ${tokenLabel(token)}`}
                >
                  Revoke
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {renaming && (
        <RenameDialog
          token={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={(renamed) => {
            setRenaming(null)
            setIssued((current) => (current?.id === renamed.id ? { ...current, label: tokenLabel(renamed) } : current))
            updateList((list) => list.map((t) => (t.id === renamed.id ? renamed : t)))
          }}
        />
      )}

      <Dialog open={confirmation !== null} onClose={() => !confirming && setConfirmation(null)}>
        {confirmation && (
          <>
            <DialogTitle>
              {confirmation.kind === 'revoke' ? 'Revoke' : 'Regenerate'} “{tokenLabel(confirmation.token)}”?
            </DialogTitle>
            <DialogContent>
              <DialogContentText>
                {confirmation.kind === 'revoke'
                  ? 'This token will be deleted. Any client using it (ending with …' +
                    confirmation.token.suffix +
                    ') loses access to Job Hunter immediately.'
                  : 'The current secret (ending with …' +
                    confirmation.token.suffix +
                    ') stops working immediately, so any client using it loses access until you enter the new secret in ' +
                    'its settings. The name stays the same.'}{' '}
                Your other tokens keep working.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmation(null)} disabled={confirming}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color={confirmation.kind === 'revoke' ? 'error' : 'primary'}
                disabled={confirming}
                onClick={() =>
                  confirmation.kind === 'revoke'
                    ? revokeMutation.mutate(confirmation.token)
                    : regenerateMutation.mutate(confirmation.token)
                }
              >
                {confirmation.kind === 'revoke'
                  ? revokeMutation.isPending
                    ? 'Revoking…'
                    : 'Revoke token'
                  : regenerateMutation.isPending
                    ? 'Regenerating…'
                    : 'Regenerate token'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Paper>
  )
}

function RenameDialog({
  token,
  onClose,
  onRenamed,
}: {
  token: IntegrationToken
  onClose: () => void
  onRenamed: (token: IntegrationToken) => void
}) {
  const [name, setName] = useState(token.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mutation = useMutation({
    mutationFn: () => renameIntegrationToken(token.id, name),
    onMutate: () => setError(null),
    onSuccess: onRenamed,
    onError: (err) => setError(failure(err, 'Could not rename the token.')),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!mutation.isPending) mutation.mutate()
  }

  return (
    <Dialog
      open
      onClose={() => !mutation.isPending && onClose()}
      fullWidth
      maxWidth="xs"
      // Mounted already open, the dialog's focus trap would otherwise take focus back from autoFocus.
      slotProps={{ transition: { onEntered: () => inputRef.current?.select() } }}
    >
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Rename token</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            inputRef={inputRef}
            fullWidth
            margin="dense"
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            helperText="Leave empty for an unnamed token. The secret does not change."
            slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
