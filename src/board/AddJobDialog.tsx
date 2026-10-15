import { useState, type FormEvent } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, TextField } from '@mui/material'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { addAndTrackJob } from '../api/board'
import type { JobRequest } from '../api/jobs'
import type { JobFieldErrors } from './JobInfoEditForm'
import { CURRENCY_OPTIONS, WORK_MODEL_OPTIONS, useLocationSuggestions } from './jobFieldOptions'
import { SuggestField } from './SuggestField'

const EMPTY_FORM: JobRequest = {
  title: '',
  companyName: '',
  location: '',
  workModel: '',
  url: '',
  description: '',
}

// Reuses the manual job fields that previously lived on the (now removed)
// Discovery page. Adding a job here always goes through POST /api/board/jobs
// — create/dedupe the Job, ensure its Application, and land it in NEW — the
// same one-step flow future automatic discovery will use internally.
export function AddJobDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const locations = useLocationSuggestions()
  const [form, setForm] = useState<JobRequest>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  // Backend field validation errors, shown on their fields (same messages as the Edit form gets).
  const [fieldErrors, setFieldErrors] = useState<JobFieldErrors>({})
  const [notice, setNotice] = useState<string | null>(null)

  const addAndTrackMutation = useMutation({
    mutationFn: (request: JobRequest) => addAndTrackJob(request),
    onSuccess: ({ alreadyOnBoard }) => {
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['job'] })
      if (alreadyOnBoard) setNotice('This job is already on your Board.')
      handleClose()
    },
    onError: (err) => {
      const data = axios.isAxiosError(err) ? err.response?.data : undefined
      if (Array.isArray(data?.fieldErrors) && data.fieldErrors.length > 0) {
        const mapped: JobFieldErrors = {}
        for (const fe of data.fieldErrors as { field: keyof JobRequest; message: string }[]) mapped[fe.field] = fe.message
        setFieldErrors(mapped)
      } else {
        setFormError(data?.message ?? 'Failed to add job')
      }
    },
  })

  const fieldError = (field: keyof JobRequest) => ({ error: Boolean(fieldErrors[field]), helperText: fieldErrors[field] })

  function handleClose() {
    setFormError(null)
    setFieldErrors({})
    setForm(EMPTY_FORM)
    onClose()
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setFieldErrors({})
    addAndTrackMutation.mutate(form)
  }

  return (
    <>
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={handleSubmit}>
        <DialogTitle>Add Job</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField
            label="Title"
            {...fieldError('title')}
            required
            autoFocus
            fullWidth
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <TextField
            label="Company"
            {...fieldError('companyName')}
            fullWidth
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <SuggestField
              label="Location"
              {...fieldError('location')}
              options={locations}
              value={form.location ?? ''}
              onChange={(location) => setForm({ ...form, location })}
            />
            <SuggestField
              label="Work model"
              {...fieldError('workModel')}
              options={WORK_MODEL_OPTIONS}
              value={form.workModel ?? ''}
              onChange={(workModel) => setForm({ ...form, workModel })}
            />
          </Box>
          <TextField
            label="Job URL"
            {...fieldError('url')}
            fullWidth
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Salary min"
              {...fieldError('salaryMin')}
              type="number"
              fullWidth
              value={form.salaryMin ?? ''}
              onChange={(e) => setForm({ ...form, salaryMin: e.target.value ? Number(e.target.value) : undefined })}
            />
            <TextField
              label="Salary max"
              {...fieldError('salaryMax')}
              type="number"
              fullWidth
              value={form.salaryMax ?? ''}
              onChange={(e) => setForm({ ...form, salaryMax: e.target.value ? Number(e.target.value) : undefined })}
            />
            <SuggestField
              label="Currency"
              {...fieldError('currency')}
              options={CURRENCY_OPTIONS}
              value={form.currency ?? ''}
              onChange={(currency) => setForm({ ...form, currency })}
            />
          </Box>
          <TextField
            label="Description"
            {...fieldError('description')}
            multiline
            minRows={3}
            fullWidth
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={addAndTrackMutation.isPending}>
            Add &amp; track in New
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
    <Snackbar open={notice !== null} autoHideDuration={4000} onClose={() => setNotice(null)}>
      <Alert severity="info" onClose={() => setNotice(null)}>
        {notice}
      </Alert>
    </Snackbar>
    </>
  )
}
