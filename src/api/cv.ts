import { apiClient } from './client'

export interface Cv {
  id: number
  fileName: string | null
  contentType: string | null
  fileSizeBytes: number | null
  extractionStatus: 'SUCCESS' | 'EMPTY' | 'FAILED' | 'PENDING'
  extractionWarning: string | null
  extractedText: string | null
  uploadedAt: string
}

export interface ActiveCvResponse {
  cv: Cv | null
}

export async function fetchActiveCv(): Promise<ActiveCvResponse> {
  const response = await apiClient.get<ActiveCvResponse>('/api/cv')
  return response.data
}

export async function uploadCv(file: File): Promise<Cv> {
  const formData = new FormData()
  formData.append('file', file)
  const response = await apiClient.post<Cv>('/api/cv', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return response.data
}

// Spring Security's default X-Frame-Options: DENY (unchanged, on purpose —
// see CvPage.tsx) applies to every response, so an <iframe> cannot load
// `/api/cv/file` directly by URL: the browser blocks the framed response.
// Fetching the bytes through the authenticated API client and handing the
// iframe a same-origin blob: URL instead sidesteps that without touching
// any security header. `responseType: 'blob'` also stops axios from trying
// (and failing) to parse binary PDF bytes as JSON.
export async function fetchCvFileBlob(): Promise<Blob> {
  const response = await apiClient.get('/api/cv/file', { responseType: 'blob' })
  return response.data
}
