export interface UserProfile {
  id: string
  email: string
  username: string
  role: 'user' | 'admin'
  created_at: string
}

export async function register(
  email: string,
  username: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, username, password }),
  })
  if (res.ok) return { ok: true }
  const body = await res.json().catch(() => ({})) as { detail?: string }
  return { ok: false, error: body.detail ?? 'Registration failed' }
}

export async function login(
  email: string,
  password: string,
): Promise<{ ok: boolean; username?: string; error?: string }> {
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  })
  if (res.ok) {
    const body = await res.json() as { username?: string }
    return { ok: true, username: body.username }
  }
  const body = await res.json().catch(() => ({})) as { detail?: string }
  return { ok: false, error: body.detail ?? 'Login failed' }
}

export async function logout(): Promise<void> {
  await fetch('/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
}

export async function getMe(): Promise<UserProfile | null> {
  const res = await fetch('/auth/me', { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) return null
  return res.json() as Promise<UserProfile>
}

export async function updateProfile(
  body: { username?: string; email?: string },
): Promise<UserProfile> {
  const res = await fetch('/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string }
    throw new Error(err.detail ?? 'Update failed')
  }
  return res.json() as Promise<UserProfile>
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await fetch('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string }
    throw new Error(err.detail ?? 'Password change failed')
  }
}

export async function deleteSelf(password: string): Promise<void> {
  const res = await fetch('/auth/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string }
    throw new Error(err.detail ?? 'Account deletion failed')
  }
}
