import { Box, Chip, Paper, Typography } from '@mui/material'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import LaptopMacOutlinedIcon from '@mui/icons-material/LaptopMacOutlined'
import type { BoardCard } from '../api/board'
import { StarButton, StaticStar } from './StarButton'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function BoardCardView({
  card,
  dragging = false,
  overlay = false,
  onToggleStar,
}: {
  card: BoardCard
  dragging?: boolean
  overlay?: boolean
  onToggleStar?: (applicationId: number, starred: boolean) => void
}) {
  return (
    <Paper
      elevation={overlay ? 6 : 0}
      sx={{
        p: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        bgcolor: 'background.paper',
        opacity: dragging && !overlay ? 0.35 : 1,
        cursor: overlay ? 'grabbing' : 'grab',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        position: 'relative',
        '&:hover': overlay ? undefined : { borderColor: 'primary.main', boxShadow: 1 },
      }}
    >
      <Box sx={{ position: 'absolute', top: 6, right: 6, display: 'flex' }}>
        {onToggleStar ? (
          <StarButton starred={card.starred} onToggle={() => onToggleStar(card.applicationId, card.starred)} />
        ) : (
          <Box sx={{ p: 0.5, display: 'flex' }}>
            <StaticStar starred={card.starred} />
          </Box>
        )}
      </Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3, pr: 3.5, overflowWrap: 'anywhere' }}>
        {card.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {card.companyName ?? 'Unknown company'}
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: card.fitScore != null ? 1 : 0 }}>
        {card.location && (
          <Chip
            size="small"
            variant="outlined"
            icon={<PlaceOutlinedIcon sx={{ fontSize: '14px !important' }} />}
            label={card.location}
            sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
          />
        )}
        {card.workModel && (
          <Chip
            size="small"
            variant="outlined"
            icon={<LaptopMacOutlinedIcon sx={{ fontSize: '14px !important' }} />}
            label={card.workModel}
            sx={{ height: 22, '& .MuiChip-label': { px: 0.75, fontSize: 11 } }}
          />
        )}
      </Box>

      {card.fitScore != null && (
        <Chip
          size="small"
          color="primary"
          label={`${Math.round(card.fitScore)}% fit`}
          sx={{ height: 20, mb: 1, '& .MuiChip-label': { px: 0.75, fontSize: 11, fontWeight: 600 } }}
        />
      )}

      <Typography variant="caption" color="text.disabled">
        {formatDate(card.discoveredAt)}
      </Typography>
    </Paper>
  )
}
