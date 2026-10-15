import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { backend, loggedOutBackend, persistedState, renderApp, installFakeBackend, type Reply } from '../test/fakeBackend'

installFakeBackend()

const PASSWORD = 'correct horse battery'
const NEW_USER = { id: 42, email: 'new@example.com', fullName: null }

const signInScreen = () => screen.findByText('Sign in to manage your job search')
const signUpScreen = () => screen.findByText('Create an account to track your job search')

async function fillSignUp(email: string, password: string, confirm: string) {
  if (email) await userEvent.type(screen.getByLabelText(/^Email/), email)
  if (password) await userEvent.type(screen.getByLabelText(/^Password/), password)
  if (confirm) await userEvent.type(screen.getByLabelText(/^Confirm password/), confirm)
}

describe('switching between sign in and sign up', () => {
  it('goes from Sign in to Sign up and back', async () => {
    loggedOutBackend()
    renderApp('/login')
    await signInScreen()

    await userEvent.click(screen.getByRole('link', { name: 'Sign up' }))
    expect(await signUpScreen()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Confirm password/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: 'Sign in' }))
    expect(await signInScreen()).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Confirm password/)).not.toBeInTheDocument()
  })

  it('uses the right input types and autocomplete hints for password managers', async () => {
    loggedOutBackend()
    renderApp('/login')
    await signInScreen()
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('autocomplete', 'current-password')

    await userEvent.click(screen.getByRole('link', { name: 'Sign up' }))
    await signUpScreen()
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('autocomplete', 'username')
    for (const label of [/^Password/, /^Confirm password/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password')
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'new-password')
    }
  })

  it('sends a logged-in user from /signup to the Board', async () => {
    loggedOutBackend()
    backend.routes['GET /api/auth/me'] = { status: 200, data: NEW_USER }
    renderApp('/signup')
    expect(await screen.findByRole('heading', { name: 'Board' })).toBeInTheDocument()
  })
})

describe('sign up validation', () => {
  it('reports every problem before sending anything', async () => {
    loggedOutBackend()
    renderApp('/signup')
    await signUpScreen()

    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(screen.getByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(screen.getByText('Confirm the password')).toBeInTheDocument()
    expect(backend.calls('POST /api/auth/register')).toHaveLength(0)
  })

  it('checks the email format, the password length and the confirmation', async () => {
    loggedOutBackend()
    renderApp('/signup')
    await signUpScreen()
    await fillSignUp('not-an-email', 'short', 'shorter')
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()
    expect(backend.calls('POST /api/auth/register')).toHaveLength(0)

    // Corrections clear the messages as the user types.
    await userEvent.clear(screen.getByLabelText(/^Email/))
    await userEvent.type(screen.getByLabelText(/^Email/), 'ok@example.com')
    expect(screen.queryByText('Enter a valid email address')).not.toBeInTheDocument()
  })

  it('rejects a password over 72 bytes', async () => {
    loggedOutBackend()
    renderApp('/signup')
    await signUpScreen()
    const long = 'é'.repeat(37)
    await fillSignUp('a@example.com', long, long)
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(screen.getByText(/Password is too long/)).toBeInTheDocument()
    expect(backend.calls('POST /api/auth/register')).toHaveLength(0)
  })
})

describe('signing up', () => {
  it('creates the account, is logged in and lands on the empty Board', async () => {
    loggedOutBackend()
    backend.routes['POST /api/auth/register'] = { status: 201, data: NEW_USER }
    const queryClient = renderApp('/signup')
    await signUpScreen()

    await fillSignUp('  new@example.com ', PASSWORD, PASSWORD)
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { name: 'Board' })).toBeInTheDocument()
    expect(screen.getByText('new@example.com')).toBeInTheDocument() // no name: the email is shown
    const [register] = backend.calls('POST /api/auth/register')
    expect(register.body).toEqual({ email: 'new@example.com', password: PASSWORD, confirmPassword: PASSWORD })
    // CSRF cookie primed first, like login.
    const keys = backend.requests.map((r) => r.key)
    expect(keys.indexOf('GET /api/auth/csrf')).toBeLessThan(keys.indexOf('POST /api/auth/register'))
    expect(persistedState(queryClient)).not.toContain(PASSWORD)
  })

  it('shows "already exists" next to the email for a duplicate account', async () => {
    loggedOutBackend()
    backend.routes['POST /api/auth/register'] = {
      status: 409,
      data: {
        status: 409, message: 'An account with this email already exists',
        fieldErrors: [{ field: 'email', message: 'An account with this email already exists' }],
      },
    }
    renderApp('/signup')
    await signUpScreen()
    await fillSignUp('taken@example.com', PASSWORD, PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))

    expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Sign up' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Board' })).not.toBeInTheDocument()

    // Editing the email clears the server's verdict.
    await userEvent.type(screen.getByLabelText(/^Email/), 'x')
    expect(screen.queryByText('An account with this email already exists')).not.toBeInTheDocument()
  })

  it('maps server validation errors to their fields', async () => {
    loggedOutBackend()
    backend.routes['POST /api/auth/register'] = {
      status: 400,
      data: { status: 400, message: 'Validation failed', fieldErrors: [{ field: 'email', message: 'Enter a valid email address' }] },
    }
    renderApp('/signup')
    await signUpScreen()
    await fillSignUp('a@b.c', PASSWORD, PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
  })

  it('explains a rate limit', async () => {
    loggedOutBackend()
    backend.routes['POST /api/auth/register'] = { status: 429, data: { status: 429, message: 'Too many', code: 'RATE_LIMITED' } }
    renderApp('/signup')
    await signUpScreen()
    await fillSignUp('a@example.com', PASSWORD, PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByText('Too many attempts. Please wait a few minutes and try again.')).toBeInTheDocument()
  })

  it('shows progress and sends only one request however often it is submitted', async () => {
    loggedOutBackend()
    let respond: (reply: Reply) => void = () => {}
    backend.routes['POST /api/auth/register'] = () => new Promise<Reply>((resolve) => (respond = resolve))
    renderApp('/signup')
    await signUpScreen()
    await fillSignUp('slow@example.com', PASSWORD, PASSWORD)

    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    const busy = await screen.findByRole('button', { name: 'Creating account…' })
    expect(busy).toBeDisabled()
    // Submitting again (Enter in a field, or a programmatic submit) is ignored too.
    fireEvent.submit(busy.closest('form')!)
    await userEvent.type(screen.getByLabelText(/^Confirm password/), '{Enter}')
    expect(backend.calls('POST /api/auth/register')).toHaveLength(1)

    respond({ status: 201, data: { ...NEW_USER, email: 'slow@example.com' } })
    expect(await screen.findByRole('heading', { name: 'Board' })).toBeInTheDocument()
    expect(backend.calls('POST /api/auth/register')).toHaveLength(1)
  })
})

describe('sign in', () => {
  it('explains a rate-limited login', async () => {
    loggedOutBackend()
    backend.routes['POST /api/auth/login'] = { status: 429, data: { status: 429, message: 'Too many', code: 'RATE_LIMITED' } }
    renderApp('/login')
    await signInScreen()
    await userEvent.type(screen.getByLabelText(/^Email/), 'me@example.com')
    await userEvent.type(screen.getByLabelText(/^Password/), PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Too many attempts. Please wait a few minutes and try again.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled())
  })
})
