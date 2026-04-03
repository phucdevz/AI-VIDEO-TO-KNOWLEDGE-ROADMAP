import { Loader2, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LlmFriendlyGlossary, SemanticIntroBlocks, TechnologyStackLlm } from '../components/content'
import { PageMeta } from '../components/seo'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import { showEtherToast } from '../lib/etherToast'
import { useAuthStore } from '../stores/useAuthStore'
import { useToastStore } from '../stores/useToastStore'

/**
 * Login / Signup — Supabase Auth + high-tech glass shell.
 */
export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [learnMoreOpen, setLearnMoreOpen] = useState(false)

  const session = useAuthStore((s) => s.session)
  const ready = useAuthStore((s) => s.ready)
  const initialize = useAuthStore((s) => s.initialize)
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail)
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail)
  const navigate = useNavigate()
  const location = useLocation()
  const pushToast = useToastStore((s) => s.pushToast)
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    if (!learnMoreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLearnMoreOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [learnMoreOpen])

  const handleOAuthLogin = async (provider: 'github' | 'google') => {
    const supabase = getSupabase()
    if (!supabase) {
      pushToast('Chưa cấu hình kết nối. Vui lòng kiểm tra VITE_SUPABASE_URL / ANON KEY.', 'error')
      return
    }

    const label = provider === 'github' ? 'GitHub' : 'Google'
    showEtherToast(`Đang kết nối tới ${label}...`, Loader2)

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin + '/dashboard',
      },
    })

    if (error) pushToast(error.message, 'error')
  }

  if (isSupabaseConfigured() && ready && session) {
    return <Navigate to={from} replace />
  }

  return (
    <div className="relative h-screen overflow-hidden bg-ds-bg">
      <PageMeta
        path="/login"
        title="Sign in"
        description="EtherAI: đăng nhập để đồng bộ roadmap video-to-knowledge; hệ thống tự phân tích video, tạo mindmap và deep time-linking."
        noindex
      />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-ds-primary/30 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-ds-secondary/20 blur-[100px]" />
        <div className="absolute left-1/3 top-1/2 h-64 w-64 rounded-full bg-ds-primary/20 blur-[80px]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `linear-gradient(rgba(230,241,255,0.15) 1px, transparent 1px),
              linear-gradient(90deg, rgba(230,241,255,0.15) 1px, transparent 1px)`,
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex h-full max-w-ds flex-col md:flex-row">
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35 }}
          className="relative w-full flex-1 overflow-hidden md:w-1/2 md:flex-none"
          aria-label="Value proposition"
        >
          <div className="absolute inset-0">
            <div className="absolute inset-0 ds-surface-glass" />
            <div className="absolute inset-0 ds-gradient-primary opacity-10" />
          </div>
          <div className="relative h-full overflow-hidden px-6 py-10 md:px-12 md:py-14">
            <div className="mb-6 inline-flex items-center gap-2 rounded-ds-sm border border-ds-border bg-ds-bg/40 px-4 py-2 backdrop-blur-[10px]">
              <Sparkles className="h-5 w-5 text-ds-secondary" strokeWidth={1.5} />
              <span className="text-[14px] font-bold uppercase tracking-wider text-ds-text-secondary md:text-xs">
                EtherAI · Intelligent Ether
              </span>
            </div>

            <h1 className="max-w-md text-3xl font-bold leading-tight text-ds-text-primary sm:text-4xl md:text-4xl">
              AI Video-to-Knowledge Roadmap
            </h1>

            <div className="mt-4 max-w-md">
              <p className="ds-text-body-secondary text-sm md:text-base">
                What is it? Chuyển video bài giảng thành mindmap điều hướng theo thời gian để bạn học nhanh hơn và ôn tập có cấu trúc.
              </p>
              <ul className="mt-5 space-y-2 text-sm text-ds-text-secondary">
                <li>• Deep time-linking: bấm là nhảy đúng mốc trong video</li>
                <li>• Tóm tắt & quiz để kiểm tra mức hiểu</li>
                <li>• Analytics giúp bạn theo dõi tiến độ</li>
              </ul>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLearnMoreOpen(true)}
                className="ds-interactive inline-flex items-center gap-2 rounded-ds-sm border border-ds-border bg-ds-bg/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-ds-text-secondary hover:border-ds-primary/40 hover:text-ds-text-primary"
              >
                Learn more
              </button>
              <span className="text-xs text-ds-text-secondary">Không cần cuộn trang — card đăng nhập luôn sẵn sàng.</span>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.03 }}
          className="flex w-full flex-1 items-center justify-center overflow-hidden px-6 py-8 md:w-1/2 md:flex-none md:px-12"
          aria-label="Account"
        >
          <article className="ds-surface-glass w-full max-w-md rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
            <h2 className="sr-only">Account</h2>

            <div className="mb-6 flex gap-2 rounded-ds-sm bg-ds-bg/60 p-1">
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`ds-interactive flex-1 rounded-ds-sm py-2 text-sm font-bold capitalize ${
                    mode === m
                      ? 'bg-ds-primary text-ds-text-primary hover:brightness-110'
                      : 'text-ds-text-secondary hover:text-ds-text-primary'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={!getSupabase()}
                onClick={() => void handleOAuthLogin('google')}
                className="ds-interactive flex items-center justify-center gap-3 rounded-ds-sm border border-ds-border bg-ds-bg/60 py-3 text-sm font-bold text-ds-text-secondary backdrop-blur-[10px] transition-all duration-200 ease-in-out hover:border-[#4285F4] hover:text-ds-text-primary hover:shadow-[0_0_18px_rgba(255,255,255,0.14)] active:scale-[0.95] disabled:opacity-40"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.69 1.22 9.17 3.6l6.85-6.85C35.83 2.96 30.31 1 24 1 14.63 1 6.5 5.69 2.36 12.99l7.96 6.18C12.53 13.72 17.93 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.58 24.55c0-1.57-.15-3.08-.41-4.55H24v9.1h12.6c-.54 2.92-2.12 5.39-4.49 7.04l6.87 5.32c4.01-3.7 6.6-9.15 6.6-16.91z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M9.79 28.18a14.98 14.98 0 0 1 0-8.36l-7.96-6.18C.97 17.09 0 20.43 0 24c0 3.57.97 6.91 1.83 10.36l7.96-6.18z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 46c6.31 0 11.83-2.09 15.87-5.66l-6.87-5.32c-1.9 1.28-4.33 2.04-7 2.04-6.07 0-11.47-4.22-13.68-10.04l-7.96 6.18C6.5 42.31 14.63 47 24 47z"
                  />
                </svg>
                <span className="hidden sm:inline">Google</span>
              </button>
              <button
                type="button"
                disabled={!getSupabase()}
                onClick={() => void handleOAuthLogin('github')}
                className="ds-interactive flex items-center justify-center gap-3 rounded-ds-sm border border-ds-border bg-ds-bg/60 py-3 text-sm font-bold text-ds-text-secondary backdrop-blur-[10px] transition-all duration-200 ease-in-out hover:bg-[rgba(255,255,255,0.1)] hover:border-ds-secondary active:scale-[0.95] disabled:opacity-40"
              >
                <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden focusable="false">
                  <path
                    fill="#FAFAFA"
                    d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87 1.87 3.2 1.76.13-.43.28-.86.51-1.18-1.61-.18-3.29-.81-3.29-3.62 0-.8.28-1.45.74-1.96-.07-.18-.32-.92.07-1.91 0 0 .61-.2 1.99.74.58-.16 1.2-.24 1.82-.24.62 0 1.24.08 1.82.24 1.38-.94 1.99-.74 1.99-.74.39.99.14 1.73.07 1.91.46.51.74 1.16.74 1.96 0 2.82-1.68 3.44-3.29 3.62.29.39.54.92.54 1.86 0 1.34-.01 2.42-.01 2.75 0 .21.15.46.55.38C13.71 14.53 16 11.54 16 8c0-4.42-3.58-8-8-8z"
                  />
                </svg>
                <span className="hidden sm:inline">GitHub</span>
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!getSupabase()) {
                  pushToast('Chưa cấu hình kết nối AI (VITE_SUPABASE_URL / ANON KEY).', 'error')
                  return
                }
                setBusy(true)
                try {
                  if (mode === 'login') {
                    const { error } = await signInWithEmail(email, password)
                    if (error) pushToast(error, 'error')
                    else {
                      pushToast('Đăng nhập thành công.', 'success')
                      navigate(from, { replace: true })
                    }
                  } else {
                    const { error } = await signUpWithEmail(email, password, displayName)
                    if (error) pushToast(error, 'error')
                    else {
                      pushToast('Tạo tài khoản thành công. Vui lòng kiểm tra email xác nhận nếu bật.', 'success')
                      setMode('login')
                    }
                  }
                } finally {
                  setBusy(false)
                }
              }}
            >
              {mode === 'signup' && (
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
                    Display name
                  </label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
                    placeholder="Ada Lovelace"
                    autoComplete="name"
                  />
                </div>
              )}

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
                  placeholder="you@university.edu"
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="ds-interactive w-full rounded-ds-sm bg-ds-primary py-4 text-sm font-bold text-ds-text-primary shadow-ds-soft hover:opacity-95 disabled:opacity-50"
              >
                {busy ? 'Đang xử lý…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm font-normal text-ds-text-secondary">
              {!isSupabaseConfigured() ? (
                <Link
                  to="/dashboard"
                  className="ds-interactive inline-block font-bold text-ds-secondary hover:underline"
                >
                  Tiếp tục xem demo (chưa bật đăng nhập)
                </Link>
              ) : (
                <span className="text-ds-text-secondary">Đăng nhập để đồng bộ tiến độ của bạn.</span>
              )}
            </p>
          </article>
        </motion.section>
      </div>

      <AnimatePresence>
        {learnMoreOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close learn more"
              className="fixed inset-0 z-[500] bg-ds-bg/55 backdrop-blur-sm"
              onClick={() => setLearnMoreOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              className="fixed inset-0 z-[501] flex items-center justify-center px-4"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.99 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="ds-surface-glass w-full max-w-3xl overflow-hidden rounded-ds-lg border border-ds-border shadow-ds-soft backdrop-blur-[10px]">
                <div className="relative flex items-center justify-between gap-4 border-b border-ds-border px-5 py-4">
                  <div>
                    <p className="ds-text-label text-ds-secondary">Learn more</p>
                    <h3 className="mt-1 text-lg font-bold text-ds-text-primary">AI Video-to-Knowledge Roadmap</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLearnMoreOpen(false)}
                    className="ds-interactive-icon absolute right-4 top-3 flex h-9 w-9 items-center justify-center rounded-ds-sm border border-ds-border bg-ds-bg/70 text-ds-text-primary shadow-ds-soft hover:bg-ds-border/30"
                    aria-label="Close"
                  >
                    <span className="text-sm font-bold leading-none">X</span>
                  </button>
                </div>
                <div className="px-5 py-6">
                  <SemanticIntroBlocks />
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <TechnologyStackLlm compact />
                    <LlmFriendlyGlossary compact />
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
