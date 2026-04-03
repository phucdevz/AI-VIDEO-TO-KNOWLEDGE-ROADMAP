import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { getSupabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/useAuthStore'

/**
 * Gates app shell routes: guests → `/login`.
 * When `VITE_SUPABASE_*` are unset, auth is skipped so local UI keeps working.
 */
export function RequireAuth() {
  const ready = useAuthStore((s) => s.ready)
  const session = useAuthStore((s) => s.session)
  const initialize = useAuthStore((s) => s.initialize)
  const location = useLocation()

  useEffect(() => {
    void initialize()
  }, [initialize])

  if (!getSupabase()) {
    return <Outlet />
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ds-bg px-6 text-ds-text-secondary">
        <p className="text-sm font-bold">Đang tải phiên đăng nhập…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
