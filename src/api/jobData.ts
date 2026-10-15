import { apiClient } from './client'

export interface ImportSummary {
  jobs: number
  stages: number
  statusHistoryEntries: number
  aiMatches: number
}

// The export is a JSON file (format version 1) with all of the current user's
// job and Board data. Same name the server gives it; the Content-Disposition
// header itself is not readable cross-origin.
export async function fetchJobDataExport(): Promise<{ blob: Blob; fileName: string }> {
  const response = await apiClient.get<Blob>('/api/job-data/export', { responseType: 'blob' })
  return { blob: response.data, fileName: `job-hunter-export-${new Date().toISOString().slice(0, 10)}.json` }
}

// Sends the file content as-is; the server validates everything and restores
// all or nothing into an empty Board.
export async function importJobData(fileContent: string): Promise<ImportSummary> {
  const response = await apiClient.post<ImportSummary>('/api/job-data/import', fileContent, {
    headers: { 'Content-Type': 'application/json' },
  })
  return response.data
}
