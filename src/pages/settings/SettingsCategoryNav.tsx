import { Tab, Tabs } from '@mui/material'
import { SETTINGS_CATEGORIES } from './settingsCategories'
import type { SettingsCategory } from './settingsCategories'

interface Props {
  value: SettingsCategory
  onChange: (category: SettingsCategory) => void
}

// Horizontal tabs directly under the Settings heading — not a second
// sidebar next to AppLayout's main Board/CV/Settings drawer. Scrolls
// horizontally on narrow screens instead of switching to a vertical list.
export function SettingsCategoryNav({ value, onChange }: Props) {
  return (
    <Tabs
      value={value}
      onChange={(_, next: SettingsCategory) => onChange(next)}
      variant="scrollable"
      scrollButtons="auto"
      sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
    >
      {SETTINGS_CATEGORIES.map((category) => (
        <Tab key={category.key} value={category.key} label={category.label} />
      ))}
    </Tabs>
  )
}
