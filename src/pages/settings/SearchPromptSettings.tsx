import { useId, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteSearchPrompt,
  fetchSearchPrompt,
  saveSearchPrompt,
  SEARCH_PROMPT_MAX_LENGTH,
  type SearchPrompt,
} from '../../api/searchPrompt'
import { formErrors } from '../../api/formErrors'
import { useUnsavedChanges } from '../../navigation/unsavedChangesContext'

const SEARCH_PROMPT_KEY = ['searchPrompt']
const NONE: SearchPrompt = { prompt: '', updatedAt: null }

type Feedback = { severity: 'success' | 'error'; message: string }

function failure(err: unknown, fallback: string): string {
  const result = formErrors(err, fallback)
  return result.fields.prompt ?? result.message ?? fallback
}

function lastSaved(updatedAt: string): string {
  return new Date(updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Settings → Job Search → Search Prompt: one free-text prompt per user with the job-search
 * instructions MCP clients (Claude, Codex) read through get_search_prompt.
 * The text is plain text, sent and shown exactly as typed — nothing here
 * trims, formats or rewrites it.
 */
export function SearchPromptSettings() {
  const queryClient = useQueryClient()
  const promptQuery = useQuery({ queryKey: SEARCH_PROMPT_KEY, queryFn: fetchSearchPrompt })
  // null until the saved prompt has loaded; afterwards the editor's text.
  const [draft, setDraft] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const saved = promptQuery.data
  if (saved && draft === null) {
    setDraft(saved.prompt)
  }
  const text = draft ?? ''
  const dirty = saved !== undefined && draft !== null && draft !== saved.prompt
  useUnsavedChanges(dirty)

  function applySaved(result: SearchPrompt, submitted: string | null) {
    queryClient.setQueryData(SEARCH_PROMPT_KEY, result)
    // Keep anything typed while the request was in flight.
    setDraft((current) => (submitted === null || current === submitted ? result.prompt : current))
  }

  const saveMutation = useMutation({
    mutationFn: (prompt: string) => saveSearchPrompt(prompt),
    onMutate: () => setFeedback(null),
    onSuccess: (result, submitted) => {
      applySaved(result, submitted)
      setFeedback({ severity: 'success', message: result.prompt === '' ? 'Search prompt cleared.' : 'Search prompt saved.' })
    },
    onError: (err) => setFeedback({ severity: 'error', message: failure(err, 'Could not save the search prompt. Try again.') }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSearchPrompt,
    onMutate: () => setFeedback(null),
    onSuccess: () => {
      applySaved(NONE, null)
      setConfirmDeleteOpen(false)
      setFeedback({ severity: 'success', message: 'Search prompt deleted.' })
    },
    onError: (err) => {
      setConfirmDeleteOpen(false)
      setFeedback({ severity: 'error', message: failure(err, 'Could not delete the search prompt. Try again.') })
    },
  })

  const headingId = useId()
  const busy = saveMutation.isPending || deleteMutation.isPending
  const hasSavedPrompt = !!saved && saved.prompt !== ''

  return (
    <Paper
      component="section"
      aria-labelledby={headingId}
      elevation={0}
      sx={{ p: { xs: 2, sm: 4 }, border: '1px solid', borderColor: 'divider' }}
    >
      <Typography id={headingId} variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>
        Search Prompt
      </Typography>
      {/* overflowWrap: the tool name is one long word that must not widen a narrow screen. */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, overflowWrap: 'anywhere' }}>
        Your instructions for AI job searches, in your own words. Claude, Codex and other MCP clients read this text with
        get_search_prompt exactly as written, then use your CV, board and excluded companies to search and add jobs.
      </Typography>

      {promptQuery.isLoading && <Typography color="text.secondary">Loading…</Typography>}
      {promptQuery.isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => promptQuery.refetch()}>
              Retry
            </Button>
          }
        >
          Could not load your search prompt.
        </Alert>
      )}

      {saved && draft !== null && (
        <>
          <TextField
            multiline
            fullWidth
            minRows={14}
            maxRows={36}
            value={text}
            onChange={(event) => {
              setDraft(event.target.value)
              if (feedback?.severity === 'success') setFeedback(null)
            }}
            placeholder="Describe what to search for, for example the roles, locations, salary, companies to prefer, and how to evaluate fit…"
            disabled={busy}
            slotProps={{
              htmlInput: { maxLength: SEARCH_PROMPT_MAX_LENGTH, 'aria-label': 'Search prompt', spellCheck: true },
            }}
            sx={{
              '& .MuiInputBase-root': { alignItems: 'flex-start' },
              '& textarea': {
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
                fontSize: 14,
                lineHeight: 1.6,
                resize: 'vertical',
              },
            }}
          />

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              gap: 1,
              mt: 1,
              color: 'text.secondary',
            }}
          >
            <Typography variant="caption">
              {dirty
                ? 'Unsaved changes'
                : saved.updatedAt
                  ? `Last saved ${lastSaved(saved.updatedAt)}`
                  : 'No search prompt saved yet.'}
            </Typography>
            <Typography variant="caption" data-testid="search-prompt-length">
              {text.length.toLocaleString()} / {SEARCH_PROMPT_MAX_LENGTH.toLocaleString()} characters
            </Typography>
          </Box>

          {feedback && (
            <Alert severity={feedback.severity} sx={{ mt: 2 }} onClose={() => setFeedback(null)}>
              {feedback.message}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 3 }}>
            <Button variant="contained" onClick={() => saveMutation.mutate(text)} disabled={!dirty || busy}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button onClick={() => { setDraft(saved.prompt); setFeedback(null) }} disabled={!dirty || busy}>
              Discard changes
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Button color="error" variant="outlined" onClick={() => setConfirmDeleteOpen(true)} disabled={!hasSavedPrompt || busy}>
              Delete prompt
            </Button>
          </Box>
        </>
      )}

      <Dialog open={confirmDeleteOpen} onClose={() => !deleteMutation.isPending && setConfirmDeleteOpen(false)}>
        <DialogTitle>Delete search prompt?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your saved search prompt will be deleted, and MCP clients will no longer receive it. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
