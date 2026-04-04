import { Outlet } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { MainSidebar } from './MainSidebar'
import { MobileDock } from './MobileDock'
import { ShellProvider, useShell } from './ShellContext'

function LayoutInner() {
  const { sidebarCollapsed } = useShell()

  return (
    <div className="min-h-screen min-w-0 bg-ds-bg">
      <MainSidebar />
      <div
        className={[
          'flex min-h-screen min-w-0 flex-col overflow-x-clip pl-0 md:pl-16',
          'transition-[padding] duration-300 ease-out',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64',
        ].join(' ')}
      >
        <AppHeader />
        <main className="min-w-0 flex-1 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-page-safe">
          <Outlet />
        </main>
      </div>
      <MobileDock />
    </div>
  )
}

export function Layout() {
  return (
    <ShellProvider>
      <LayoutInner />
    </ShellProvider>
  )
}
