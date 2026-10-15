import { Autocomplete, Box, Button, MenuItem, TextField, ToggleButton, Typography, createFilterOptions } from '@mui/material'
import StarIcon from '@mui/icons-material/Star'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined'
import { DATE_PRESET_OPTIONS, hasActiveFilters, type BoardFilters, type DatePreset } from './boardFilters'

// Case-insensitive "contains" (not prefix-only): "global" finds "1GLOBAL".
const filterCompanies = createFilterOptions<string>({ matchFrom: 'any', ignoreCase: true })

export function BoardFilterBar({
  filters,
  companies,
  shownCount,
  totalCount,
  onChange,
  onClear,
}: {
  filters: BoardFilters
  companies: string[]
  shownCount: number
  totalCount: number
  onChange: (filters: BoardFilters) => void
  onClear: () => void
}) {
  const active = hasActiveFilters(filters)
  const custom = filters.datePreset === 'CUSTOM'
  const rangeInvalid = custom && filters.from !== '' && filters.to !== '' && filters.from > filters.to

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 3 }}>
      <Autocomplete
        size="small"
        options={companies}
        value={filters.company}
        onChange={(_event, value) => onChange({ ...filters, company: value })}
        filterOptions={filterCompanies}
        noOptionsText="No matching companies"
        sx={{ width: { xs: '100%', sm: 260 } }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Company"
            placeholder="All companies"
            slotProps={{ ...params.slotProps, inputLabel: { ...params.slotProps.inputLabel, shrink: true } }}
          />
        )}
      />
      <TextField
        select
        size="small"
        label="Date"
        value={filters.datePreset}
        onChange={(e) => onChange({ ...filters, datePreset: e.target.value as DatePreset })}
        sx={{ width: { xs: '100%', sm: 170 } }}
      >
        {DATE_PRESET_OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
      {custom && (
        <>
          <TextField
            size="small"
            type="date"
            label="From"
            value={filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: { xs: 'calc(50% - 6px)', sm: 160 } }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
            error={rangeInvalid}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ width: { xs: 'calc(50% - 6px)', sm: 160 } }}
          />
        </>
      )}
      <ToggleButton
        size="small"
        value="starred"
        selected={filters.starred}
        onChange={() => onChange({ ...filters, starred: !filters.starred })}
        aria-label="Show only starred jobs"
        sx={{ height: 40, px: 1.5, gap: 0.5, textTransform: 'none' }}
      >
        {filters.starred ? <StarIcon sx={{ fontSize: 18, color: '#F5B301' }} /> : <StarBorderIcon sx={{ fontSize: 18 }} />}
        Starred
      </ToggleButton>
      {active && (
        <>
          <Button size="small" startIcon={<FilterAltOffOutlinedIcon />} onClick={onClear}>
            Clear filters
          </Button>
          <Typography variant="body2" color={rangeInvalid ? 'error' : 'primary'} sx={{ fontWeight: 600 }}>
            {rangeInvalid ? '"From" is after "To" · ' : ''}Filtered: showing {shownCount} of {totalCount} jobs
          </Typography>
        </>
      )}
    </Box>
  )
}
