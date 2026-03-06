import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, FolderOpen, Box, HardDrive, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  listUsers,
  adminDeleteUser,
  updateUserRole,
  setUserActive,
  getUser,
  getUserArchitectures,
  getUserModels,
  listAllArchitectures,
  listAllModels,
  adminDeleteArchitecture,
  adminDeleteModel,
  getStats,
  type AdminUser,
  type AdminArchitecture,
  type AdminModel,
} from '@/api/admin'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

// ─── helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_024).toFixed(1)} KB`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

const PAGE_SIZE = 50

type AdminTab = 'stats' | 'users' | 'architectures' | 'models'

// ─── shared sub-components ──────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  sub?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="rounded-md bg-primary/10 p-3">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {children}
    </th>
  )
}

function PaginationBar({
  page,
  total,
  pageSize,
  onPrev,
  onNext,
}: {
  page: number
  total: number
  pageSize: number
  onPrev: () => void
  onNext: () => void
}) {
  const start = page * pageSize + 1
  const end = Math.min(start + pageSize - 1, total)
  const hasPrev = page > 0
  const hasNext = end < total

  if (total === 0) return null

  return (
    <div className="flex items-center justify-between mt-4">
      <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Showing {start}–{end} of {total}
      </span>
      <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext}>
        Next
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  )
}

function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        className="pl-9"
        placeholder={placeholder ?? 'Search...'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function EmptyRow({ cols, message = 'No results.' }: { cols: number; message?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  )
}

function ErrorRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-sm text-destructive">
        {message}
      </td>
    </tr>
  )
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="py-8 text-center text-sm text-muted-foreground">
        Loading...
      </td>
    </tr>
  )
}

// ─── inline delete confirmation ──────────────────────────────────────────────

function DeleteConfirm({
  onConfirm,
  onCancel,
  label = 'Delete',
}: {
  onConfirm: () => void
  onCancel: () => void
  label?: string
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="destructive" onClick={onConfirm}>
        {label}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </span>
  )
}

// ─── user detail panel ───────────────────────────────────────────────────────

function UserDetailPanel({
  userId,
  onDeleteArchitecture,
  onDeleteModel,
}: {
  userId: string
  onDeleteArchitecture: (id: string) => void
  onDeleteModel: (id: string) => void
}) {
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin-user-detail', userId],
    queryFn: () => getUser(userId),
  })

  const { data: archData, isLoading: archLoading } = useQuery({
    queryKey: ['admin-user-architectures', userId],
    queryFn: () => getUserArchitectures(userId, 3, 0),
  })

  const { data: modData, isLoading: modLoading } = useQuery({
    queryKey: ['admin-user-models', userId],
    queryFn: () => getUserModels(userId, 3, 0),
  })

  const [archDeleteId, setArchDeleteId] = useState<string | null>(null)
  const [modelDeleteId, setModelDeleteId] = useState<string | null>(null)

  if (detailLoading) {
    return <p className="text-sm text-muted-foreground py-2">Loading...</p>
  }

  return (
    <div className="space-y-4 py-2 text-sm">
      {detail && (
        <div className="flex gap-6 text-muted-foreground">
          <span>
            <strong className="text-foreground">{detail.architecture_count}</strong> architecture
            {detail.architecture_count !== 1 ? 's' : ''}
          </span>
          <span>
            <strong className="text-foreground">{detail.model_count}</strong> model
            {detail.model_count !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* architectures mini-list */}
        <div>
          <p className="font-medium mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Recent Architectures
          </p>
          {archLoading ? (
            <p className="text-muted-foreground text-xs">Loading...</p>
          ) : archData && archData.items.length > 0 ? (
            <ul className="space-y-1">
              {archData.items.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{a.name}</span>
                  {archDeleteId === a.id ? (
                    <DeleteConfirm
                      label="Confirm"
                      onConfirm={() => {
                        onDeleteArchitecture(a.id)
                        setArchDeleteId(null)
                      }}
                      onCancel={() => setArchDeleteId(null)}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-7 px-2"
                      onClick={() => setArchDeleteId(a.id)}
                    >
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">None.</p>
          )}
        </div>

        {/* models mini-list */}
        <div>
          <p className="font-medium mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Recent Models
          </p>
          {modLoading ? (
            <p className="text-muted-foreground text-xs">Loading...</p>
          ) : modData && modData.items.length > 0 ? (
            <ul className="space-y-1">
              {modData.items.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{m.name}</span>
                  {modelDeleteId === m.id ? (
                    <DeleteConfirm
                      label="Confirm"
                      onConfirm={() => {
                        onDeleteModel(m.id)
                        setModelDeleteId(null)
                      }}
                      onCancel={() => setModelDeleteId(null)}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-7 px-2"
                      onClick={() => setModelDeleteId(m.id)}
                    >
                      Delete
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">None.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Stats tab ───────────────────────────────────────────────────────────────

function StatsTab() {
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getStats,
  })

  // Fetch all models to compute storage total client-side (limit=1000)
  const { data: allModels } = useQuery({
    queryKey: ['admin-models-storage'],
    queryFn: () => listAllModels({ limit: 1000, offset: 0 }),
    staleTime: 30_000,
  })

  const totalBytes = allModels?.items.reduce((acc, m) => acc + m.file_size_bytes, 0) ?? 0
  const storageDisplay = totalBytes > 0 ? formatBytes(totalBytes) : '0 KB'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total users" value={stats?.users ?? 0} icon={Users} />
        <StatCard label="Architectures" value={stats?.architectures ?? 0} icon={FolderOpen} />
        <StatCard label="Models" value={stats?.models ?? 0} icon={Box} />
        <StatCard label="Storage" value={storageDisplay} icon={HardDrive} sub="across all models" />
      </div>
    </div>
  )
}

// ─── Users tab ───────────────────────────────────────────────────────────────

function UserRow({
  user,
  currentUserId,
  onRoleChange,
  onDelete,
  onToggleActive,
}: {
  user: AdminUser
  currentUserId: string
  onRoleChange: (id: string, role: 'user' | 'admin') => void
  onDelete: (id: string) => void
  onToggleActive: (id: string, active: boolean) => void
}) {
  const isSelf = user.id === currentUserId
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const qc = useQueryClient()

  const archDeleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteArchitecture(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-user-architectures', user.id] })
      void qc.invalidateQueries({ queryKey: ['admin-user-detail', user.id] })
      void qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })

  const modelDeleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteModel(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-user-models', user.id] })
      void qc.invalidateQueries({ queryKey: ['admin-user-detail', user.id] })
      void qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })

  return (
    <>
      <tr className="border-b last:border-0 even:bg-muted/30">
        <td className="py-3 px-4 text-sm font-medium">{user.username}</td>
        <td className="py-3 px-4 text-sm text-muted-foreground">{user.email}</td>
        <td className="py-3 px-4">
          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge>
        </td>
        <td className="py-3 px-4">
          {user.is_active ? (
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
              Active
            </Badge>
          ) : (
            <Badge variant="destructive">Suspended</Badge>
          )}
        </td>
        <td className="py-3 px-4 text-sm text-muted-foreground">{fmtDate(user.created_at)}</td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-1 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              disabled={isSelf}
              onClick={() => onRoleChange(user.id, user.role === 'admin' ? 'user' : 'admin')}
            >
              {user.role === 'admin' ? 'Make user' : 'Make admin'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isSelf}
              onClick={() => onToggleActive(user.id, !user.is_active)}
            >
              {user.is_active ? 'Suspend' : 'Unsuspend'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Collapse' : 'Details'}
            </Button>
            {deleteConfirm ? (
              <DeleteConfirm
                label="Confirm"
                onConfirm={() => {
                  onDelete(user.id)
                  setDeleteConfirm(false)
                }}
                onCancel={() => setDeleteConfirm(false)}
              />
            ) : (
              <Button
                size="sm"
                variant="ghost"
                disabled={isSelf}
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteConfirm(true)}
              >
                Delete
              </Button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b bg-muted/10">
          <td colSpan={6} className="px-6 py-3">
            <UserDetailPanel
              userId={user.id}
              onDeleteArchitecture={(id) => archDeleteMut.mutate(id)}
              onDeleteModel={(id) => modelDeleteMut.mutate(id)}
            />
          </td>
        </tr>
      )}
    </>
  )
}

function UsersTab({ currentUserId }: { currentUserId: string }) {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-users', page, search],
    queryFn: () => listUsers(PAGE_SIZE, page * PAGE_SIZE, search || undefined),
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'user' | 'admin' }) => updateUserRole(id, role),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const activeMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setUserActive(id, active),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteUser(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] })
      void qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <SearchBar
        value={searchInput}
        onChange={setSearchInput}
        placeholder="Search by username or email..."
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <TableHeader>Username</TableHeader>
                  <TableHeader>Email</TableHeader>
                  <TableHeader>Role</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader>Joined</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody>
                {isLoading && <LoadingRow cols={6} />}
                {isError && <ErrorRow cols={6} message="Failed to load users." />}
                {!isLoading && !isError && items.length === 0 && (
                  <EmptyRow cols={6} message="No users found." />
                )}
                {items.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    currentUserId={currentUserId}
                    onRoleChange={(id, role) => roleMut.mutate({ id, role })}
                    onDelete={(id) => deleteMut.mutate(id)}
                    onToggleActive={(id, active) => activeMut.mutate({ id, active })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PaginationBar
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPrev={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  )
}

// ─── Architectures tab ───────────────────────────────────────────────────────

function ArchitecturesTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const { data: usersData } = useQuery({
    queryKey: ['admin-users-filter'],
    queryFn: () => listUsers(200, 0),
    staleTime: 60_000,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-architectures', page, search, userFilter],
    queryFn: () =>
      listAllArchitectures({
        search: search || undefined,
        userId: userFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteArchitecture(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-architectures'] })
      void qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setDeleteId(null)
    },
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="flex-1">
          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search by name..."
          />
        </div>
        <div className="relative">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full sm:w-48"
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="">All users</option>
            {usersData?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Owner</TableHeader>
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody>
                {isLoading && <LoadingRow cols={4} />}
                {isError && <ErrorRow cols={4} message="Failed to load architectures." />}
                {!isLoading && !isError && items.length === 0 && (
                  <EmptyRow cols={4} message="No architectures found." />
                )}
                {items.map((a: AdminArchitecture) => (
                  <tr key={a.id} className="border-b last:border-0 even:bg-muted/30">
                    <td className="py-3 px-4 font-medium">{a.name}</td>
                    <td className="py-3 px-4 text-muted-foreground">{a.owner_username}</td>
                    <td className="py-3 px-4 text-muted-foreground">{fmtDate(a.created_at)}</td>
                    <td className="py-3 px-4">
                      {deleteId === a.id ? (
                        <DeleteConfirm
                          label="Confirm"
                          onConfirm={() => deleteMut.mutate(a.id)}
                          onCancel={() => setDeleteId(null)}
                        />
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(a.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PaginationBar
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPrev={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  )
}

// ─── Models tab ──────────────────────────────────────────────────────────────

function ModelsTab() {
  const qc = useQueryClient()
  const [page, setPage] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [userFilter, setUserFilter] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchInput])

  const { data: usersData } = useQuery({
    queryKey: ['admin-users-filter'],
    queryFn: () => listUsers(200, 0),
    staleTime: 60_000,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-models', page, search, userFilter],
    queryFn: () =>
      listAllModels({
        search: search || undefined,
        userId: userFilter || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteModel(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-models'] })
      void qc.invalidateQueries({ queryKey: ['admin-stats'] })
      void qc.invalidateQueries({ queryKey: ['admin-models-storage'] })
      setDeleteId(null)
    },
  })

  const total = data?.total ?? 0
  const items = data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className="flex-1">
          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search by name..."
          />
        </div>
        <div className="relative">
          <select
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-full sm:w-48"
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value)
              setPage(0)
            }}
          >
            <option value="">All users</option>
            {usersData?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Owner</TableHeader>
                  <TableHeader>Size</TableHeader>
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody>
                {isLoading && <LoadingRow cols={5} />}
                {isError && <ErrorRow cols={5} message="Failed to load models." />}
                {!isLoading && !isError && items.length === 0 && (
                  <EmptyRow cols={5} message="No models found." />
                )}
                {items.map((m: AdminModel) => (
                  <tr key={m.id} className="border-b last:border-0 even:bg-muted/30">
                    <td className="py-3 px-4 font-medium">{m.name}</td>
                    <td className="py-3 px-4 text-muted-foreground">{m.owner_username}</td>
                    <td className="py-3 px-4 text-muted-foreground">{formatBytes(m.file_size_bytes)}</td>
                    <td className="py-3 px-4 text-muted-foreground">{fmtDate(m.created_at)}</td>
                    <td className="py-3 px-4">
                      {deleteId === m.id ? (
                        <DeleteConfirm
                          label="Confirm"
                          onConfirm={() => deleteMut.mutate(m.id)}
                          onCancel={() => setDeleteId(null)}
                        />
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(m.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <PaginationBar
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        onPrev={() => setPage((p) => p - 1)}
        onNext={() => setPage((p) => p + 1)}
      />
    </div>
  )
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

const TABS: { id: AdminTab; label: string; description: string }[] = [
  { id: 'stats', label: 'Stats', description: 'Platform-wide statistics and storage overview.' },
  { id: 'users', label: 'Users', description: 'Search, manage roles, suspend, and delete user accounts.' },
  {
    id: 'architectures',
    label: 'Architectures',
    description: 'Browse and delete saved architectures across all users.',
  },
  { id: 'models', label: 'Models', description: 'Browse and delete trained models across all users.' },
]

// ─── AdminPage ────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { user: currentUser } = useAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>('stats')

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-center space-y-2">
            <p className="text-lg font-semibold">Not authorized</p>
            <p className="text-sm text-muted-foreground">
              This page is only accessible to administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currentTabMeta = TABS.find((t) => t.id === activeTab)!

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">{currentTabMeta.description}</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            className={
              activeTab === tab.id
                ? 'border-b-2 border-primary rounded-none text-foreground font-semibold'
                : 'rounded-none text-muted-foreground'
            }
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'stats' && <StatsTab />}
      {activeTab === 'users' && <UsersTab currentUserId={currentUser.id} />}
      {activeTab === 'architectures' && <ArchitecturesTab />}
      {activeTab === 'models' && <ModelsTab />}
    </div>
  )
}
