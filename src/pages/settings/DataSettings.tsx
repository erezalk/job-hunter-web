import { useRef, useState } from 'react'
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
  Typography,
} from '@mui/material'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { fetchJobDataExport, importJobData } from '../../api/jobData'
import { UPCOMING_STAGES_QUERY_KEY } from '../../upcoming/upcomingStages'

// Everything the Board and the ticket drawer show from the restored data.
const RESTORED_QUERY_KEYS = [['board'], UPCOMING_STAGES_QUERY_KEY, ['job'], ['jobMatch'], ['application'], ['applicationStages']]

interface ErrorDetails {
  message: string
  problems: string[]
}

// Backend message plus (for an invalid file) where in the file the problems are.
async function errorDetails(err: unknown, fallback: string): Promise<ErrorDetails> {
  if (!axios.isAxiosError(err)) return { message: fallback, problems: [] }
  let data = err.response?.data
  if (data instanceof Blob) {
    try {
      data = JSON.parse(await data.text())
    } catch {
      data = undefined
    }
  }
  const problems = Array.isArray(data?.fieldErrors)
    ? (data.fieldErrors as { field: string; message: string }[]).map((fe) => `${fe.field}: ${fe.message}`)
    : []
  return { message: data?.message ?? fallback, problems }
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function DataSettings() {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [exportError, setExportError] = useState<ErrorDetails | null>(null)
  const [importError, setImportError] = useState<ErrorDetails | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)

  const exportMutation = useMutation({
    mutationFn: fetchJobDataExport,
    onMutate: () => setExportError(null),
    onSuccess: ({ blob, fileName }) => download(blob, fileName),
    onError: async (err) => setExportError(await errorDetails(err, 'Could not export your job data.')),
  })

  const importMutation = useMutation({
    mutationFn: async (selected: File) => importJobData(await selected.text()),
    onMutate: () => {
      setImportError(null)
      setImportResult(null)
    },
    onSuccess: (summary) => {
      setImportResult(
        `Imported ${summary.jobs} jobs with ${summary.stages} stages, ${summary.statusHistoryEntries} status history entries ` +
          `and ${summary.aiMatches} AI matches.`,
      )
      setFile(null)
      for (const queryKey of RESTORED_QUERY_KEYS) queryClient.invalidateQueries({ queryKey })
    },
    onError: async (err) => setImportError(await errorDetails(err, 'Could not import the file.')),
    onSettled: () => setConfirmOpen(false),
  })

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setImportError(null)
    setImportResult(null)
    event.target.value = ''
  }

  return (
    <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        Job data
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Export includes all job and Board data, including application history, stages and AI match results. CV,
        account information, settings and secrets are not included.
      </Typography>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Export
      </Typography>
      {exportError && <ErrorAlert error={exportError} />}
      <Button variant="contained" disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
        {exportMutation.isPending ? 'Exporting…' : 'Export job data'}
      </Button>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        Import
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Restores an export file into an empty Board. It is rejected if you already have jobs on your Board; nothing is
        deleted, replaced or merged.
      </Typography>
      {importError && <ErrorAlert error={importError} />}
      {importResult && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {importResult}
        </Alert>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="job-data-file"
        onChange={handleFileSelected}
      />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Button variant="outlined" disabled={importMutation.isPending} onClick={() => fileInput.current?.click()}>
          Choose file
        </Button>
        <Typography variant="body2" color={file ? 'text.primary' : 'text.disabled'}>
          {file ? file.name : 'No file selected'}
        </Typography>
        <Button
          variant="contained"
          disabled={!file || importMutation.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          Import job data
        </Button>
      </Box>

      <Dialog open={confirmOpen} onClose={() => !importMutation.isPending && setConfirmOpen(false)}>
        <DialogTitle>Import job data?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Import is meant for an empty Board. It will be rejected if you already have jobs on your Board, and nothing
            is deleted, replaced or merged. Either the whole file is imported, or nothing is.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={importMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={importMutation.isPending}
            onClick={() => file && importMutation.mutate(file)}
          >
            {importMutation.isPending ? 'Importing…' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}

function ErrorAlert({ error }: { error: ErrorDetails }) {
  return (
    <Alert severity="error" sx={{ mb: 2 }}>
      {error.message}
      {error.problems.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          {error.problems.slice(0, 8).map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
          {error.problems.length > 8 && <li>…and {error.problems.length - 8} more</li>}
        </Box>
      )}
    </Alert>
  )
}
