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
          'flex min-h-screen min-w-0 flex-col overflow-x-hidden pl-0 md:pl-16',
          /* Desktop: khóa chiều cao viewport — nếu không, main overflow-y-auto không có max-height → không cuộn được / wheel lệch layer. */
          'md:h-[100dvh] md:min-h-0 md:max-h-[100dvh] md:overflow-hidden',
          'transition-[padding] duration-300 ease-out',
          sidebarCollapsed ? 'lg:pl-16' : 'lg:pl-64',
        ].join(' ')}
      >
        <AppHeader />
        {/*
          Mobile: overflow-visible — cuộn theo document (dock + safe area).
          md+: main là vùng cuộn duy nhất (flex-1 + min-h-0 + chiều cao shell đã khóa ở cha).
        */}
        <main className="min-w-0 flex-1 overflow-x-hidden pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] max-md:overflow-visible md:min-h-0 md:overflow-y-auto md:overscroll-y-contain md:[-webkit-overflow-scrolling:touch] md:pb-page-safe">
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
