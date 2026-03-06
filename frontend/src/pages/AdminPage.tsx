import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, FolderOpen, Box } from 'lucide-react'
import {
  listUsers,
  adminDeleteUser,
  updateUserRole,
  getStats,
  type AdminUser,
} from '@/api/admin'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const PAGE_SIZE = 50

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="rounded-md bg-primary/10 p-3">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function UserRow({
  user,
  currentUserId,
  onRoleChange,
  onDelete,
}: {
  user: AdminUser
  currentUserId: string
  onRoleChange: (id: string, role: 'user' | 'admin') => void
  onDelete: (id: string) => void
}) {
  const isSelf = user.id === currentUserId
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  return (
    <tr className="border-b last:border-0">
      <td className="py-3 px-4 text-sm">{user.email}</td>
      <td className="py-3 px-4 text-sm text-muted-foreground">{user.username}</td>
      <td className="py-3 px-4">
        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
          {user.role}
        </Badge>
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground">
        {new Date(user.created_at).toLocaleDateString()}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isSelf}
            onClick={() => onRoleChange(user.id, user.role === 'admin' ? 'user' : 'admin')}
          >
            {user.role === 'admin' ? 'Make user' : 'Make admin'}
          </Button>
          {!deleteConfirm ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={isSelf}
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteConfirm(true)}
            >
              Delete
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  onDelete(user.id)
                  setDeleteConfirm(false)
                }}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

export function AdminPage() {
  const { user: currentUser } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(0)

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: getStats,
  })

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () => listUsers(PAGE_SIZE, page * PAGE_SIZE),
  })

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'user' | 'admin' }) =>
      updateUserRole(id, role),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteUser(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-users'] })
      void qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
  })

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

  const total = usersData?.total ?? 0
  const items = usersData?.items ?? []
  const start = page * PAGE_SIZE + 1
  const end = Math.min(start + items.length - 1, total)
  const hasPrev = page > 0
  const hasNext = end < total

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin panel</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage users and view platform statistics.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total users" value={stats.users} icon={Users} />
          <StatCard label="Architectures" value={stats.architectures} icon={FolderOpen} />
          <StatCard label="Models" value={stats.models} icon={Box} />
        </div>
      )}

      {/* Users table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Users</CardTitle>
            {total > 0 && (
              <span className="text-sm text-muted-foreground">
                Showing {start}–{end} of {total}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {usersLoading ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Email
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Username
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Role
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      currentUserId={currentUser.id}
                      onRoleChange={(id, role) => roleMut.mutate({ id, role })}
                      onDelete={(id) => deleteMut.mutate(id)}
                    />
                  ))}
                </tbody>
              </table>
              {items.length === 0 && (
                <p className="p-6 text-sm text-muted-foreground">No users found.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
