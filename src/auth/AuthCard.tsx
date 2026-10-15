import { Box, Paper, Typography } from '@mui/material'
import type { ReactNode } from 'react'

// The centered card shared by the Sign in and Sign up screens.
export function AuthCard({ subtitle, children }: { subtitle: string; children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Paper elevation={0} sx={{ p: 5, width: 380, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5, color: 'primary.main' }}>
          Job Hunter
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {subtitle}
        </Typography>
        {children}
      </Paper>
    </Box>
  )
}
