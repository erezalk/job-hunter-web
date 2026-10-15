import { useRef, useState, type FormEvent } from 'react'
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material'
import { changePassword } from '../../api/auth'
import { formErrors } from '../../api/formErrors'
import { useAuth } from '../../auth/AuthContext'
import { confirmationProblem, PASSWORD_HINT, passwordProblem } from '../../auth/accountRules'

type Field = 'currentPassword' | 'newPassword' | 'confirmNewPassword'
type FieldErrors = Partial<Record<Field, string>>

function validate(currentPassword: string, newPassword: string, confirmNewPassword: string): FieldErrors {
  const errors: FieldErrors = {}
  if (currentPassword.length === 0) errors.currentPassword = 'Current password is required'
  const newError = passwordProblem(newPassword)
  if (newError) errors.newPassword = newError
  else if (currentPassword.length > 0 && newPassword === currentPassword) {
    errors.newPassword = 'New password must be different from the current password'
  }
  const confirmError = confirmationProblem(newPassword, confirmNewPassword)
  if (confirmError) errors.confirmNewPassword = confirmError
  return errors
}

export function AccountSettings() {
  const { user } = useAuth()
  return (
    <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'divider' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
        Account
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Signed in as {user?.email}
      </Typography>
      <ChangePasswordForm email={user?.email ?? ''} />
    </Paper>
  )
}

// Passwords live only in this form's local state: never in the query cache,
// browser storage or the URL, and they are cleared after a successful change.
function ChangePasswordForm({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)

  const clientErrors = submitted ? validate(currentPassword, newPassword, confirmNewPassword) : {}
  const errors: FieldErrors = { ...serverErrors, ...clientErrors }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setSubmitted(true)
    setServerErrors({})
    setMessage(null)
    setSuccess(false)
    if (Object.keys(validate(currentPassword, newPassword, confirmNewPassword)).length > 0) return

    inFlight.current = true
    setSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword, confirmNewPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setSubmitted(false)
      setSuccess(true)
    } catch (err) {
      // A 401 (session gone) is handled centrally: the app returns to the login screen.
      const result = formErrors(err, 'Failed to change password. Please try again.')
      setServerErrors(result.fields as FieldErrors)
      setMessage(result.message)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  function edit(field: Field, setter: (value: string) => void) {
    return (value: string) => {
      setter(value)
      setSuccess(false)
      setServerErrors(({ [field]: _removed, ...rest }) => rest)
    }
  }

  return (
    <Box component="form" noValidate onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        Change password
      </Typography>
      {success && (
        <Alert severity="success">
          Password changed. You are still signed in here; any other signed-in sessions have been signed out.
        </Alert>
      )}
      {message && <Alert severity="error">{message}</Alert>}
      {/* Lets password managers attach the new password to this account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <TextField
        label="Current password"
        type="password"
        name="current-password"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(e) => edit('currentPassword', setCurrentPassword)(e.target.value)}
        error={!!errors.currentPassword}
        helperText={errors.currentPassword}
        required
      />
      <TextField
        label="New password"
        type="password"
        name="new-password"
        autoComplete="new-password"
        value={newPassword}
        onChange={(e) => edit('newPassword', setNewPassword)(e.target.value)}
        error={!!errors.newPassword}
        helperText={errors.newPassword ?? PASSWORD_HINT}
        required
      />
      <TextField
        label="Confirm new password"
        type="password"
        name="confirm-new-password"
        autoComplete="new-password"
        value={confirmNewPassword}
        onChange={(e) => edit('confirmNewPassword', setConfirmNewPassword)(e.target.value)}
        error={!!errors.confirmNewPassword}
        helperText={errors.confirmNewPassword}
        required
      />
      <Box>
        <Button type="submit" variant="contained" disabled={submitting}>
          {submitting ? 'Changing password…' : 'Change password'}
        </Button>
      </Box>
    </Box>
  )
}
