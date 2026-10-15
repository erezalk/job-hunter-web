import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Collapse,
  Paper,
  Snackbar,
  Tooltip,
  Typography,
} from '@mui/material'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { fetchActiveCv, fetchCvFileBlob, uploadCv } from '../api/cv'

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data?.message) {
    return err.response.data.message
  }
  return fallback
}

export function CvPage() {
  const queryClient = useQueryClient()
  const cvQuery = useQuery({ queryKey: ['cv'], queryFn: fetchActiveCv })
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadCv(file),
    onSuccess: (cv) => {
      queryClient.setQueryData(['cv'], { cv })
      setSnackbar('CV uploaded')
    },
    onError: (err) => setSnackbar(extractErrorMessage(err, 'Failed to upload CV')),
  })

  const previewMutation = useMutation({
    mutationFn: () => fetchCvFileBlob(),
    onSuccess: (blob) => setPreviewUrl(URL.createObjectURL(blob)),
    onError: () => setPreviewOpen(false),
  })

  // The object URL is only ever revoked here, in one place, whenever it
  // changes or this component unmounts — covers "preview closed" (state set
  // to null), "CV replaced" (see below) and "component unmounts" in one path
  // instead of three separate revoke() call sites that could get out of sync.
  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const cv = cvQuery.data?.cv ?? null

  // Replacing the CV must never leave a stale preview open/cached.
  useEffect(() => {
    setPreviewOpen(false)
    setPreviewUrl(null)
  }, [cv?.uploadedAt])

  function togglePreview() {
    if (previewOpen) {
      setPreviewOpen(false)
      setPreviewUrl(null)
    } else {
      setPreviewOpen(true)
      previewMutation.mutate()
    }
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      uploadMutation.mutate(file)
    }
    e.target.value = ''
  }

  return (
    <>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        CV
      </Typography>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={handleFileSelected}
      />

      {cvQuery.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {cvQuery.isError && <Alert severity="error">Failed to load your CV.</Alert>}

      {!cvQuery.isLoading && !cvQuery.isError && !cv && (
        <Paper elevation={0} sx={{ p: 6, textAlign: 'center', border: '1px solid', borderColor: 'divider' }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="h6" sx={{ mb: 1 }}>
            No CV uploaded
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Upload a PDF to power AI job matching.
          </Typography>
          <Button
            variant="contained"
            startIcon={uploadMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <UploadFileIcon />}
            disabled={uploadMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload CV
          </Button>
        </Paper>
      )}

      {cv && (
        <Paper elevation={0} sx={{ p: 3, maxWidth: 1200, border: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <DescriptionOutlinedIcon color="action" sx={{ flexShrink: 0 }} />
              <Tooltip title={cv.fileName ?? ''} disableHoverListener={!cv.fileName}>
                <Typography
                  variant="h6"
                  noWrap
                  sx={{ fontWeight: 700, minWidth: 0 }}
                >
                  {cv.fileName ?? 'Active CV'}
                </Typography>
              </Tooltip>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Uploaded {new Date(cv.uploadedAt).toLocaleString()} · {formatFileSize(cv.fileSizeBytes)} · PDF
            </Typography>
          </Box>

          {cv.extractionStatus === 'EMPTY' && (
            <Alert severity="warning" sx={{ mb: 1.5 }}>
              {cv.extractionWarning ?? 'Little or no text could be extracted from this file.'}
            </Alert>
          )}
          {cv.extractionStatus === 'FAILED' && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {cv.extractionWarning ?? 'Could not read this file.'}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              onClick={togglePreview}
              endIcon={previewOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            >
              {previewOpen ? 'Hide CV preview' : 'Preview CV'}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={uploadMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <UploadFileIcon />}
              disabled={uploadMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
              sx={{ flexShrink: 0, whiteSpace: 'nowrap', textTransform: 'none' }}
            >
              Replace CV
            </Button>
          </Box>
          <Collapse in={previewOpen}>
            <Box sx={{ mt: 1.5 }}>
              {previewMutation.isPending && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
              {previewMutation.isError && <Alert severity="error">Failed to load CV preview.</Alert>}
              {previewUrl && (
                <Box
                  component="iframe"
                  // #view=FitH asks the browser's native PDF viewer to fit
                  // the page to the viewer's width on open, instead of
                  // whatever zoom level it defaults to.
                  src={`${previewUrl}#view=FitH`}
                  title="CV preview"
                  sx={{
                    width: '100%',
                    height: { xs: 480, sm: 640, md: 780 },
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    bgcolor: '#fff',
                  }}
                />
              )}
            </Box>
          </Collapse>
        </Paper>
      )}

      <Snackbar open={snackbar !== null} autoHideDuration={3000} onClose={() => setSnackbar(null)} message={snackbar} />
    </>
  )
}
