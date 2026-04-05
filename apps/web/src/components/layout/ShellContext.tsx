import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type ShellContextValue = {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebarCollapsed: () => void
}

const ShellContext = createContext<ShellContextValue | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const SIDEBAR_COLLAPSED_STORAGE_KEY = 'etherai:sidebar-collapsed-v1'
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => !v)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed ? '1' : '0')
    } catch {
      /* localStorage bị chặn / private mode */
    }
  }, [SIDEBAR_COLLAPSED_STORAGE_KEY, sidebarCollapsed])

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebarCollapsed,
    }),
    [sidebarCollapsed, setSidebarCollapsed, toggleSidebarCollapsed],
  )

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
}

export function useShell() {
  const ctx = useContext(ShellContext)
  if (!ctx) throw new Error('useShell must be used within ShellProvider')
  return ctx
}
