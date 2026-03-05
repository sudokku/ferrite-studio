import { NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Brain, Database, Zap, BarChart2, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getArchitect } from '@/api/architect'
import { TAB_ARCHITECT, TAB_DATASET, TAB_TRAIN, TAB_EVALUATE, TAB_TEST, isTabUnlocked } from '@/lib/tabUnlock'

const NAV_ITEMS = [
  { to: '/architect', label: 'Architect', icon: Brain, bit: TAB_ARCHITECT },
  { to: '/dataset',   label: 'Dataset',   icon: Database, bit: TAB_DATASET },
  { to: '/train',     label: 'Train',     icon: Zap, bit: TAB_TRAIN },
  { to: '/evaluate',  label: 'Evaluate',  icon: BarChart2, bit: TAB_EVALUATE },
  { to: '/test',      label: 'Test',      icon: FlaskConical, bit: TAB_TEST },
]

export function Layout() {
  const { data } = useQuery({
    queryKey: ['architect'],
    queryFn: getArchitect,
    staleTime: 5_000,
  })
  // Default: Architect (0x01) + Test (0x10) always unlocked = 0x11 = 17
  const tabUnlock = data?.tab_unlock ?? 0x11

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
        <nav className="flex flex-col gap-1 p-2 flex-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, bit }) => {
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
        </nav>
        {/* Footer */}
        <div className="px-4 py-3 border-t text-xs text-muted-foreground">
          ferrite-nn studio
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
