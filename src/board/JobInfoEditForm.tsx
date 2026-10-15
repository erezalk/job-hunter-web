import { useState, type FormEvent } from 'react'
import { Box, Button, TextField } from '@mui/material'
import type { Job, JobRequest } from '../api/jobs'
import { CURRENCY_OPTIONS, WORK_MODEL_OPTIONS, useLocationSuggestions } from './jobFieldOptions'
import { SuggestField } from './SuggestField'

export type JobFieldErrors = Partial<Record<keyof JobRequest, string>>

const URL_PATTERN = /^(https?:\/\/\S+)?$/
const DESCRIPTION_MAX_LENGTH = 100_000

// Same rules as the backend's JobRequest (and therefore Add Job).
function validate(form: FormState): JobFieldErrors {
  const errors: JobFieldErrors = {}
  if (!form.title.trim()) errors.title = 'Title is required'
  else if (form.title.length > 255) errors.title = 'At most 255 characters'
  if (form.companyName.length > 255) errors.companyName = 'At most 255 characters'
  if (form.location.length > 255) errors.location = 'At most 255 characters'
  if (form.workModel.length > 100) errors.workModel = 'At most 100 characters'
  if (form.url.length > 1000) errors.url = 'At most 1000 characters'
  else if (!URL_PATTERN.test(form.url.trim())) errors.url = 'Enter a valid http(s) URL'
  if (form.salaryMin !== '' && Number(form.salaryMin) < 0) errors.salaryMin = 'Must be 0 or more'
  if (form.salaryMax !== '' && Number(form.salaryMax) < 0) errors.salaryMax = 'Must be 0 or more'
  if (form.salaryMin !== '' && form.salaryMax !== '' && Number(form.salaryMin) > Number(form.salaryMax)) {
    errors.salaryMax = 'Must not be below the minimum'
  }
  if (form.currency.length > 10) errors.currency = 'At most 10 characters'
  if (form.source.length > 100) errors.source = 'At most 100 characters'
  if (form.description.length > DESCRIPTION_MAX_LENGTH) errors.description = 'At most 100,000 characters'
  return errors
}

interface FormState {
  title: string
  companyName: string
  location: string
  workModel: string
  url: string
  salaryMin: string
  salaryMax: string
  currency: string
  description: string
  source: string
}

function fromJob(job: Job): FormState {
  return {
    title: job.title,
    companyName: job.companyName ?? '',
    location: job.location ?? '',
    workModel: job.workModel ?? '',
    url: job.url ?? '',
    salaryMin: job.salaryMin != null ? String(job.salaryMin) : '',
    salaryMax: job.salaryMax != null ? String(job.salaryMax) : '',
    currency: job.currency ?? '',
    description: job.description ?? '',
    source: job.source ?? '',
  }
}

function toRequest(form: FormState): JobRequest {
  return {
    title: form.title,
    companyName: form.companyName,
    location: form.location,
    workModel: form.workModel,
    url: form.url.trim(),
    salaryMin: form.salaryMin !== '' ? Number(form.salaryMin) : undefined,
    salaryMax: form.salaryMax !== '' ? Number(form.salaryMax) : undefined,
    currency: form.currency,
    description: form.description,
    // PATCH replaces the job's editable fields, so the current value is always sent; blank clears it.
    source: form.source,
  }
}

// Mounted only while editing, so its state always starts from the persisted
// job and Cancel simply unmounts it.
export function JobInfoEditForm({
  job,
  pending,
  serverErrors,
  onSave,
  onCancel,
}: {
  job: Job
  pending: boolean
  serverErrors: JobFieldErrors
  onSave: (request: JobRequest) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<FormState>(() => fromJob(job))
  const [clientErrors, setClientErrors] = useState<JobFieldErrors>({})
  const errors = { ...serverErrors, ...clientErrors }
  const locations = useLocationSuggestions()

  function set(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setClientErrors((current) => ({ ...current, [field]: undefined }))
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const found = validate(form)
    setClientErrors(found)
    if (Object.keys(found).length === 0) onSave(toRequest(form))
  }

  function field(name: keyof FormState, label: string, extra: Record<string, unknown> = {}) {
    return (
      <TextField
        label={label}
        size="small"
        fullWidth
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
        error={Boolean(errors[name])}
        helperText={errors[name]}
        disabled={pending}
        {...extra}
      />
    )
  }

  function suggest(name: keyof FormState, label: string, options: string[], placeholder?: string) {
    return (
      <SuggestField
        label={label}
        value={form[name]}
        options={options}
        onChange={(value) => set(name, value)}
        error={Boolean(errors[name])}
        helperText={errors[name]}
        disabled={pending}
        placeholder={placeholder}
      />
    )
  }

  return (
    <Box component="form" noValidate onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {field('title', 'Title', { required: true })}
      {field('companyName', 'Company')}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, '& > *': { flex: '1 1 140px' } }}>
        {suggest('location', 'Location', locations)}
        {suggest('workModel', 'Work model', WORK_MODEL_OPTIONS)}
      </Box>
      {field('url', 'Job URL')}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, '& > *': { flex: '1 1 90px' } }}>
        {field('salaryMin', 'Salary min', { type: 'number' })}
        {field('salaryMax', 'Salary max', { type: 'number' })}
        {suggest('currency', 'Currency', CURRENCY_OPTIONS)}
      </Box>
      {field('description', 'Description', { multiline: true, minRows: 6, maxRows: 24 })}
      {field('source', 'Source')}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button size="small" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button size="small" type="submit" variant="contained" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </Box>
    </Box>
  )
}
