import { IconButton, Tooltip } from '@mui/material'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'

const STAR_YELLOW = '#F5B301'

// Lives inside the draggable card: pointer-down must not reach dnd-kit's
// listener (no drag starts) and click must not reach the card (no drawer).
export function StarButton({
  starred,
  onToggle,
  sx,
}: {
  starred: boolean
  onToggle: () => void
  sx?: object
}) {
  const label = starred ? 'Remove star' : 'Star job'
  return (
    <Tooltip title={label}>
      <IconButton
        size="small"
        aria-label={label}
        aria-pressed={starred}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
        sx={{ p: 0.5, ...sx }}
      >
        {starred ? (
          <StarIcon sx={{ fontSize: 20, color: STAR_YELLOW }} />
        ) : (
          <StarBorderIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
        )}
      </IconButton>
    </Tooltip>
  )
}

export function StaticStar({ starred }: { starred: boolean }) {
  return starred ? (
    <StarIcon sx={{ fontSize: 20, color: STAR_YELLOW }} />
  ) : (
    <StarBorderIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
  )
}
