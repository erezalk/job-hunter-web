import { apiClient } from './client'

/** A company the user wants AI job discovery to skip. Independent of the Board. */
export interface ExcludedCompany {
  id: number
  name: string
}

const URL = '/api/settings/excluded-companies'

export async function fetchExcludedCompanies(): Promise<ExcludedCompany[]> {
  const response = await apiClient.get<ExcludedCompany[]>(URL)
  return response.data
}

export async function addExcludedCompany(name: string): Promise<ExcludedCompany> {
  const response = await apiClient.post<ExcludedCompany>(URL, { name: name.trim() })
  return response.data
}

export async function renameExcludedCompany(id: number, name: string): Promise<ExcludedCompany> {
  const response = await apiClient.patch<ExcludedCompany>(`${URL}/${id}`, { name: name.trim() })
  return response.data
}

export async function removeExcludedCompany(id: number): Promise<void> {
  await apiClient.delete(`${URL}/${id}`)
}
