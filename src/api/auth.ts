import { apiClient } from './client'

export interface CurrentUser {
  id: number
  email: string
  // Null for accounts created through sign-up (no name is asked for).
  fullName: string | null
}

export async function primeCsrfCookie(): Promise<void> {
  await apiClient.get('/api/auth/csrf')
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  await primeCsrfCookie()
  const body = new URLSearchParams({ email, password })
  const response = await apiClient.post<CurrentUser>('/api/auth/login', body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return response.data
}

// Creates the account and logs it in on this browser session (the response is the new user).
export async function register(email: string, password: string, confirmPassword: string): Promise<CurrentUser> {
  await primeCsrfCookie()
  const response = await apiClient.post<CurrentUser>('/api/auth/register', { email, password, confirmPassword })
  return response.data
}

// 204. This session stays logged in; the server ends the user's other sessions.
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string,
): Promise<void> {
  await apiClient.post('/api/auth/change-password', { currentPassword, newPassword, confirmNewPassword })
}

export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout')
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const response = await apiClient.get<CurrentUser>('/api/auth/me')
  return response.data
}
