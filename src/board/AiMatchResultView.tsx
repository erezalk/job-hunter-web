import { Box, Chip, Typography } from '@mui/material'
import type { JobMatch } from '../api/jobmatch'
import { matchAttribution } from './matchAttribution'

// The stored AI match: fit score, who produced it and when, then the
// Matching / Gaps / Concerns lists. Renders a fragment so it sits directly in
// the AI match section's column.
export function AiMatchResultView({ match }: { match: JobMatch }) {
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip size="small" color="primary" label={`Fit: ${match.fitScore ?? '—'}%`} sx={{ fontWeight: 700 }} />
        <Typography variant="caption" color="text.disabled">
          {matchAttribution(match)}
          {match.evaluatedAt && ` · ${new Date(match.evaluatedAt).toLocaleDateString()}`}
        </Typography>
      </Box>
      {match.matchingSkills.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary">Matching</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {match.matchingSkills.map((skill) => (
              <Chip key={skill} size="small" color="success" variant="outlined" label={skill} />
            ))}
          </Box>
        </Box>
      )}
      {match.missingSkills.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary">Gaps</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {match.missingSkills.map((skill) => (
              <Chip key={skill} size="small" color="warning" variant="outlined" label={skill} />
            ))}
          </Box>
        </Box>
      )}
      {match.concerns.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary">Concerns</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
            {match.concerns.map((concern) => (
              <Chip key={concern} size="small" color="error" variant="outlined" label={concern} />
            ))}
          </Box>
        </Box>
      )}
    </>
  )
}
