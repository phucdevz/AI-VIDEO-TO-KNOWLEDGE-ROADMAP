import { Bell, Menu, Search } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useShell } from './ShellContext'

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
        placeholder="Search lectures, topics…"
        className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 py-2 pl-10 pr-4 text-base text-ds-text-primary placeholder:text-ds-text-secondary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40 md:text-sm"
        aria-label="Global search"
      />
    </div>
  )
}

export function AppHeader() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'Dashboard'
  const { mobileNavOpen, toggleMobileNav } = useShell()

  return (
    <header className="ds-surface-glass sticky top-0 z-30 border-b border-ds-border shadow-ds-soft backdrop-blur-[10px]">
      <div className="mx-auto flex flex-col gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:gap-4 md:px-8">
        <div className="flex items-center justify-between gap-3 md:contents">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:order-1 md:flex-none">
            <button
              type="button"
              className="ds-interactive-icon -ml-1 shrink-0 rounded-ds-sm p-2 text-ds-text-primary hover:bg-ds-border/30 md:hidden"
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
              aria-controls="main-navigation"
              onClick={toggleMobileNav}
            >
              <Menu className="h-6 w-6" strokeWidth={1.5} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-ds-text-primary sm:text-lg">{title}</h1>
              <p className="hidden text-xs font-normal text-ds-text-secondary sm:block">
                AI Video-to-Knowledge Roadmap
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ds-interactive-icon shrink-0 rounded-ds-sm p-2 text-ds-text-secondary hover:bg-ds-border/30 hover:text-ds-secondary md:order-3"
            aria-label="Notifications"
          >
            <Bell className="h-6 w-6" strokeWidth={1.5} />
          </button>
        </div>

        <SearchField className="md:order-2 md:max-w-lg md:flex-1 lg:max-w-xl" />
      </div>
    </header>
  )
}
