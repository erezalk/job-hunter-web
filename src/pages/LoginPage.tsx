import { useRef, useState, type FormEvent } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, Link, TextField, Typography } from '@mui/material'
import axios from 'axios'
import { useAuth } from '../auth/AuthContext'
import { AuthCard } from '../auth/AuthCard'
import { TOO_MANY_ATTEMPTS } from '../api/formErrors'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Synchronous guard: a second Enter/click before the re-render must not send a second request.
  const inFlight = useRef(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/board', { replace: true })
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError('Invalid email or password.')
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        setError(TOO_MANY_ATTEMPTS)
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <AuthCard subtitle="Sign in to manage your job search">
      <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
        />
        <Button type="submit" variant="contained" size="large" disabled={submitting} fullWidth>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          Don&apos;t have an account?{' '}
          <Link component={RouterLink} to="/signup">
            Sign up
          </Link>
        </Typography>
      </Box>
    </AuthCard>
  )
}
