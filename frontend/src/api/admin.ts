export interface AdminUser {
  id: string
  email: string
  username: string
  role: 'user' | 'admin'
  created_at: string
  is_active: boolean
}

export interface AdminUserDetail extends AdminUser {
  architecture_count: number
  model_count: number
}

export interface AdminArchitecture {
  id: string
  name: string
  created_at: string
  owner_id: string
  owner_username: string
  owner_email: string
}

export interface AdminModel {
  id: string
  name: string
  storage_key: string
  file_size_bytes: number
  created_at: string
  owner_id: string
  owner_username: string
  owner_email: string
}

export async function listUsers(
  limit = 50,
  offset = 0,
  search?: string,
): Promise<{ total: number; items: AdminUser[] }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  if (search) params.set('search', search)
  const res = await fetch(`/admin/users?${params.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to list users')
  return res.json() as Promise<{ total: number; items: AdminUser[] }>
}

export async function adminDeleteUser(id: string): Promise<void> {
  const res = await fetch(`/admin/users/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete user')
}

export async function updateUserRole(
  id: string,
  role: 'user' | 'admin',
): Promise<AdminUser> {
  const res = await fetch(`/admin/users/${id}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to update user role')
  return res.json() as Promise<AdminUser>
}

export async function setUserActive(id: string, isActive: boolean): Promise<AdminUser> {
  const res = await fetch(`/admin/users/${id}/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_active: isActive }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to update user active status')
  return res.json() as Promise<AdminUser>
}

export async function getUser(id: string): Promise<AdminUserDetail> {
  const res = await fetch(`/admin/users/${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch user')
  return res.json() as Promise<AdminUserDetail>
}

export async function getUserArchitectures(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<{ total: number; items: AdminArchitecture[] }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const res = await fetch(`/admin/users/${userId}/architectures?${params.toString()}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to fetch user architectures')
  return res.json() as Promise<{ total: number; items: AdminArchitecture[] }>
}

export async function getUserModels(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<{ total: number; items: AdminModel[] }> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  const res = await fetch(`/admin/users/${userId}/models?${params.toString()}`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to fetch user models')
  return res.json() as Promise<{ total: number; items: AdminModel[] }>
}

export async function listAllArchitectures(params?: {
  userId?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<{ total: number; items: AdminArchitecture[] }> {
  const qs = new URLSearchParams()
  if (params?.userId) qs.set('user_id', params.userId)
  if (params?.search) qs.set('search', params.search)
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.offset != null) qs.set('offset', String(params.offset))
  const res = await fetch(`/admin/architectures?${qs.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch architectures')
  return res.json() as Promise<{ total: number; items: AdminArchitecture[] }>
}

export async function listAllModels(params?: {
  userId?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<{ total: number; items: AdminModel[] }> {
  const qs = new URLSearchParams()
  if (params?.userId) qs.set('user_id', params.userId)
  if (params?.search) qs.set('search', params.search)
  if (params?.limit != null) qs.set('limit', String(params.limit))
  if (params?.offset != null) qs.set('offset', String(params.offset))
  const res = await fetch(`/admin/models?${qs.toString()}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch models')
  return res.json() as Promise<{ total: number; items: AdminModel[] }>
}

export async function adminDeleteArchitecture(id: string): Promise<void> {
  const res = await fetch(`/admin/architectures/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete architecture')
}

export async function adminDeleteModel(id: string): Promise<void> {
  const res = await fetch(`/admin/models/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete model')
}

export async function getStats(): Promise<{
  users: number
  architectures: number
  models: number
}> {
  const res = await fetch('/admin/stats', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json() as Promise<{ users: number; architectures: number; models: number }>
}
