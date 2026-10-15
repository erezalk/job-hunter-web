import { useRef, useState, type FormEvent } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Link, TextField, Typography } from '@mui/material'
import { useAuth } from '../auth/AuthContext'
import { AuthCard } from '../auth/AuthCard'
import { confirmationProblem, emailProblem, PASSWORD_HINT, passwordProblem } from '../auth/accountRules'
import { formErrors } from '../api/formErrors'

type Field = 'email' | 'password' | 'confirmPassword'
type FieldErrors = Partial<Record<Field, string>>

function validate(email: string, password: string, confirmPassword: string): FieldErrors {
  const errors: FieldErrors = {}
  const emailError = emailProblem(email)
  if (emailError) errors.email = emailError
  const passwordError = passwordProblem(password)
  if (passwordError) errors.password = passwordError
  const confirmError = confirmationProblem(password, confirmPassword)
  if (confirmError) errors.confirmPassword = confirmError
  return errors
}

export function SignUpPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // Field errors appear after the first submit, then follow the input as it is corrected.
  const [submitted, setSubmitted] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Synchronous guard: a second Enter/click before the re-render must not send a second request.
  const inFlight = useRef(false)

  const clientErrors = submitted ? validate(email, password, confirmPassword) : {}
  const errors: FieldErrors = { ...serverErrors, ...clientErrors }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    setSubmitted(true)
    setServerErrors({})
    setMessage(null)
    if (Object.keys(validate(email, password, confirmPassword)).length > 0) return

    inFlight.current = true
    setSubmitting(true)
    try {
      // Surrounding whitespace is not part of the email (the server trims it too).
      await register(email.trim(), password, confirmPassword)
      navigate('/board', { replace: true })
    } catch (err) {
      const result = formErrors(err, 'Something went wrong. Please try again.')
      setServerErrors(result.fields as FieldErrors)
      setMessage(result.message)
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  // Editing a field clears the server's verdict on it (e.g. "already exists").
  function edit(field: Field, setter: (value: string) => void) {
    return (value: string) => {
      setter(value)
      setServerErrors(({ [field]: _removed, ...rest }) => rest)
    }
  }

  return (
    <AuthCard subtitle="Create an account to track your job search">
      <Box component="form" noValidate onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {message && <Alert severity="error">{message}</Alert>}
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(e) => edit('email', setEmail)(e.target.value)}
          error={!!errors.email}
          helperText={errors.email}
          required
          autoFocus
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => edit('password', setPassword)(e.target.value)}
          error={!!errors.password}
          helperText={errors.password ?? PASSWORD_HINT}
          required
          fullWidth
        />
        <TextField
          label="Confirm password"
          type="password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => edit('confirmPassword', setConfirmPassword)(e.target.value)}
          error={!!errors.confirmPassword}
          helperText={errors.confirmPassword}
          required
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
          {submitting ? 'Creating account…' : 'Sign up'}
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          Already have an account?{' '}
          <Link component={RouterLink} to="/login">
            Sign in
          </Link>
        </Typography>
      </Box>
    </AuthCard>
  )
}
