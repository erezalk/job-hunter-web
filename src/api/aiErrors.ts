import axios from 'axios'

// Keyed by the backend's stable error codes; never parse message text.
const AI_ERROR_MESSAGES: Record<string, string> = {
  AI_INVALID_API_KEY: 'Invalid API key. Check your API key and try again.',
  AI_PERMISSION_DENIED: 'The API key does not have permission to use this model.',
  AI_MODEL_UNAVAILABLE: 'The selected AI model is unavailable. Check the selected model.',
  AI_RATE_LIMITED: 'AI provider rate limit reached. Please wait and try again.',
  AI_QUOTA_EXCEEDED: 'AI provider quota exceeded. Check your API quota or try again later.',
  AI_PROVIDER_UNAVAILABLE: 'The AI provider is temporarily unavailable. Please try again shortly.',
  AI_TIMEOUT: 'Could not reach the AI provider. Please try again.',
  AI_INVALID_RESPONSE: 'The AI provider returned an invalid response. Please try again.',
  AI_PROVIDER_ERROR: 'AI evaluation failed. Please try again.',
}

// The backend message is authoritative: it names the provider and carries the
// retry delay ("Gemini rate limit reached. Try again in 42 seconds."). The
// code map is only a fallback for responses without a message.
export function aiMessageForCode(code: string | null | undefined, message?: string | null): string {
  return message || (code && AI_ERROR_MESSAGES[code]) || 'AI request failed. Please try again.'
}

export function aiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data
    return data?.message || (data?.code && AI_ERROR_MESSAGES[data.code]) || fallback
  }
  return fallback
}
