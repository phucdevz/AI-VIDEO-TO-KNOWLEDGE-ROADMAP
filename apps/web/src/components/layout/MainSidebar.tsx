import {
  BarChart3,
  Clapperboard,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Settings,
} from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { AvatarWithNotificationBell } from './AvatarWithNotificationBell'
import { useAppStore } from '../../stores/useAppStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { useShell } from './ShellContext'

const ICON_STROKE = 1.5 as const

type NavDef = { to: string; label: string; icon: LucideIcon; end?: boolean }

const NAV_ITEMS_VI: NavDef[] = [
  { to: '/dashboard', label: 'Bảng điều khiển', icon: LayoutDashboard, end: true },
  { to: '/workspace', label: 'Không gian học', icon: Clapperboard },
  { to: '/quiz', label: 'Quiz', icon: ClipboardList },
  { to: '/analytics', label: 'Phân tích', icon: BarChart3 },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
]
const NAV_ITEMS_EN: NavDef[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/workspace', label: 'Workspace', icon: Clapperboard },
  { to: '/quiz', label: 'Quiz', icon: ClipboardList },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function MainSidebar() {
  const { sidebarCollapsed, toggleSidebarCollapsed } = useShell()
  const user = useAuthStore((s) => s.user)
  const language = useAppStore((s) => s.language)
  const isVi = language === 'vi'
  const navItems = isVi ? NAV_ITEMS_VI : NAV_ITEMS_EN
  const signOut = useAuthStore((s) => s.signOut)
  const unbindLibrary = useAppStore((s) => s.unbindLibraryRealtime)
  const navigate = useNavigate()

  const meta = user?.user_metadata as { full_name?: string; display_name?: string; avatar_url?: string } | undefined
  const appMeta = user?.app_metadata as { full_name?: string; avatar_url?: string } | undefined
  const displayName = meta?.full_name ?? meta?.display_name ?? appMeta?.full_name ?? user?.email ?? (isVi ? 'Khách' : 'Guest')
  const email = user?.email ?? ''
  const avatarUrl = meta?.avatar_url ?? appMeta?.avatar_url
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '·'

  return (
    <aside
      id="main-navigation"
      className={[
        'hidden md:flex md:flex-col',
        'ds-surface-glass shadow-ds-soft fixed left-0 top-0 z-[70] h-screen rounded-r-ds-lg border-r border-ds-border',
        'w-64 max-w-[min(100vw,20rem)] md:transition-none',
        'md:z-40 md:rounded-r-ds-lg',
        'md:w-16',
        sidebarCollapsed ? 'lg:w-16' : 'lg:w-64',
      ].join(' ')}
      aria-label={isVi ? 'Điều hướng chính' : 'Main navigation'}
    >
      <button
        type="button"
        onClick={toggleSidebarCollapsed}
        className="ds-interactive-icon absolute right-2 top-6 z-[80] hidden rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-secondary lg:flex"
        aria-label={sidebarCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
        aria-pressed={sidebarCollapsed}
        title={sidebarCollapsed ? 'Mở rộng sidebar' : 'Thu gọn sidebar'}
      >
        {sidebarCollapsed ? (
          <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
        ) : (
          <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
        )}
      </button>

      <div
        className={[
          'flex flex-1 flex-col pt-6 pb-4',
          'px-4 md:items-center md:px-2 lg:items-stretch',
          sidebarCollapsed ? 'lg:px-2' : 'lg:px-4',
        ].join(' ')}
      >
        <div className="mb-8 px-2 md:mb-6 md:flex md:w-full md:flex-col md:items-center md:px-0 lg:mb-8 lg:block lg:px-2">
          <p
            className={`text-xs font-bold uppercase tracking-wider text-ds-text-secondary md:sr-only ${
              sidebarCollapsed ? 'lg:sr-only' : 'lg:not-sr-only'
            }`}
          >
            EtherAI
          </p>
          <div className="mt-2 flex items-center gap-2 md:mt-0 md:justify-center lg:mt-2 lg:block">
            <div
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-ds-sm border border-ds-border bg-ds-primary/20 text-ds-secondary md:flex lg:hidden"
              aria-hidden
            >
              <Clapperboard className="h-5 w-5" strokeWidth={ICON_STROKE} />
            </div>
            <p
              className={`text-lg font-bold leading-tight text-ds-text-primary md:sr-only ${
                sidebarCollapsed ? 'lg:sr-only' : 'lg:not-sr-only'
              }`}
            >
              {isVi ? 'Video → Tri thức' : 'Video → Knowledge'}
            </p>
          </div>
        </div>

        <nav
          className={[
            'flex flex-1 flex-col gap-2',
            sidebarCollapsed ? 'px-1' : 'px-2',
            'md:w-full md:items-center md:px-0',
            sidebarCollapsed ? 'lg:px-1' : 'lg:px-2',
            'lg:items-stretch',
          ].join(' ')}
          role="navigation"
        >
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to + label}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                [
                  'ds-interactive flex items-center gap-2 rounded-ds-sm py-2 outline-none',
                  'md:max-lg:w-12 md:max-lg:justify-center md:max-lg:px-0 md:max-lg:py-3',
                  sidebarCollapsed ? 'lg:w-12 lg:justify-center lg:px-0 lg:gap-0' : 'lg:px-4',
                  'focus-visible:ring-2 focus-visible:ring-ds-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-ds-bg',
                  isActive
                    ? 'bg-ds-primary font-bold text-ds-text-primary shadow-ds-soft hover:brightness-110'
                    : 'font-normal text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-text-primary',
                ].join(' ')
              }
            >
              <Icon className="h-6 w-6 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
              <span
                className={[
                  'text-ds-base md:sr-only',
                  sidebarCollapsed ? 'lg:sr-only' : 'lg:not-sr-only',
                ].join(' ')}
              >
                {label}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div
        className={[
          'mt-auto border-t border-ds-border py-4',
          sidebarCollapsed ? 'px-2' : 'px-4',
          'md:px-2',
          sidebarCollapsed ? 'lg:px-2' : 'lg:px-4',
        ].join(' ')}
      >
        <div
          className={[
            'ds-transition flex items-center gap-4 overflow-visible rounded-ds-lg px-2 py-4 hover:bg-ds-border/20',
            'md:flex-col md:gap-2 md:py-3',
            sidebarCollapsed ? 'lg:flex-col lg:items-center lg:gap-2 lg:py-3' : 'lg:flex-row lg:gap-4 lg:py-4',
          ].join(' ')}
        >
          <AvatarWithNotificationBell
            variant="sidebar"
            displayName={displayName}
            avatarUrl={avatarUrl}
            initials={initials}
          />
          <div className={`min-w-0 flex-1 md:hidden ${sidebarCollapsed ? 'lg:hidden' : 'lg:block'}`}>
            <p className="truncate text-sm font-bold text-ds-text-primary">{displayName}</p>
            <p className="truncate text-xs font-normal text-ds-text-secondary">{email || '—'}</p>
          </div>
          <button
            type="button"
            title={isVi ? 'Đăng xuất' : 'Sign out'}
            onClick={async () => {
              unbindLibrary()
              await signOut()
              navigate('/login', { replace: true })
            }}
            className="ds-interactive-icon rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-secondary md:mx-auto lg:mx-0"
            aria-label={isVi ? 'Đăng xuất' : 'Sign out'}
          >
            <LogOut className="h-6 w-6" strokeWidth={ICON_STROKE} />
          </button>
        </div>
      </div>
    </aside>
  )
}
