export interface AdminUser {
  id: string
  email: string
  username: string
  role: 'user' | 'admin'
  created_at: string
  is_active: boolean
}

export async function listUsers(
  limit = 50,
  offset = 0,
): Promise<{ total: number; items: AdminUser[] }> {
  const url = `/admin/users?limit=${limit}&offset=${offset}`
  const res = await fetch(url, { credentials: 'include' })
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

export async function getStats(): Promise<{
  users: number
  architectures: number
  models: number
}> {
  const res = await fetch('/admin/stats', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed to fetch stats')
  return res.json() as Promise<{ users: number; architectures: number; models: number }>
}
