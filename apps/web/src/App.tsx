import { Navigate, Route, Routes } from 'react-router-dom'
import { CommandPalette } from './components/command-palette'
import { Layout } from './components/layout'
import { ToastHost } from './components/ui/ToastHost'
import {
  AnalyticsPage,
  AuthPage,
  DashboardPage,
  QuizCenterPage,
  SettingsPage,
  WorkspacePage,
} from './pages'

export default function App() {
  return (
    <>
      <ToastHost />
      <CommandPalette />
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/workspace" element={<WorkspacePage />} />
          <Route path="/quiz" element={<QuizCenterPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        {/* Legacy paths → new sitemap */}
        <Route path="/roadmap" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  )
}
