import { Box, Button, MenuItem, Paper, TextField, Typography } from '@mui/material'
import type { Settings } from '../../api/settings'

const THEME_OPTIONS = ['SYSTEM', 'LIGHT', 'DARK']

interface Props {
  form: Settings
  onChange: (patch: Partial<Settings>) => void
  onSave: () => void
  saving: boolean
}

export function AppearanceSettings({ form, onChange, onSave, saving }: Props) {
  return (
    <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
        Appearance
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TextField select label="Theme" value={form.theme} onChange={(e) => onChange({ theme: e.target.value })}>
          {THEME_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {option.charAt(0) + option.slice(1).toLowerCase()}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Timezone"
          value={form.timezone}
          onChange={(e) => onChange({ timezone: e.target.value })}
          helperText="IANA timezone name, e.g. Europe/Berlin"
        />

        <Box>
          <Button variant="contained" disabled={saving} onClick={onSave}>
            Save
          </Button>
        </Box>
      </Box>
    </Paper>
  )
}
