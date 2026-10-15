import { useEffect, useState } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import type { ApplicationStage, ApplicationStageRequest } from '../api/applications'

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null
  return new Date(value).toISOString()
}

const EMPTY: ApplicationStageRequest = { name: '', scheduledAt: null, interviewerNames: '', notes: '', outcome: '' }

export function StageDialog({
  open,
  stage,
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  open: boolean
  stage: ApplicationStage | null
  onClose: () => void
  onSubmit: (request: ApplicationStageRequest) => void
  submitting: boolean
  error: string | null
}) {
  const [form, setForm] = useState<ApplicationStageRequest>(EMPTY)

  useEffect(() => {
    if (open) {
      setForm(
        stage
          ? {
              name: stage.name,
              scheduledAt: stage.scheduledAt,
              interviewerNames: stage.interviewerNames ?? '',
              notes: stage.notes ?? '',
              outcome: stage.outcome ?? '',
            }
          : EMPTY,
      )
    }
  }, [open, stage])

  function handleSubmit() {
    onSubmit(form)
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{stage ? 'Edit Stage' : 'Add Stage'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Stage name"
          placeholder="e.g. Technical Interview"
          required
          autoFocus
          fullWidth
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <TextField
          label="Scheduled at"
          type="datetime-local"
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
          value={toDatetimeLocalValue(form.scheduledAt)}
          onChange={(e) => setForm({ ...form, scheduledAt: fromDatetimeLocalValue(e.target.value) })}
        />
        <TextField
          label="Interviewer names"
          placeholder="e.g. Alice, Bob"
          fullWidth
          value={form.interviewerNames ?? ''}
          onChange={(e) => setForm({ ...form, interviewerNames: e.target.value })}
        />
        <TextField
          label="Outcome"
          placeholder="e.g. Passed, Waiting for feedback"
          fullWidth
          value={form.outcome ?? ''}
          onChange={(e) => setForm({ ...form, outcome: e.target.value })}
        />
        <TextField
          label="Notes"
          multiline
          minRows={3}
          fullWidth
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button variant="contained" disabled={!form.name.trim() || submitting} onClick={handleSubmit}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
