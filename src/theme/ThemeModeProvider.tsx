import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { useQuery } from '@tanstack/react-query'
import { fetchSettings } from '../api/settings'
import { useAuth } from '../auth/AuthContext'
import { getTheme } from './theme'

function resolveMode(themePreference: string | undefined, systemPrefersDark: boolean): 'light' | 'dark' {
  if (themePreference === 'DARK') return 'dark'
  if (themePreference === 'LIGHT') return 'light'
  // SYSTEM, or not loaded yet (e.g. logged out) — follow the OS/browser preference.
  return systemPrefersDark ? 'dark' : 'light'
}

// Top-level MUI theme provider. Resolves light/dark from the user's saved
// Settings.theme (shared ['settings'] query cache with SettingsPage, so
// saving there updates this immediately) plus a live prefers-color-scheme
// listener for the SYSTEM option.
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  // Settings are per user: never requested while logged out (the login page follows the OS preference).
  const { status } = useAuth()
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings, enabled: status === 'authenticated' })

  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const mode = resolveMode(settingsQuery.data?.theme, systemPrefersDark)
  const theme = useMemo(() => getTheme(mode), [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
