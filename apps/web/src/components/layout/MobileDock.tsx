import {
  BarChart3,
  Clapperboard,
  ClipboardList,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useAppStore } from '../../stores/useAppStore'

const ICON_STROKE = 1.5 as const

type NavDef = { to: string; label: string; icon: LucideIcon; end?: boolean }

const NAV_ITEMS_VI: NavDef[] = [
  { to: '/dashboard', label: 'Thư viện', icon: LayoutDashboard, end: true },
  { to: '/workspace', label: 'Học tập', icon: Clapperboard },
  { to: '/quiz', label: 'Quiz', icon: ClipboardList },
  { to: '/analytics', label: 'Số liệu', icon: BarChart3 },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
]
const NAV_ITEMS_EN: NavDef[] = [
  { to: '/dashboard', label: 'Library', icon: LayoutDashboard, end: true },
  { to: '/workspace', label: 'Workspace', icon: Clapperboard },
  { to: '/quiz', label: 'Quiz', icon: ClipboardList },
  { to: '/analytics', label: 'Stats', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

/**
 * Bottom navigation for &lt; md — replaces off-canvas sidebar; 44px+ touch targets.
 */
export function MobileDock() {
  const language = useAppStore((s) => s.language)
  const isVi = language === 'vi'
  const navItems = isVi ? NAV_ITEMS_VI : NAV_ITEMS_EN
  return (
    <nav
      className="ds-surface-glass fixed inset-x-0 bottom-0 z-50 border-t border-ds-border pt-1 shadow-[0_-4px_24px_rgba(0,0,0,0.35)] md:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      aria-label={isVi ? 'Điều hướng chính' : 'Primary'}
    >
      <ul className="mx-auto flex max-w-7xl items-stretch justify-around gap-0 px-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex min-w-0 flex-1 justify-center">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'ds-interactive flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-ds-sm px-2 py-1.5 text-[10px] font-bold uppercase tracking-tight',
                  isActive
                    ? 'text-ds-secondary'
                    : 'text-ds-text-secondary hover:text-ds-text-primary',
                ].join(' ')
              }
            >
              <Icon className="h-6 w-6 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              <span className="max-w-[4.5rem] truncate text-center leading-tight">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
