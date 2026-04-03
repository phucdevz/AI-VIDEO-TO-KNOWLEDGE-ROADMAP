import { Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/auth'
import { CommandPalette } from './components/command-palette'
import { Layout } from './components/layout'
import { ToastHost } from './components/ui/ToastHost'
import { EtherToaster } from './lib/etherToast'
import { showEtherToast } from './lib/etherToast'
import { getSupabase } from './lib/supabase'
import { useAuthStore } from './stores/useAuthStore'
import {
  AnalyticsPage,
  AuthPage,
  DashboardPage,
  QuizCenterPage,
  SettingsPage,
  WorkspacePage,
} from './pages'

export default function App() {
  const prevUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUser = nextSession?.user ?? null
      const nextUserId = nextUser?.id ?? null

      // Keep Zustand in sync (RequireAuth uses it too).
      useAuthStore.setState({
        session: nextSession ?? null,
        user: nextUser,
        ready: true,
      })

      if (event === 'SIGNED_IN' && !prevUserIdRef.current && nextUserId) {
        showEtherToast('Chào mừng bạn quay trở lại!', Sparkles)
      }

      if (event === 'SIGNED_OUT') {
        prevUserIdRef.current = null
      } else {
        prevUserIdRef.current = nextUserId
      }
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  return (
    <>
      <ToastHost />
      <EtherToaster />
      <CommandPalette />
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/quiz" element={<QuizCenterPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
        {/* Legacy paths → new sitemap */}
        <Route path="/roadmap" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  )
}
