import {
  BarChart3,
  Clapperboard,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Settings,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useShell } from './ShellContext'

const ICON_STROKE = 1.5 as const

type NavDef = { to: string; label: string; icon: LucideIcon; end?: boolean }

const NAV_ITEMS: NavDef[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/workspace', label: 'Workspace', icon: Clapperboard },
  { to: '/quiz', label: 'Quiz', icon: ClipboardList },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function MainSidebar() {
  const { mobileNavOpen, setMobileNavOpen } = useShell()

  const closeIfMobile = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setMobileNavOpen(false)
    }
  }

  return (
    <aside
      id="main-navigation"
      className={[
        'ds-surface-glass shadow-ds-soft fixed left-0 top-0 z-50 flex h-screen flex-col rounded-r-ds-lg border-r border-ds-border',
        'w-64 max-w-[min(100vw,20rem)] transition-transform duration-300 ease-out',
        'max-md:-translate-x-full',
        mobileNavOpen && 'max-md:translate-x-0',
        'md:z-40 md:translate-x-0 md:rounded-r-ds-lg md:transition-none',
        'md:w-16 lg:w-64',
      ].join(' ')}
      aria-label="Main navigation"
    >
      <div className="flex flex-1 flex-col px-4 pt-6 pb-4 md:items-center md:px-2 lg:items-stretch lg:px-4">
        <div className="mb-8 px-2 md:mb-6 md:flex md:w-full md:flex-col md:items-center md:px-0 lg:mb-8 lg:block lg:px-2">
          <p className="text-xs font-bold uppercase tracking-wider text-ds-text-secondary md:sr-only lg:not-sr-only">
            EtherAI
          </p>
          <div className="mt-2 flex items-center gap-2 md:mt-0 md:justify-center lg:mt-2 lg:block">
            <div
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-ds-sm border border-ds-border bg-ds-primary/20 text-ds-secondary md:flex lg:hidden"
              aria-hidden
            >
              <Clapperboard className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </div>
            <p className="text-lg font-bold leading-tight text-ds-text-primary md:sr-only lg:not-sr-only">
              Video → Knowledge
            </p>
          </div>
        </div>

        <nav
          className="flex flex-1 flex-col gap-2 px-2 md:w-full md:items-center md:px-0 lg:items-stretch lg:px-2"
          role="navigation"
        >
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to + label}
              to={to}
              end={end}
              title={label}
              onClick={closeIfMobile}
              className={({ isActive }) =>
                [
                  'ds-interactive flex items-center gap-2 rounded-ds-sm py-2 outline-none',
                  'md:max-lg:w-12 md:max-lg:justify-center md:max-lg:px-0 md:max-lg:py-3',
                  'lg:px-4',
                  'focus-visible:ring-2 focus-visible:ring-ds-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-ds-bg',
                  isActive
                    ? 'bg-ds-primary font-bold text-ds-text-primary shadow-ds-soft hover:brightness-110'
                    : 'font-normal text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-text-primary',
                ].join(' ')
              }
            >
              <Icon className="h-6 w-6 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              <span className="text-ds-base md:sr-only lg:not-sr-only">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto border-t border-ds-border px-4 py-4 md:px-2 lg:px-4">
        <div className="ds-transition flex items-center gap-4 rounded-ds-lg px-2 py-4 hover:bg-ds-border/20 md:flex-col md:gap-2 md:py-3 lg:flex-row lg:gap-4 lg:py-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-ds-sm border border-ds-border bg-ds-bg text-ds-text-secondary shadow-ds-soft"
            aria-hidden
          >
            <span className="text-sm font-bold text-ds-secondary">KV</span>
          </div>
          <div className="min-w-0 flex-1 md:hidden lg:block">
            <p className="truncate text-sm font-bold text-ds-text-primary">Kim Vale</p>
            <p className="truncate text-xs font-normal text-ds-text-secondary">kim.vale@example.com</p>
          </div>
          <NavLink
            to="/login"
            title="Sign out"
            onClick={closeIfMobile}
            className="ds-interactive-icon rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-secondary md:mx-auto lg:mx-0"
            aria-label="Sign out"
          >
            <LogOut className="h-6 w-6" strokeWidth={ICON_STROKE} />
          </NavLink>
        </div>
      </div>
    </aside>
  )
}
