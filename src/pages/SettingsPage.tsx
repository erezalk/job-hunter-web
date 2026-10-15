import { useEffect, useState } from 'react'
import { Alert, Box, Snackbar, Typography } from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import {
  fetchSettings,
  removeAiApiKey,
  removeAiConfiguration,
  setAiApiKey,
  testAiConnection,
  updateSettings,
} from '../api/settings'
import type { AiProvider, Settings } from '../api/settings'
import { AiConnectorSettings } from './settings/AiConnectorSettings'
import { aiErrorMessage, aiMessageForCode } from '../api/aiErrors'
import { AppearanceSettings } from './settings/AppearanceSettings'
import { BoardSettings } from './settings/BoardSettings'
import { McpIntegrationSettings } from './settings/McpIntegrationSettings'
import { DataSettings } from './settings/DataSettings'
import { AccountSettings } from './settings/AccountSettings'
import { SettingsCategoryNav } from './settings/SettingsCategoryNav'
import type { SettingsCategory } from './settings/settingsCategories'

function extractErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && err.response?.data?.message) {
    return err.response.data.message
  }
  return fallback
}

const DEFAULT_MINIMUM_FIT_SCORE = 70

// True when the saved (server-side) settings contain anything AI-related.
function hasAiConfiguration(saved: Settings | undefined): boolean {
  return (
    !!saved &&
    (!!saved.aiProvider ||
      !!saved.aiModel ||
      saved.anthropicApiKeyConfigured ||
      saved.geminiApiKeyConfigured ||
      saved.minimumFitScore !== DEFAULT_MINIMUM_FIT_SCORE)
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: fetchSettings })
  const [form, setForm] = useState<Settings | null>(null)
  const [category, setCategory] = useState<SettingsCategory>('appearance')
  const [snackbar, setSnackbar] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    // Initialise once; mutations below merge what they changed into the form,
    // so e.g. saving an API key never discards an unsaved provider/model pick.
    if (settingsQuery.data && form === null) {
      setForm(settingsQuery.data)
    }
  }, [settingsQuery.data, form])

  const saveMutation = useMutation({
    mutationFn: (settings: Settings) => updateSettings(settings),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data)
      setForm(data)
      queryClient.invalidateQueries({ queryKey: ['board'] })
      setSnackbar('Settings saved')
    },
    onError: (err) => setSnackbar(extractErrorMessage(err, 'Failed to save settings')),
  })

  const setKeyMutation = useMutation({
    mutationFn: () => setAiApiKey(form!.aiProvider!, apiKeyInput),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data)
      updateForm({
        anthropicApiKeyConfigured: data.anthropicApiKeyConfigured,
        geminiApiKeyConfigured: data.geminiApiKeyConfigured,
      })
      setApiKeyInput('')
      setSnackbar('API key saved')
    },
    onError: (err) => setSnackbar(extractErrorMessage(err, 'Failed to save API key')),
  })

  const removeKeyMutation = useMutation({
    mutationFn: () => removeAiApiKey(form!.aiProvider!),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data)
      updateForm({
        anthropicApiKeyConfigured: data.anthropicApiKeyConfigured,
        geminiApiKeyConfigured: data.geminiApiKeyConfigured,
      })
      setSnackbar('API key removed')
    },
    onError: (err) => setSnackbar(extractErrorMessage(err, 'Failed to remove API key')),
  })

  const removeAiConfigurationMutation = useMutation({
    mutationFn: removeAiConfiguration,
    onSuccess: () => {
      // Mirrors what the server just reset; nothing else in the form changes.
      const reset = {
        aiProvider: null,
        aiModel: null,
        minimumFitScore: DEFAULT_MINIMUM_FIT_SCORE,
        anthropicApiKeyConfigured: false,
        geminiApiKeyConfigured: false,
      }
      queryClient.setQueryData<Settings>(['settings'], (old) => (old ? { ...old, ...reset } : old))
      updateForm(reset)
      setApiKeyInput('')
      setTestResult(null)
      // Fit scores came from the deleted JobMatch rows.
      queryClient.invalidateQueries({ queryKey: ['board'] })
      queryClient.invalidateQueries({ queryKey: ['jobMatch'] })
      queryClient.invalidateQueries({ queryKey: ['job'] })
      setSnackbar('AI configuration removed')
    },
    onError: (err) => setSnackbar(extractErrorMessage(err, 'Failed to remove AI configuration')),
  })

  const testConnectionMutation = useMutation({
    mutationFn: () => testAiConnection(),
    onSuccess: (result) =>
      setTestResult({ success: result.success, message: aiMessageForCode(result.code, result.message) }),
    onError: (err) => setTestResult({ success: false, message: aiErrorMessage(err, 'Connection test failed') }),
  })

  function updateForm(patch: Partial<Settings>) {
    setForm((current) => (current ? { ...current, ...patch } : current))
  }

  function toggleBoardColumn(code: string, checked: boolean) {
    if (!form) return
    const current = form.visibleBoardStatuses
    if (checked) {
      updateForm({ visibleBoardStatuses: [...current, code] })
    } else if (current.length > 1) {
      // At least one Board column must stay visible — same rule the backend
      // enforces, kept here too so the checkbox can't even be unchecked.
      updateForm({ visibleBoardStatuses: current.filter((c) => c !== code) })
    }
  }

  function handleProviderChange(value: string) {
    if (!form) return
    const provider = (value || null) as AiProvider | null
    setTestResult(null)
    updateForm({ aiProvider: provider, aiModel: provider === form.aiProvider ? form.aiModel : '' })
  }

  if (settingsQuery.isLoading || !form) {
    return <Typography color="text.secondary">Loading settings…</Typography>
  }

  if (settingsQuery.isError) {
    return <Alert severity="error">Failed to load settings.</Alert>
  }

  return (
    <>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>
        Settings
      </Typography>

      <SettingsCategoryNav value={category} onChange={setCategory} />

      <Box sx={{ maxWidth: 560 }}>
        {category === 'appearance' && (
          <AppearanceSettings
            form={form}
            onChange={updateForm}
            onSave={() => saveMutation.mutate(form)}
            saving={saveMutation.isPending}
          />
        )}

        {category === 'board' && (
          <BoardSettings
            visibleBoardStatuses={form.visibleBoardStatuses}
            onToggleColumn={toggleBoardColumn}
            onSave={() => saveMutation.mutate(form)}
            saving={saveMutation.isPending}
          />
        )}

        {category === 'ai' && (
          <AiConnectorSettings
            form={form}
            onChange={updateForm}
            onProviderChange={handleProviderChange}
            onSave={() => saveMutation.mutate(form)}
            saving={saveMutation.isPending}
            apiKeyInput={apiKeyInput}
            onApiKeyInputChange={setApiKeyInput}
            onSetApiKey={() => setKeyMutation.mutate()}
            settingApiKey={setKeyMutation.isPending}
            onRemoveApiKey={() => removeKeyMutation.mutate()}
            removingApiKey={removeKeyMutation.isPending}
            onTestConnection={() => testConnectionMutation.mutate()}
            testingConnection={testConnectionMutation.isPending}
            testResult={testResult}
            hasAiConfiguration={hasAiConfiguration(settingsQuery.data)}
            onRemoveAiConfiguration={(onDone) => removeAiConfigurationMutation.mutate(undefined, { onSettled: onDone })}
            removingAiConfiguration={removeAiConfigurationMutation.isPending}
          />
        )}

        {category === 'integrations' && <McpIntegrationSettings />}

        {category === 'data' && <DataSettings />}

        {category === 'account' && <AccountSettings />}
      </Box>

      <Snackbar open={snackbar !== null} autoHideDuration={3000} onClose={() => setSnackbar(null)} message={snackbar} />
    </>
  )
}
