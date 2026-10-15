import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { backend, loggedInBackend, persistedState, renderApp, installFakeBackend, type Reply } from '../../test/fakeBackend'

installFakeBackend()

const CURRENT = 'current-password-1'
const NEXT = 'next-password-22'

async function openAccountTab() {
  await userEvent.click(await screen.findByRole('tab', { name: 'Account' }))
  return screen.findByRole('heading', { name: 'Account' })
}

async function fill(current: string, next: string, confirm: string) {
  if (current) await userEvent.type(screen.getByLabelText(/^Current password/), current)
  if (next) await userEvent.type(screen.getByLabelText(/^New password/), next)
  if (confirm) await userEvent.type(screen.getByLabelText(/^Confirm new password/), confirm)
}

const submit = () => userEvent.click(screen.getByRole('button', { name: 'Change password' }))

describe('Settings → Account', () => {
  it('is a tab after the existing ones and shows the change-password form', async () => {
    loggedInBackend()
    renderApp('/settings')
    const tabs = (await screen.findAllByRole('tab')).map((tab) => tab.textContent)
    expect(tabs).toEqual(['Appearance', 'Board', 'AI Matching', 'Claude / MCP', 'Data', 'Account'])

    await openAccountTab()
    expect(screen.getByText('Signed in as me@example.com')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Current password/)).toHaveAttribute('autocomplete', 'current-password')
    for (const label of [/^New password/, /^Confirm new password/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'new-password')
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password')
    }
  })

  it('validates before sending: required, policy, confirmation, and a different new password', async () => {
    loggedInBackend()
    renderApp('/settings')
    await openAccountTab()

    await submit()
    expect(screen.getByText('Current password is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()

    await fill(CURRENT, 'short', 'other')
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText(/^New password/))
    await userEvent.type(screen.getByLabelText(/^New password/), CURRENT)
    expect(screen.getByText('New password must be different from the current password')).toBeInTheDocument()
    expect(backend.calls('POST /api/auth/change-password')).toHaveLength(0)
  })

  it('shows a wrong current password next to that field and stays logged in', async () => {
    loggedInBackend()
    backend.routes['POST /api/auth/change-password'] = {
      status: 400,
      data: { status: 400, message: 'Validation failed', fieldErrors: [{ field: 'currentPassword', message: 'Current password is incorrect' }] },
    }
    renderApp('/settings')
    await openAccountTab()
    await fill('wrong-password', NEXT, NEXT)
    await submit()

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Current password/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(screen.queryByText('Sign in to manage your job search')).not.toBeInTheDocument()
  })

  it('changes the password, clears the form and explains the session outcome', async () => {
    loggedInBackend()
    backend.routes['POST /api/auth/change-password'] = { status: 204 }
    const queryClient = renderApp('/settings')
    await openAccountTab()
    await fill(CURRENT, NEXT, NEXT)
    await submit()

    const done = await screen.findByText(/Password changed\. You are still signed in here/)
    expect(done).toHaveTextContent('other signed-in sessions have been signed out')
    expect(backend.calls('POST /api/auth/change-password')[0].body).toEqual({
      currentPassword: CURRENT, newPassword: NEXT, confirmNewPassword: NEXT,
    })
    for (const label of [/^Current password/, /^New password/, /^Confirm new password/]) {
      expect(screen.getByLabelText(label)).toHaveValue('')
    }
    expect(persistedState(queryClient)).not.toContain(CURRENT)
    expect(persistedState(queryClient)).not.toContain(NEXT)
    // Still in the app.
    expect(within(screen.getByRole('banner')).getByText('me@example.com')).toBeInTheDocument()
  })

  it('sends one request while a change is in flight', async () => {
    loggedInBackend()
    let respond: (reply: Reply) => void = () => {}
    backend.routes['POST /api/auth/change-password'] = () => new Promise<Reply>((resolve) => (respond = resolve))
    renderApp('/settings')
    await openAccountTab()
    await fill(CURRENT, NEXT, NEXT)
    await submit()

    const busy = await screen.findByRole('button', { name: 'Changing password…' })
    expect(busy).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/^Confirm new password/), '{Enter}')
    expect(backend.calls('POST /api/auth/change-password')).toHaveLength(1)
    respond({ status: 204 })
    expect(await screen.findByText(/Password changed/)).toBeInTheDocument()
  })

  it('explains a rate limit', async () => {
    loggedInBackend()
    backend.routes['POST /api/auth/change-password'] = { status: 429, data: { status: 429, message: 'Too many', code: 'RATE_LIMITED' } }
    renderApp('/settings')
    await openAccountTab()
    await fill(CURRENT, NEXT, NEXT)
    await submit()
    expect(await screen.findByText('Too many attempts. Please wait a few minutes and try again.')).toBeInTheDocument()
  })

  it('returns to the login screen when the session has ended', async () => {
    loggedInBackend()
    backend.routes['POST /api/auth/change-password'] = { status: 401 }
    renderApp('/settings')
    await openAccountTab()
    await fill(CURRENT, NEXT, NEXT)
    await submit()
    expect(await screen.findByText('Sign in to manage your job search')).toBeInTheDocument()
  })
})
