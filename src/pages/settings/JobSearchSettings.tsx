import { Box } from '@mui/material'
import { ExcludedCompaniesSettings } from './ExcludedCompaniesSettings'
import { SearchPromptSettings } from './SearchPromptSettings'

/**
 * Settings → Job Search: everything MCP clients (Claude, Codex) use to run the
 * user's job search, as two separate cards — the Search Prompt
 * (get_search_prompt) above the Excluded Companies (get_excluded_companies).
 * Each card loads and saves on its own.
 */
export function JobSearchSettings() {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <SearchPromptSettings />
      <ExcludedCompaniesSettings />
    </Box>
  )
}
