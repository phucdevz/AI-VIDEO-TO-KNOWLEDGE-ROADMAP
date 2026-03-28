import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { MainSidebar } from './MainSidebar'
import { ShellProvider, useShell } from './ShellContext'

function LayoutInner() {
  const { pathname } = useLocation()
  const { mobileNavOpen, setMobileNavOpen } = useShell()

  useEffect(() => {
    setMobileNavOpen(false)
  }, [pathname, setMobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNavOpen])

  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileNavOpen, setMobileNavOpen])

  return (
    <div className="min-h-screen bg-ds-bg">
      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-pointer bg-ds-bg/50 backdrop-blur-sm transition-opacity active:bg-ds-bg/60 md:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <MainSidebar />
      <div className="flex min-h-screen flex-col pl-0 md:pl-16 lg:pl-64">
        <AppHeader />
        <main className="flex-1 pb-page-safe">
          <Outlet />
        </main>
      </div>
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
