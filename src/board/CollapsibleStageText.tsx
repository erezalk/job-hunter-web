import { useLayoutEffect, useRef, useState } from 'react'
import { Box, Link as MuiLink, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'

const COLLAPSED_LINES = 6

// Presentation-only: the full text is always in the DOM, CSS line clamping hides the
// overflow, and the expanded state is local to this block (never persisted or sent).
// `frameSx` styles an optional wrapper around the clamped text (padding must live there:
// padding on a line-clamped element lets the lines past the clamp show through it).
export function CollapsibleStageText({
  text,
  sx,
  frameSx,
  textSx,
}: {
  text: string
  sx?: SxProps<Theme>
  frameSx?: SxProps<Theme>
  textSx?: SxProps<Theme>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const [measuredText, setMeasuredText] = useState(text)

  // Edited content starts collapsed and is measured again.
  if (measuredText !== text) {
    setMeasuredText(text)
    setExpanded(false)
    setOverflowing(false)
  }

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      if (!expanded) {
        // Clamped: the text overflows when its full height exceeds the clamped box.
        setOverflowing(el.scrollHeight > el.clientHeight + 1)
        return
      }
      // Expanded: compare the full height with six computed lines. When the line height
      // is not a pixel value, keep the last known answer.
      const lineHeight = getComputedStyle(el).lineHeight
      if (lineHeight.endsWith('px')) setOverflowing(el.scrollHeight > parseFloat(lineHeight) * COLLAPSED_LINES + 1)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [text, expanded])

  return (
    <Box sx={sx}>
      <Box sx={frameSx}>
        <Typography
          ref={ref}
          variant="body2"
          component="div"
          sx={[
            { whiteSpace: 'pre-wrap' },
            ...(expanded
              ? []
              : [{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: COLLAPSED_LINES, overflow: 'hidden' }]),
            ...(Array.isArray(textSx) ? textSx : textSx ? [textSx] : []),
          ]}
        >
          {text}
        </Typography>
      </Box>
      {overflowing && (
        <MuiLink
          component="button"
          type="button"
          variant="caption"
          underline="hover"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          sx={{ mt: 0.25 }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </MuiLink>
      )}
    </Box>
  )
}
