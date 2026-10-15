export type SettingsCategory = 'appearance' | 'board' | 'ai' | 'integrations' | 'data' | 'account'

export interface SettingsCategoryDef {
  key: SettingsCategory
  label: string
}

export const SETTINGS_CATEGORIES: SettingsCategoryDef[] = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'board', label: 'Board' },
  { key: 'ai', label: 'AI Matching' },
  { key: 'integrations', label: 'Claude / MCP' },
  { key: 'data', label: 'Data' },
  { key: 'account', label: 'Account' },
]
