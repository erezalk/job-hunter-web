import { Typography } from '@mui/material'
import type { Job } from '../api/jobs'

// Subtle metadata line of the read-only Job information. Source is omitted
// when empty (jobs that predate the field) — never defaulted to "Manual".
export function JobMetaLine({ job }: { job: Pick<Job, 'discoveredAt' | 'source'> }) {
  return (
    <Typography variant="caption" color="text.disabled">
      Discovered {new Date(job.discoveredAt).toLocaleDateString()}
      {job.source && ` · Source: ${job.source}`}
    </Typography>
  )
}
