import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Brain, Database, Zap, BarChart2, FlaskConical, BookOpen, Shield, LogOut, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getArchitect } from '@/api/architect'
import { logout } from '@/api/auth'
import { TAB_ARCHITECT, TAB_DATASET, TAB_TRAIN, TAB_EVALUATE, TAB_TEST, isTabUnlocked } from '@/lib/tabUnlock'
import { useAuth } from '@/context/AuthContext'

const WORKFLOW_ITEMS = [
  { to: '/architect', label: 'Architect', icon: Brain, bit: TAB_ARCHITECT },
  { to: '/dataset',   label: 'Dataset',   icon: Database, bit: TAB_DATASET },
  { to: '/train',     label: 'Train',     icon: Zap, bit: TAB_TRAIN },
  { to: '/evaluate',  label: 'Evaluate',  icon: BarChart2, bit: TAB_EVALUATE },
  { to: '/test',      label: 'Test',      icon: FlaskConical, bit: TAB_TEST },
]

export function Layout() {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()

  const { data } = useQuery({
    queryKey: ['architect'],
    queryFn: getArchitect,
    staleTime: 5_000,
  })
  // Default: Architect (0x01) + Test (0x10) always unlocked = 0x11 = 17
  const tabUnlock = data?.tab_unlock ?? 0x11

  const handleLogout = async () => {
    await logout()
    setUser(null)
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="flex w-52 flex-col border-r bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b">
          <Brain className="h-6 w-6 text-primary" />
          <span className="font-semibold text-sm tracking-tight">ferrite-studio</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto">
          {/* Workflow tabs */}
          {WORKFLOW_ITEMS.map(({ to, label, icon: Icon, bit }) => {
            const unlocked = isTabUnlocked(tabUnlock, bit)
            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    !unlocked && 'pointer-events-none opacity-40',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            )
          })}

          {/* Divider */}
          <div className="my-1 border-t" />

          {/* Library — locked when not signed in */}
          <NavLink
            to="/library"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                !user && 'pointer-events-none opacity-40',
              )
            }
          >
            <BookOpen className="h-4 w-4" />
            Library
          </NavLink>

          {/* Admin — only visible to admin users */}
          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <Shield className="h-4 w-4" />
              Admin
            </NavLink>
          )}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t space-y-2">
          {/* User identity */}
          {user ? (
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors w-full',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{user.username}</span>
            </NavLink>
          ) : (
            <p className="text-xs text-muted-foreground px-2">Not signed in</p>
          )}

          <p className="text-xs text-muted-foreground">ferrite-nn studio</p>

          {/* Logout */}
          {user && (
            <button
              onClick={() => void handleLogout()}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full px-2 py-1 rounded-md hover:bg-accent"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
