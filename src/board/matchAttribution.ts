import type { JobMatch } from '../api/jobmatch'

// JobMatch.provider of a result that an external AI (MCP add_job) calculated
// and Job Hunter merely stored; every other value is a configured provider id.
export const EXTERNAL_AI_PROVIDER = 'EXTERNAL_AI'

/** "External AI · Claude Opus 5.5", "External AI", or the usual "GEMINI · model". */
export function matchAttribution(match: Pick<JobMatch, 'provider' | 'model'>): string {
  if (match.provider === EXTERNAL_AI_PROVIDER) {
    return match.model ? `External AI · ${match.model}` : 'External AI'
  }
  return `${match.provider} · ${match.model}`
}
