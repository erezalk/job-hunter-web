import { apiClient } from './client'

export interface Job {
  id: number
  companyId: number | null
  companyName: string | null
  title: string
  description: string | null
  descriptionDiscarded: boolean
  location: string | null
  workModel: string | null
  url: string | null
  salaryMin: number | null
  salaryMax: number | null
  currency: string | null
  // Free text; null for jobs that predate the field.
  source: string | null
  fitScore: number | null
  discoveredAt: string
  createdAt: string
  updatedAt: string
}

export interface JobRequest {
  title: string
  companyName?: string
  description?: string
  location?: string
  workModel?: string
  url?: string
  salaryMin?: number
  salaryMax?: number
  currency?: string
  // Only sent when editing a job; Add Job never sends it (the server assigns it).
  source?: string
}

export async function fetchJob(id: number): Promise<Job> {
  const response = await apiClient.get<Job>(`/api/jobs/${id}`)
  return response.data
}

export async function updateJob(id: number, request: JobRequest): Promise<Job> {
  const response = await apiClient.patch<Job>(`/api/jobs/${id}`, request)
  return response.data
}
