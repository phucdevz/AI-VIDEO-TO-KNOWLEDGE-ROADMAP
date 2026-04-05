import { LogOut, Search } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AvatarWithNotificationBell } from './AvatarWithNotificationBell'
import { useAppStore } from '../../stores/useAppStore'
import { useAuthStore } from '../../stores/useAuthStore'

const TITLES: Record<string, string> = {
  '/dashboard': 'Library',
  '/workspace': 'Workspace',
  '/quiz': 'Quiz Center',
  '/analytics': 'Analytics',
  '/settings': 'Settings',
}

function SearchField({ className }: { className?: string }) {
  return (
    <div className={`relative w-full min-w-0 ${className ?? ''}`}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-secondary"
        strokeWidth={1.5}
        aria-hidden
      />
      <input
        type="search"
        placeholder="Tìm bài giảng, chủ đề…"
        className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 py-2 pl-10 pr-4 text-base text-ds-text-primary placeholder:text-ds-text-secondary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40 md:text-sm"
        aria-label="Global search"
      />
    </div>
  )
}

const ICON_STROKE = 1.5 as const

export function AppHeader() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const title = TITLES[pathname] ?? 'Dashboard'
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  const unbindLibrary = useAppStore((s) => s.unbindLibraryRealtime)

  const meta = user?.user_metadata as { full_name?: string; display_name?: string; avatar_url?: string } | undefined
  const appMeta = user?.app_metadata as { full_name?: string; avatar_url?: string } | undefined
  const displayName = meta?.full_name ?? meta?.display_name ?? appMeta?.full_name ?? user?.email ?? 'Guest'
  const avatarUrl = meta?.avatar_url ?? appMeta?.avatar_url
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '·'

  return (
    <header className="ds-surface-glass sticky top-0 z-30 border-b border-ds-border shadow-ds-soft backdrop-blur-md md:backdrop-blur-[10px]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:h-16 md:flex-row md:items-center md:gap-4 lg:px-8">
        <div className="flex items-center justify-between gap-3 md:contents">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:order-1 md:flex-none">
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-ds-text-primary sm:text-lg md:text-xl">{title}</h1>
              <p className="hidden text-xs font-normal text-ds-text-secondary sm:block">
                AI Video-to-Knowledge Roadmap
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 md:order-3 md:gap-0">
            <button
              type="button"
              className="ds-interactive-icon rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-secondary md:hidden"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              onClick={async () => {
                unbindLibrary()
                await signOut()
                navigate('/login', { replace: true })
              }}
            >
              <LogOut className="h-6 w-6" strokeWidth={ICON_STROKE} aria-hidden />
            </button>
            <AvatarWithNotificationBell
              variant="header"
              displayName={displayName}
              avatarUrl={avatarUrl}
              initials={initials}
            />
          </div>
        </div>

        <SearchField className="md:order-2 md:max-w-lg md:flex-1 lg:max-w-xl" />
      </div>
    </header>
  )
}
