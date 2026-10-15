import { apiClient } from './client'
import type { Application } from './applications'
import type { JobRequest } from './jobs'

export interface BoardCard {
  applicationId: number
  jobId: number
  companyName: string | null
  title: string
  location: string | null
  workModel: string | null
  fitScore: number | null
  statusCode: string
  starred: boolean
  discoveredAt: string
  createdAt: string
}

export async function fetchBoard(): Promise<BoardCard[]> {
  const response = await apiClient.get<BoardCard[]>('/api/board')
  return response.data
}

export interface AddJobResult {
  application: Application
  // True when the job (same company + title) was already on the Board; nothing new was created.
  alreadyOnBoard: boolean
}

export async function addAndTrackJob(request: JobRequest): Promise<AddJobResult> {
  const response = await apiClient.post<Application>('/api/board/jobs', request)
  return { application: response.data, alreadyOnBoard: response.status === 200 }
}
