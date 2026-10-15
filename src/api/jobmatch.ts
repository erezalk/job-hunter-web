import { apiClient } from './client'

export interface JobMatch {
  fitScore: number | null
  matchingSkills: string[]
  missingSkills: string[]
  concerns: string[]
  provider: string | null
  model: string | null
  evaluatedAt: string | null
}

export async function fetchJobMatch(jobId: number): Promise<JobMatch | null> {
  try {
    const response = await apiClient.get<JobMatch>(`/api/jobs/${jobId}/match`)
    return response.data
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

export async function evaluateJobMatch(jobId: number, force = false): Promise<JobMatch> {
  const response = await apiClient.post<JobMatch>(`/api/jobs/${jobId}/match/evaluate`, null, {
    params: force ? { force: true } : undefined,
  })
  return response.data
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err &&
    (err as { response?: { status?: number } }).response?.status === 404
  )
}
