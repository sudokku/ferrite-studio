export interface SavedArchitecture {
  id: string
  name: string
  spec: Record<string, unknown>
  created_at: string
}

export interface SavedModel {
  id: string
  name: string
  storage_key: string
  file_size_bytes: number
  input_type: Record<string, unknown> | null
  output_labels: string[] | null
  created_at: string
}

export async function listArchitectures(): Promise<SavedArchitecture[]> {
  const res = await fetch('/user/architectures', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to list architectures')
  return res.json() as Promise<SavedArchitecture[]>
}

export async function saveArchitecture(
  name: string,
  spec: Record<string, unknown>,
): Promise<SavedArchitecture> {
  const res = await fetch('/user/architectures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, spec }),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string }
    throw new Error(err.detail ?? 'Failed to save architecture')
  }
  return res.json() as Promise<SavedArchitecture>
}

export async function deleteArchitecture(id: string): Promise<void> {
  const res = await fetch(`/user/architectures/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete architecture')
}

export async function listModels(): Promise<SavedModel[]> {
  const res = await fetch('/user/models', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to list models')
  return res.json() as Promise<SavedModel[]>
}

export async function importModel(file: File, name: string): Promise<SavedModel> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('name', name)
  const res = await fetch('/user/models/import', {
    method: 'POST',
    body: fd,
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string }
    throw new Error(err.detail ?? 'Failed to import model')
  }
  return res.json() as Promise<SavedModel>
}

export function getModelDownloadUrl(id: string): string {
  return `/user/models/${id}/download`
}

export async function deleteUserModel(id: string): Promise<void> {
  const res = await fetch(`/user/models/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete model')
}
