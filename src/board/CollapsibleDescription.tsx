import { useEffect, useRef, useState } from 'react'
import { Box, Link as MuiLink, Typography } from '@mui/material'

const COLLAPSED_LINES = 6

// Presentation-only: the full text is always in the DOM, CSS line clamping hides
// the overflow. Mount with a key per ticket so each one starts collapsed.
export function CollapsibleDescription({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    // Only measurable while clamped; keeps the last known value when expanded.
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, expanded])

  return (
    <Box>
      <Typography
        ref={ref}
        variant="body2"
        sx={{
          whiteSpace: 'pre-wrap',
          color: 'text.secondary',
          ...(expanded
            ? {}
            : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: COLLAPSED_LINES, overflow: 'hidden' }),
        }}
      >
        {text}
      </Typography>
      {(overflowing || expanded) && (
        <MuiLink
          component="button"
          type="button"
          variant="body2"
          underline="hover"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          sx={{ mt: 0.5 }}
        >
          {expanded ? 'See less' : 'See more'}
        </MuiLink>
      )}
    </Box>
  )
}
