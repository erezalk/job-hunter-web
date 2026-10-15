// Mirrors the server's rules (PasswordPolicy / EmailAddresses) so mistakes show
// before submitting. The server validates again and stays authoritative.

export const PASSWORD_MIN_LENGTH = 8
// BCrypt's input limit, in UTF-8 bytes (72 plain characters, fewer with accents or non-Latin script).
export const PASSWORD_MAX_BYTES = 72
export const EMAIL_MAX_LENGTH = 254

export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters`

export function passwordProblem(password: string): string | null {
  if (password.length === 0) return 'Password is required'
  if ([...password].length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return `Password is too long: use at most ${PASSWORD_MAX_BYTES} characters (accented or non-Latin characters count as 2-4)`
  }
  if (password.trim().length === 0) return 'Password must not consist only of spaces'
  return null
}

// Deliberately loose: one "@", no spaces, a dot in the domain. The server's check is stricter.
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailProblem(email: string): string | null {
  const trimmed = email.trim()
  if (trimmed.length === 0) return 'Email is required'
  if (trimmed.length > EMAIL_MAX_LENGTH) return `Email must be at most ${EMAIL_MAX_LENGTH} characters`
  if (!EMAIL_FORMAT.test(trimmed)) return 'Enter a valid email address'
  return null
}

export function confirmationProblem(password: string, confirmation: string): string | null {
  if (confirmation.length === 0) return 'Confirm the password'
  return confirmation === password ? null : 'Passwords do not match'
}
