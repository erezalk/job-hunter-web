import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  Link as MuiLink,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import AddIcon from '@mui/icons-material/Add'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined'
import EventOutlinedIcon from '@mui/icons-material/EventOutlined'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { changeApplicationStatus, deleteApplication, fetchApplication, updateApplicationNotes } from '../api/applications'
import {
  createApplicationStage,
  deleteApplicationStage,
  fetchApplicationStages,
  updateApplicationStage,
  type ApplicationStage,
  type ApplicationStageRequest,
} from '../api/applications'
import type { BoardCard } from '../api/board'
import { fetchJob, updateJob, type JobRequest } from '../api/jobs'
import { aiErrorMessage } from '../api/aiErrors'
import { evaluateJobMatch, fetchJobMatch } from '../api/jobmatch'
import { fetchSettings } from '../api/settings'
import { BOARD_COLUMNS } from './boardColumns'
import { StarButton } from './StarButton'
import { useStarToggle } from './useStarToggle'
import { CollapsibleDescription } from './CollapsibleDescription'
import { AiMatchResultView } from './AiMatchResultView'
import { JobInfoEditForm, type JobFieldErrors } from './JobInfoEditForm'
import { JobMetaLine } from './JobMetaLine'
import { StageDialog } from './StageDialog'
import { UPCOMING_STAGES_QUERY_KEY } from '../upcoming/upcomingStages'

function statusLabel(code: string): string {
  return BOARD_COLUMNS.find((c) => c.code === code)?.label ?? code
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Not scheduled'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StageItem({
  stage,
  onEdit,
  onDelete,
}: {
  stage: ApplicationStage
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Box sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {stage.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', mt: 0.25 }}>
            <EventOutlinedIcon sx={{ fontSize: 14 }} />
            <Typography variant="caption">{formatDateTime(stage.scheduledAt)}</Typography>
          </Box>
          {stage.interviewerNames && (
            <Typography variant="caption" color="text.secondary" component="div">
              Interviewers: {stage.interviewerNames}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={onEdit} aria-label="Edit stage">
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onDelete} aria-label="Delete stage">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      {stage.outcome && (
        <Chip size="small" label={`Outcome: ${stage.outcome}`} sx={{ mt: 1, height: 22, '& .MuiChip-label': { fontSize: 11 } }} />
      )}
      {stage.notes && (
        <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
          {stage.notes}
        </Typography>
      )}
    </Box>
  )
}

export function TicketDrawer({
  applicationId,
  onClose,
  onFilterByCompany,
}: {
  applicationId: number | null
  onClose: () => void
  // When given, the company name becomes a link that asks the Board to filter by it.
  onFilterByCompany?: (companyName: string) => void
}) {
  const [snackbar, setSnackbar] = useState<string | null>(null)
  // The last opened ticket stays rendered while the drawer slides out.
  const [shownId, setShownId] = useState<number | null>(applicationId)
  if (applicationId !== null && applicationId !== shownId) {
    setShownId(applicationId)
  }

  return (
    <>
      <Drawer
        anchor="right"
        open={applicationId !== null}
        onClose={onClose}
        slotProps={{ transition: { onExited: () => setShownId(null) } }}
      >
        <Box sx={{ width: { xs: '100vw', sm: 560 }, p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shownId !== null && (
            // Keyed by ticket: all ticket-specific local state and mutations
            // belong to exactly one application. Opening another ticket starts
            // fresh, and a mutation still running for the previous ticket
            // finishes against that ticket only.
            <TicketDrawerContent
              key={shownId}
              applicationId={shownId}
              onClose={onClose}
              onFilterByCompany={onFilterByCompany}
              notify={setSnackbar}
            />
          )}
        </Box>
      </Drawer>

      <Snackbar open={snackbar !== null} autoHideDuration={6000} onClose={() => setSnackbar(null)} message={snackbar} />
    </>
  )
}

function TicketDrawerContent({
  applicationId,
  onClose,
  onFilterByCompany,
  notify: setSnackbar,
}: {
  applicationId: number
  onClose: () => void
  onFilterByCompany?: (companyName: string) => void
  notify: (message: string) => void
}) {
  const queryClient = useQueryClient()

  // A mutation that finishes after the user moved on to another ticket must
  // not close the drawer that now shows that other ticket.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const closeIfStillOpen = () => {
    if (mounted.current) onClose()
  }

  const applicationQuery = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => fetchApplication(applicationId),
  })
  const jobId = applicationQuery.data?.jobId ?? null
  const jobQuery = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => fetchJob(jobId!),
    enabled: jobId !== null,
  })
  const stagesQuery = useQuery({
    queryKey: ['applicationStages', applicationId],
    queryFn: () => fetchApplicationStages(applicationId),
  })
  const jobMatchQuery = useQuery({
    queryKey: ['jobMatch', jobId],
    queryFn: () => fetchJobMatch(jobId!),
    enabled: jobId !== null,
  })
  // Which Board columns are currently visible — needed to know whether a
  // status change moves this ticket off-screen (see changeStatusMutation).
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings })

  const [notes, setNotes] = useState('')
  const [stageDialogOpen, setStageDialogOpen] = useState(false)
  const [editingStage, setEditingStage] = useState<ApplicationStage | null>(null)
  const [stageError, setStageError] = useState<string | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  // Per ticket (this component is keyed by it), so switching tickets or
  // closing the drawer drops an unsaved edit.
  const [editingJob, setEditingJob] = useState(false)
  const [jobFieldErrors, setJobFieldErrors] = useState<JobFieldErrors>({})

  useEffect(() => {
    setNotes(applicationQuery.data?.notes ?? '')
  }, [applicationQuery.data?.notes])

  const notesMutation = useMutation({
    mutationFn: (value: string) => updateApplicationNotes(applicationId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application', applicationId] })
      setSnackbar('Notes saved')
    },
    onError: () => setSnackbar('Failed to save notes'),
  })

  const toggleStar = useStarToggle(setSnackbar)

  // Same PATCH /api/applications/{id}/status the Board's drag/drop uses —
  // no separate status-changing mechanism. On success the Board card cache
  // is updated directly so the card moves column immediately, and if the
  // new status is one of the user's currently hidden columns, the ticket
  // just left the visible Board, so the drawer closes.
  const changeStatusMutation = useMutation({
    mutationFn: (statusCode: string) => changeApplicationStatus(applicationId, statusCode),
    onSuccess: (updated) => {
      queryClient.setQueryData(['application', applicationId], updated)
      queryClient.setQueryData<BoardCard[]>(['board'], (old) =>
        old?.map((card) => (card.applicationId === applicationId ? { ...card, statusCode: updated.status.code } : card)),
      )
      const visible = settingsQuery.data?.visibleBoardStatuses
      if (visible && !visible.includes(updated.status.code)) {
        closeIfStillOpen()
      }
      // A status change lands the ticket on top of its new column (server order).
      queryClient.invalidateQueries({ queryKey: ['board'] })
    },
    onError: () => setSnackbar('Failed to change status'),
  })

  // Permanent delete (the only place it is offered). On success the card is
  // removed from the Board cache immediately and the drawer closes.
  const deleteJobMutation = useMutation({
    mutationFn: () => deleteApplication(applicationId),
    onSuccess: () => {
      const deletedId = applicationId
      setConfirmDeleteOpen(false)
      closeIfStillOpen()
      queryClient.setQueryData<BoardCard[]>(['board'], (old) => old?.filter((card) => card.applicationId !== deletedId))
      queryClient.removeQueries({ queryKey: ['application', deletedId] })
      queryClient.removeQueries({ queryKey: ['applicationStages', deletedId] })
      queryClient.invalidateQueries({ queryKey: UPCOMING_STAGES_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['board'] })
    },
    onError: (err) => {
      setConfirmDeleteOpen(false)
      setSnackbar(extractError(err, 'Failed to delete job'))
    },
  })

  // PATCH /api/jobs/{id}. The server removes the stored AI match only when the
  // AI-relevant fields changed, so the match caches are refreshed, not cleared.
  const updateJobMutation = useMutation({
    mutationFn: (request: JobRequest) => updateJob(jobId!, request),
    onSuccess: (updated) => {
      queryClient.setQueryData(['job', jobId], updated)
      // Title/company are shown in the upcoming-stages list.
      queryClient.invalidateQueries({ queryKey: UPCOMING_STAGES_QUERY_KEY })
      queryClient.invalidateQueries({ queryKey: ['jobMatch', jobId] })
      queryClient.invalidateQueries({ queryKey: ['board'] })
      setEditingJob(false)
      setJobFieldErrors({})
      setSnackbar('Job information saved')
    },
    onError: (err) => {
      const data = axios.isAxiosError(err) ? err.response?.data : undefined
      if (Array.isArray(data?.fieldErrors) && data.fieldErrors.length > 0) {
        const mapped: JobFieldErrors = {}
        for (const fe of data.fieldErrors as { field: keyof JobRequest; message: string }[]) mapped[fe.field] = fe.message
        setJobFieldErrors(mapped)
      } else if (axios.isAxiosError(err) && err.response?.status === 409) {
        setJobFieldErrors({ title: extractError(err, 'Another job with this company and title already exists.') })
      } else {
        setSnackbar(extractError(err, 'Failed to save job information'))
      }
    },
  })

  const evaluateMatchMutation = useMutation({
    mutationFn: (force: boolean) => evaluateJobMatch(jobId!, force),
    onSuccess: (match) => {
      queryClient.setQueryData(['jobMatch', jobId], match)
      // The evaluation may have moved the application to/from Low Match.
      queryClient.invalidateQueries({ queryKey: ['application', applicationId] })
      queryClient.invalidateQueries({ queryKey: ['board'] })
      // Update the Board card and job-detail caches directly so the fit
      // score shows up immediately, without waiting for a refetch.
      queryClient.setQueryData<BoardCard[]>(['board'], (old) =>
        old?.map((card) => (card.applicationId === applicationId ? { ...card, fitScore: match.fitScore } : card)),
      )
      queryClient.invalidateQueries({ queryKey: ['job', jobId] })
    },
    onError: (err) => setSnackbar(aiErrorMessage(err, 'AI evaluation failed. Please try again.')),
  })

  function invalidateStages() {
    queryClient.invalidateQueries({ queryKey: ['applicationStages', applicationId] })
    queryClient.invalidateQueries({ queryKey: UPCOMING_STAGES_QUERY_KEY })
  }

  const createStageMutation = useMutation({
    mutationFn: (request: ApplicationStageRequest) => createApplicationStage(applicationId, request),
    onSuccess: () => {
      invalidateStages()
      setStageDialogOpen(false)
    },
    onError: (err) => setStageError(extractError(err, 'Failed to add stage')),
  })

  const updateStageMutation = useMutation({
    mutationFn: (request: ApplicationStageRequest) => updateApplicationStage(applicationId, editingStage!.id, request),
    onSuccess: () => {
      invalidateStages()
      setStageDialogOpen(false)
    },
    onError: (err) => setStageError(extractError(err, 'Failed to save stage')),
  })

  const deleteStageMutation = useMutation({
    mutationFn: (stageId: number) => deleteApplicationStage(applicationId, stageId),
    onSuccess: () => invalidateStages(),
    onError: () => setSnackbar('Failed to delete stage'),
  })

  function handleOpenAddStage() {
    setEditingStage(null)
    setStageError(null)
    setStageDialogOpen(true)
  }

  function handleOpenEditStage(stage: ApplicationStage) {
    setEditingStage(stage)
    setStageError(null)
    setStageDialogOpen(true)
  }

  function handleStageSubmit(request: ApplicationStageRequest) {
    if (editingStage) {
      updateStageMutation.mutate(request)
    } else {
      createStageMutation.mutate(request)
    }
  }

  const application = applicationQuery.data
  const job = jobQuery.data
  const loading = applicationQuery.isLoading || jobQuery.isLoading

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pt: 1.25 }}>
        <Box>
          {application && <Chip size="small" color="primary" label={statusLabel(application.status.code)} />}
          <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>
            {job?.title ?? (loading ? 'Loading…' : '')}
          </Typography>
          {job?.companyName && onFilterByCompany ? (
            // Link-styled button: keyboard-focusable, no navigation. Sets the Board's Company filter.
            <MuiLink
              component="button"
              type="button"
              variant="body1"
              underline="hover"
              onClick={() => onFilterByCompany(job.companyName!)}
              sx={{ color: 'text.secondary', textAlign: 'left', '&:hover, &:focus-visible': { color: 'primary.main' } }}
            >
              {job.companyName}
            </MuiLink>
          ) : (
            <Typography variant="body1" color="text.secondary">
              {job?.companyName ?? '—'}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {application && (
            <StarButton
              starred={application.starred}
              onToggle={() => toggleStar(application.id, application.starred)}
              sx={{ p: 1 }}
            />
          )}
          <IconButton onClick={onClose} aria-label="Close ticket">
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {job && application && (
        <>
          <Divider />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="overline" color="text.secondary">
              Job information
            </Typography>
            {!editingJob && (
              <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => setEditingJob(true)}>
                Edit
              </Button>
            )}
          </Box>
          {editingJob ? (
            <JobInfoEditForm
              job={job}
              pending={updateJobMutation.isPending}
              serverErrors={jobFieldErrors}
              onSave={(request) => {
                setJobFieldErrors({})
                updateJobMutation.mutate(request)
              }}
              onCancel={() => {
                setEditingJob(false)
                setJobFieldErrors({})
              }}
            />
          ) : (
            <>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {job.location && <Chip size="small" variant="outlined" label={job.location} />}
                {job.workModel && <Chip size="small" variant="outlined" label={job.workModel} />}
                {(job.salaryMin || job.salaryMax) && (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`${job.salaryMin ?? '?'} – ${job.salaryMax ?? '?'} ${job.currency ?? ''}`.trim()}
                  />
                )}
                {job.fitScore != null && <Chip size="small" color="primary" label={`${Math.round(job.fitScore)}% fit`} />}
              </Box>
              {job.url && (
                <MuiLink href={job.url} target="_blank" rel="noopener noreferrer" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: 'fit-content' }}>
                  Open original posting <OpenInNewIcon sx={{ fontSize: 14 }} />
                </MuiLink>
              )}
              {job.description ? (
                <CollapsibleDescription key={applicationId} text={job.description} />
              ) : (
                job.descriptionDiscarded && (
                  <Typography variant="body2" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                    Job description was discarded after a low AI match.
                  </Typography>
                )
              )}
              <JobMetaLine job={job} />
            </>
          )}

          <Divider />

          <Typography variant="overline" color="text.secondary">
            AI match
          </Typography>
          {jobMatchQuery.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress size={20} />
            </Box>
          ) : jobMatchQuery.data ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <AiMatchResultView match={jobMatchQuery.data} />
              <Box>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={evaluateMatchMutation.isPending || job.descriptionDiscarded}
                  onClick={() => evaluateMatchMutation.mutate(true)}
                >
                  {evaluateMatchMutation.isPending ? 'Re-evaluating…' : 'Re-evaluate'}
                </Button>
                {job.descriptionDiscarded && (
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
                    Re-evaluation is unavailable because the job description was discarded. Use Edit on the job
                    information to add a description, then evaluate again.
                  </Typography>
                )}
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" color="text.disabled">
                Not evaluated
              </Typography>
              <Button
                size="small"
                variant="contained"
                disabled={evaluateMatchMutation.isPending}
                onClick={() => evaluateMatchMutation.mutate(false)}
              >
                {evaluateMatchMutation.isPending ? 'Evaluating…' : 'Evaluate fit'}
              </Button>
            </Box>
          )}

          <Divider />

          <Typography variant="overline" color="text.secondary">
            Status
          </Typography>
          <FormControl size="small" sx={{ maxWidth: 280 }}>
            <InputLabel id="ticket-status-label">Status</InputLabel>
            <Select
              labelId="ticket-status-label"
              label="Status"
              value={application.status.code}
              disabled={changeStatusMutation.isPending}
              onChange={(e) => changeStatusMutation.mutate(e.target.value)}
            >
              {BOARD_COLUMNS.map((column) => (
                <MenuItem key={column.code} value={column.code}>
                  {column.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider />

          <Typography variant="overline" color="text.secondary">
            General notes
          </Typography>
          <TextField
            multiline
            minRows={3}
            fullWidth
            placeholder="Recruiter details, salary discussion, anything worth remembering…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Box>
            <Button
              size="small"
              variant="contained"
              disabled={notesMutation.isPending || notes === (application.notes ?? '')}
              onClick={() => notesMutation.mutate(notes)}
            >
              Save notes
            </Button>
          </Box>

          <Divider />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="overline" color="text.secondary">
              Interview / application stages
            </Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={handleOpenAddStage}>
              Add stage
            </Button>
          </Box>

          {stagesQuery.data && stagesQuery.data.length === 0 && (
            <Typography variant="body2" color="text.disabled">
              No stages yet. Add one when an interview gets scheduled.
            </Typography>
          )}
          {stagesQuery.data && stagesQuery.data.length > 0 && (
            <Box>
              {stagesQuery.data.map((stage) => (
                <StageItem
                  key={stage.id}
                  stage={stage}
                  onEdit={() => handleOpenEditStage(stage)}
                  onDelete={() => {
                    if (window.confirm(`Delete stage "${stage.name}"?`)) {
                      deleteStageMutation.mutate(stage.id)
                    }
                  }}
                />
              ))}
            </Box>
          )}

          <Divider sx={{ mt: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              color="error"
              variant="outlined"
              size="small"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              Delete job
            </Button>
          </Box>
        </>
      )}

      <Dialog open={confirmDeleteOpen} onClose={() => !deleteJobMutation.isPending && setConfirmDeleteOpen(false)}>
        <DialogTitle>Delete job?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently delete this job and its application data, including notes and interview stages. This
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)} disabled={deleteJobMutation.isPending}>
            Cancel
          </Button>
          <Button color="error" variant="contained" onClick={() => deleteJobMutation.mutate()} disabled={deleteJobMutation.isPending}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <StageDialog
        open={stageDialogOpen}
        stage={editingStage}
        onClose={() => setStageDialogOpen(false)}
        onSubmit={handleStageSubmit}
        submitting={createStageMutation.isPending || updateStageMutation.isPending}
        error={stageError}
      />
    </>
  )
}

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data?.message) {
    return err.response.data.message
  }
  return fallback
}
