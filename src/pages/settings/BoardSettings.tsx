import { Box, Button, Checkbox, FormControlLabel, Paper, Typography } from '@mui/material'
import { BOARD_COLUMNS } from '../../board/boardColumns'

interface Props {
  visibleBoardStatuses: string[]
  onToggleColumn: (code: string, checked: boolean) => void
  onSave: () => void
  saving: boolean
}

export function BoardSettings({ visibleBoardStatuses, onToggleColumn, onSave, saving }: Props) {
  return (
    <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        Board columns
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose which columns appear on your Board. Hiding a column only affects what's shown — applications keep
        their status either way. At least one column must stay visible.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {BOARD_COLUMNS.map((column) => (
          <FormControlLabel
            key={column.code}
            control={
              <Checkbox
                checked={visibleBoardStatuses.includes(column.code)}
                onChange={(e) => onToggleColumn(column.code, e.target.checked)}
                disabled={visibleBoardStatuses.length === 1 && visibleBoardStatuses.includes(column.code)}
              />
            }
            label={column.label}
          />
        ))}
      </Box>
      <Box sx={{ mt: 1 }}>
        <Button variant="contained" disabled={saving} onClick={onSave}>
          Save
        </Button>
      </Box>
    </Paper>
  )
}
