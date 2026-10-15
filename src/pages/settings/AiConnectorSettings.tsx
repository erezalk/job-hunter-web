import { useState } from 'react'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined'
import type { AiProvider, Settings } from '../../api/settings'

const MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  ANTHROPIC: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  GEMINI: ['gemini-3.8-flash', 'gemini-3.7-flash'],
}

interface Props {
  form: Settings
  onChange: (patch: Partial<Settings>) => void
  onProviderChange: (value: string) => void
  onSave: () => void
  saving: boolean
  apiKeyInput: string
  onApiKeyInputChange: (value: string) => void
  onSetApiKey: () => void
  settingApiKey: boolean
  onRemoveApiKey: () => void
  removingApiKey: boolean
  onTestConnection: () => void
  testingConnection: boolean
  testResult: { success: boolean; message: string } | null
  hasAiConfiguration: boolean
  onRemoveAiConfiguration: (onDone: () => void) => void
  removingAiConfiguration: boolean
}

export function AiConnectorSettings({
  form,
  onChange,
  onProviderChange,
  onSave,
  saving,
  apiKeyInput,
  onApiKeyInputChange,
  onSetApiKey,
  settingApiKey,
  onRemoveApiKey,
  removingApiKey,
  onTestConnection,
  testingConnection,
  testResult,
  hasAiConfiguration,
  onRemoveAiConfiguration,
  removingAiConfiguration,
}: Props) {
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
  // Gemini is a closed list: no default, no custom names. A saved model that
  // is no longer on the list is shown as empty and must be re-selected.
  const geminiModelMissing = form.aiProvider === 'GEMINI' && !MODEL_SUGGESTIONS.GEMINI.includes(form.aiModel ?? '')
  const apiKeyConfigured = form.aiProvider === 'ANTHROPIC' ? form.anthropicApiKeyConfigured : form.geminiApiKeyConfigured

  return (
    <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        AI Matching
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Configure a provider to score how well a job fits your active CV. The app remains fully usable as a
        manual tracker without this configured.
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <TextField select label="Provider" value={form.aiProvider ?? ''} onChange={(e) => onProviderChange(e.target.value)}>
          <MenuItem value="">Not configured</MenuItem>
          <MenuItem value="ANTHROPIC">Anthropic (Claude)</MenuItem>
          <MenuItem value="GEMINI">Google Gemini</MenuItem>
        </TextField>

        {form.aiProvider && (
          <>
            {form.aiProvider === 'GEMINI' ? (
              <Autocomplete
                options={MODEL_SUGGESTIONS.GEMINI}
                value={geminiModelMissing ? null : form.aiModel}
                onChange={(_, value) => onChange({ aiModel: value ?? '' })}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Model"
                    required
                    error={geminiModelMissing && !!form.aiModel}
                    helperText={
                      geminiModelMissing && form.aiModel
                        ? `Saved model "${form.aiModel}" is no longer supported. Select a model.`
                        : 'Select a model'
                    }
                  />
                )}
              />
            ) : (
              <Autocomplete
                freeSolo
                options={MODEL_SUGGESTIONS[form.aiProvider]}
                value={form.aiModel ?? ''}
                onInputChange={(_, value) => onChange({ aiModel: value })}
                renderInput={(params) => (
                  <TextField {...params} label="Model" helperText="Pick a suggestion or type any model identifier" />
                )}
              />
            )}

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                API key
              </Typography>
              {apiKeyConfigured ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Chip size="small" color="success" icon={<CheckCircleOutlineIcon />} label="API key configured" />
                  <Button size="small" color="error" disabled={removingApiKey} onClick={onRemoveApiKey}>
                    Remove
                  </Button>
                </Box>
              ) : (
                <Typography variant="body2" color="text.disabled" sx={{ mb: 1 }}>
                  No API key configured
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  size="small"
                  type="password"
                  fullWidth
                  label={apiKeyConfigured ? 'Replace API key' : 'API key'}
                  value={apiKeyInput}
                  onChange={(e) => onApiKeyInputChange(e.target.value)}
                />
                <Button variant="outlined" disabled={!apiKeyInput || settingApiKey} onClick={onSetApiKey}>
                  Save key
                </Button>
              </Box>
            </Box>

            <TextField
              type="number"
              label="Minimum fit score"
              value={form.minimumFitScore}
              onChange={(e) => onChange({ minimumFitScore: Math.max(0, Math.min(100, Number(e.target.value))) })}
              slotProps={{ htmlInput: { min: 0, max: 100 } }}
              helperText="0–100. After an AI evaluation, a job in New scoring below this moves to Low Match and its description and match details are discarded; a Low Match job scoring at or above it returns to New. Other statuses are never changed."
            />

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Button
                variant="outlined"
                disabled={testingConnection || !apiKeyConfigured || !form.aiModel || geminiModelMissing}
                onClick={onTestConnection}
              >
                Test connection
              </Button>
              {testResult && (
                <Alert severity={testResult.success ? 'success' : 'error'} sx={{ py: 0 }}>
                  {testResult.message}
                </Alert>
              )}
            </Box>
          </>
        )}

        <Box>
          <Button variant="contained" disabled={saving || geminiModelMissing} onClick={onSave}>
            Save
          </Button>
        </Box>

        {hasAiConfiguration && (
          <>
            <Divider />
            <Box>
              <Button color="error" size="small" onClick={() => setConfirmRemoveOpen(true)}>
                Remove AI configuration
              </Button>
            </Box>
          </>
        )}
      </Box>

      <Dialog open={confirmRemoveOpen} onClose={() => !removingAiConfiguration && setConfirmRemoveOpen(false)}>
        <DialogTitle>Remove AI configuration?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will remove your saved AI credentials, AI Matching settings, and existing job match evaluations. This
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemoveOpen(false)} disabled={removingAiConfiguration}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={removingAiConfiguration}
            onClick={() => onRemoveAiConfiguration(() => setConfirmRemoveOpen(false))}
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
