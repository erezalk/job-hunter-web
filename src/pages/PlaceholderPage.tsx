import { Box, Paper, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export function PlaceholderPage({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon: ReactNode
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2,
        p: 6,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        minHeight: 320,
        bgcolor: 'transparent',
      }}
    >
      <Box sx={{ color: 'text.disabled', mb: 2, '& svg': { fontSize: 48 } }}>{icon}</Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        {description}
      </Typography>
    </Paper>
  )
}
