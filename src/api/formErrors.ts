import axios from 'axios'

export const TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait a few minutes and try again.'

export interface FormErrors {
  // Per request field, as named by the server (e.g. "email", "newPassword").
  fields: Record<string, string>
  // Shown above the form when no field error explains the failure.
  message: string | null
}

// Maps an API failure to form errors: the server's field errors (400 validation,
// 409 duplicate email) go next to their fields; 429 and anything else become one message.
export function formErrors(err: unknown, fallback: string): FormErrors {
  if (!axios.isAxiosError(err) || !err.response) {
    return { fields: {}, message: fallback }
  }
  if (err.response.status === 429) {
    return { fields: {}, message: TOO_MANY_ATTEMPTS }
  }
  const data = err.response.data as { message?: string; fieldErrors?: { field: string; message: string }[] } | undefined
  const fields: Record<string, string> = {}
  for (const fieldError of data?.fieldErrors ?? []) {
    fields[fieldError.field] = fieldError.message
  }
  if (Object.keys(fields).length > 0) {
    return { fields, message: null }
  }
  return { fields, message: err.response.status < 500 && data?.message ? data.message : fallback }
}
