import { apiClient } from './client'

export interface ApplicationStatus {
  code: string
  label: string
  sortOrder: number
  terminal: boolean
}

export interface Application {
  id: number
  jobId: number
  jobTitle: string
  userId: number
  status: ApplicationStatus
  appliedAt: string | null
  notes: string | null
  starred: boolean
  createdAt: string
  updatedAt: string
}

export interface ApplicationStage {
  id: number
  name: string
  scheduledAt: string | null
  interviewerNames: string | null
  notes: string | null
  outcome: string | null
  createdAt: string
  updatedAt: string
}

export interface ApplicationStageRequest {
  name: string
  scheduledAt?: string | null
  interviewerNames?: string | null
  notes?: string | null
  outcome?: string | null
}

export interface ApplicationStatusHistoryEntry {
  id: number
  status: ApplicationStatus
  enteredAt: string
  notes: string | null
}

export async function fetchApplications(status?: string): Promise<Application[]> {
  const response = await apiClient.get<Application[]>('/api/applications', {
    params: status ? { status } : undefined,
  })
  return response.data
}

export async function fetchApplication(id: number): Promise<Application> {
  const response = await apiClient.get<Application>(`/api/applications/${id}`)
  return response.data
}

export async function fetchApplicationStatuses(): Promise<ApplicationStatus[]> {
  const response = await apiClient.get<ApplicationStatus[]>('/api/application-statuses')
  return response.data
}

export async function changeApplicationStatus(
  applicationId: number,
  statusCode: string,
  notes?: string,
): Promise<Application> {
  const response = await apiClient.patch<Application>(`/api/applications/${applicationId}/status`, {
    statusCode,
    notes,
  })
  return response.data
}

export async function updateApplicationNotes(applicationId: number, notes: string): Promise<Application> {
  const response = await apiClient.patch<Application>(`/api/applications/${applicationId}/notes`, { notes })
  return response.data
}

// One row of the header's "Upcoming stages" list (GET /api/stages/upcoming).
export interface UpcomingStage {
  stageId: number
  stageName: string
  scheduledAt: string
  applicationId: number
  jobId: number
  jobTitle: string
  companyName: string | null
}

export async function fetchUpcomingStages(): Promise<UpcomingStage[]> {
  const response = await apiClient.get<UpcomingStage[]>('/api/stages/upcoming')
  return response.data
}

export async function fetchApplicationStages(applicationId: number): Promise<ApplicationStage[]> {
  const response = await apiClient.get<ApplicationStage[]>(`/api/applications/${applicationId}/stages`)
  return response.data
}

export async function createApplicationStage(
  applicationId: number,
  request: ApplicationStageRequest,
): Promise<ApplicationStage> {
  const response = await apiClient.post<ApplicationStage>(`/api/applications/${applicationId}/stages`, request)
  return response.data
}

export async function updateApplicationStage(
  applicationId: number,
  stageId: number,
  request: ApplicationStageRequest,
): Promise<ApplicationStage> {
  const response = await apiClient.patch<ApplicationStage>(
    `/api/applications/${applicationId}/stages/${stageId}`,
    request,
  )
  return response.data
}

export async function deleteApplicationStage(applicationId: number, stageId: number): Promise<void> {
  await apiClient.delete(`/api/applications/${applicationId}/stages/${stageId}`)
}

export async function fetchApplicationStatusHistory(applicationId: number): Promise<ApplicationStatusHistoryEntry[]> {
  const response = await apiClient.get<ApplicationStatusHistoryEntry[]>(
    `/api/applications/${applicationId}/status-history`,
  )
  return response.data
}

export async function deleteApplication(applicationId: number): Promise<void> {
  await apiClient.delete(`/api/applications/${applicationId}`)
}

export async function setApplicationStarred(applicationId: number, starred: boolean): Promise<Application> {
  const response = await apiClient.patch<Application>(`/api/applications/${applicationId}/starred`, { starred })
  return response.data
}

// Board drop: destination status plus at most one anchor ticket of that
// column to land directly before/after; no anchor appends to the column end.
export interface MoveRequest {
  statusCode: string
  beforeApplicationId?: number
  afterApplicationId?: number
}

export async function moveApplication(applicationId: number, request: MoveRequest): Promise<Application> {
  const response = await apiClient.patch<Application>(`/api/applications/${applicationId}/move`, request)
  return response.data
}
