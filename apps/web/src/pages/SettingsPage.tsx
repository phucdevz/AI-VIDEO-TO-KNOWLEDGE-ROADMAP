import type { RealtimeChannel } from '@supabase/supabase-js'
import { KeyRound, Sliders, User } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PageMeta } from '../components/seo'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import type { UserPrefsJson } from '../stores/useAppStore'
import { useAppStore } from '../stores/useAppStore'
import { useAuthStore } from '../stores/useAuthStore'
import { useToastStore } from '../stores/useToastStore'

function prefsToJson(state: ReturnType<typeof useAppStore.getState>): UserPrefsJson {
  return {
    summaryLength: state.summaryLength,
    quizDifficulty: state.quizDifficulty,
    uiTheme: state.uiTheme,
    language: state.language,
    groq_api_key: state.groqApiKey || undefined,
    google_api_key: state.googleApiKey || undefined,
  }
}

/** PostgREST: table missing from schema cache (project chưa tạo bảng). */
function isUserPreferencesTableMissing(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false
  if (err.code === 'PGRST205') return true
  const m = (err.message ?? '').toLowerCase()
  return m.includes('user_preferences') && (m.includes('schema cache') || m.includes('does not exist'))
}

/**
 * Profile, AI preferences, API keys — persisted to `user_preferences` + realtime sync.
 */
export function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const summaryLength = useAppStore((s) => s.summaryLength)
  const quizDifficulty = useAppStore((s) => s.quizDifficulty)
  const uiTheme = useAppStore((s) => s.uiTheme)
  const language = useAppStore((s) => s.language)
  const groqApiKey = useAppStore((s) => s.groqApiKey)
  const googleApiKey = useAppStore((s) => s.googleApiKey)
  const setSummaryLength = useAppStore((s) => s.setSummaryLength)
  const setQuizDifficulty = useAppStore((s) => s.setQuizDifficulty)
  const setUiTheme = useAppStore((s) => s.setUiTheme)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const setGroqApiKey = useAppStore((s) => s.setGroqApiKey)
  const setGoogleApiKey = useAppStore((s) => s.setGoogleApiKey)
  const applyRemotePreferences = useAppStore((s) => s.applyRemotePreferences)

  const pushToast = useToastStore((s) => s.pushToast)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefsChannelRef = useRef<RealtimeChannel | null>(null)
  const [displayName, setDisplayName] = useState('')
  /** false = bảng `user_preferences` chưa có trên Supabase — chỉ dùng state local, không gọi REST. */
  const [prefsTableReady, setPrefsTableReady] = useState(true)

  useEffect(() => {
    const meta = user?.user_metadata as { full_name?: string; display_name?: string } | undefined
    setDisplayName(meta?.full_name ?? meta?.display_name ?? user?.email ?? '')
  }, [user])

  const savePrefs = useCallback(async (): Promise<boolean> => {
    const supabase = getSupabase()
    const uid = user?.id
    if (!supabase || !uid || !prefsTableReady) return false
    const prefs = prefsToJson(useAppStore.getState())
    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: uid,
        prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
    if (error) {
      if (isUserPreferencesTableMissing(error)) {
        setPrefsTableReady(false)
        return false
      }
      pushToast(`Lưu preferences: ${error.message}`, 'error')
      return false
    }
    return true
  }, [user?.id, pushToast, prefsTableReady])

  useEffect(() => {
    const supabase = getSupabase()
    const uid = user?.id
    if (!supabase || !uid) return

    let cancelled = false
    prefsChannelRef.current = null

    ;(async () => {
      const { data, error } = await supabase.from('user_preferences').select('prefs').eq('user_id', uid).maybeSingle()
      if (cancelled) return
      if (error) {
        if (isUserPreferencesTableMissing(error)) {
          setPrefsTableReady(false)
          return
        }
        pushToast(`Đọc preferences: ${error.message}`, 'error')
        return
      }
      setPrefsTableReady(true)
      const p = data?.prefs as UserPrefsJson | undefined
      if (p && typeof p === 'object') applyRemotePreferences(p)

      if (cancelled) return
      const ch = supabase
        .channel(`user_preferences:${uid}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_preferences',
            filter: `user_id=eq.${uid}`,
          },
          (payload) => {
            const row = payload.new as { prefs?: UserPrefsJson }
            if (row?.prefs && typeof row.prefs === 'object') {
              applyRemotePreferences(row.prefs)
            }
          },
        )
        .subscribe()
      if (!cancelled) prefsChannelRef.current = ch
    })()

    return () => {
      cancelled = true
      const ch = prefsChannelRef.current
      prefsChannelRef.current = null
      if (ch) supabase.removeChannel(ch)
    }
  }, [user?.id, applyRemotePreferences, pushToast])

  const scheduleSave = () => {
    if (!isSupabaseConfigured() || !user?.id || !prefsTableReady) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void savePrefs()
    }, 650)
  }

  return (
    <div className="mx-auto max-w-ds space-y-8 px-4 py-6 sm:px-6 md:px-8 md:py-8">
      <PageMeta
        path="/settings"
        title="Settings"
        description="Cài đặt hồ sơ, tuỳ chọn tóm tắt/quiz và cách kết nối AI."
      />
      <header>
        <h2 className="text-3xl font-bold text-ds-text-primary">Settings</h2>
        <p className="ds-text-body-secondary mt-2">Tùy chỉnh hồ sơ và tuỳ chọn học tập theo ý bạn.</p>
      </header>

      {user && !prefsTableReady && (
        <div
          role="status"
          className="rounded-ds-lg border border-ds-secondary/40 bg-ds-secondary/10 px-4 py-4 text-sm text-ds-text-primary"
        >
          <p className="font-bold text-ds-secondary">Chưa có bảng `user_preferences` trên Supabase</p>
          <p className="mt-2 text-ds-text-secondary">
            Mở <strong>Supabase → SQL Editor</strong>, chạy toàn bộ file{' '}
            <code className="rounded-ds-sm bg-ds-bg/80 px-1.5 py-0.5 font-mono text-xs text-ds-secondary">
              supabase/sql/lectures_pipeline_columns.sql
            </code>{' '}
            (phần đầu tạo <code className="font-mono text-ds-secondary">user_preferences</code> và{' '}
            <code className="font-mono text-ds-secondary">quiz_results</code>), sau đó{' '}
            <strong>Settings → API → Reload schema</strong> và tải lại trang. Trong lúc chờ, chỉnh sửa trên UI vẫn
            hoạt động cục bộ nhưng không lưu cloud.
          </p>
        </div>
      )}

      <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
        <div className="mb-6 flex items-center gap-3">
          <User className="h-6 w-6 text-ds-secondary" strokeWidth={1.5} />
          <h3 className="text-lg font-bold text-ds-text-primary">Profile</h3>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Display name
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Email
            </label>
            <input
              type="email"
              readOnly
              value={user?.email ?? ''}
              className="ds-transition w-full cursor-not-allowed rounded-ds-sm border border-ds-border bg-ds-bg/50 px-4 py-3 text-ds-base text-ds-text-secondary"
            />
          </div>
        </div>
      </section>

      <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
        <div className="mb-6 flex items-center gap-3">
          <Sliders className="h-6 w-6 text-ds-secondary" strokeWidth={1.5} />
          <h3 className="text-lg font-bold text-ds-text-primary">AI & UI preferences</h3>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ds-text-secondary">Language</p>
            <div className="max-w-sm">
              <select
                value={language}
                onChange={(e) => {
                  const v = e.target.value === 'en' ? 'en' : 'vi'
                  setLanguage(v)
                  scheduleSave()
                  pushToast(
                    v === 'vi'
                      ? 'Đã đổi ngôn ngữ sang Tiếng Việt. Bài giảng tiếp theo sẽ được tạo bằng ngôn ngữ này.'
                      : 'Đã đổi ngôn ngữ sang English. The next lecture will be generated in this language.',
                    'default',
                  )
                }}
                className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-sm text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
                aria-label="Language"
              >
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Summary length
            </p>
            <div className="flex flex-wrap gap-2">
              {(['short', 'medium', 'long'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setSummaryLength(v)
                    scheduleSave()
                  }}
                  className={`ds-interactive rounded-ds-sm px-4 py-2 text-sm font-bold capitalize ${
                    summaryLength === v
                      ? 'bg-ds-primary text-ds-text-primary hover:brightness-110'
                      : 'border border-ds-border text-ds-text-secondary hover:bg-ds-border/30'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Quiz difficulty
            </p>
            <div className="flex flex-wrap gap-2">
              {(['easy', 'medium', 'hard'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setQuizDifficulty(v)
                    scheduleSave()
                  }}
                  className={`ds-interactive rounded-ds-sm px-4 py-2 text-sm font-bold capitalize ${
                    quizDifficulty === v
                      ? 'bg-ds-secondary/30 text-ds-text-primary ring-2 ring-ds-secondary hover:brightness-110'
                      : 'border border-ds-border text-ds-text-secondary hover:bg-ds-border/30'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-ds-text-secondary">UI theme</p>
            <div className="flex flex-wrap gap-2">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setUiTheme(t)
                    scheduleSave()
                  }}
                  className={`ds-interactive rounded-ds-sm px-4 py-2 text-sm font-bold capitalize ${
                    uiTheme === t
                      ? 'bg-ds-primary/80 text-ds-text-primary hover:brightness-110'
                      : 'border border-ds-border text-ds-text-secondary hover:bg-ds-border/30'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ds-text-secondary">Bạn có thể đổi theme giao diện bất cứ lúc nào.</p>
          </div>
        </div>
      </section>

      <section className="ds-surface-glass rounded-ds-lg border border-ds-border p-8 shadow-ds-soft backdrop-blur-[10px]">
        <div className="mb-6 flex items-center gap-3">
          <KeyRound className="h-6 w-6 text-ds-secondary" strokeWidth={1.5} />
          <h3 className="text-lg font-bold text-ds-text-primary">API keys</h3>
        </div>
        <p className="mb-6 text-sm text-ds-text-secondary">
          Dữ liệu sẽ được lưu để đồng bộ cho tài khoản của bạn (khi sẵn sàng).
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Groq API key
            </label>
            <input
              type="password"
              value={groqApiKey}
              onChange={(e) => {
                setGroqApiKey(e.target.value)
                scheduleSave()
              }}
              placeholder="gsk_…"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 font-mono text-sm text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary">
              Google AI key
            </label>
            <input
              type="password"
              value={googleApiKey}
              onChange={(e) => {
                setGoogleApiKey(e.target.value)
                scheduleSave()
              }}
              placeholder="AIza…"
              className="ds-transition w-full rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 font-mono text-sm text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            if (!prefsTableReady) {
              pushToast('Tạo bảng user_preferences trên Supabase trước (xem ô cảnh báo phía trên).', 'error')
              return
            }
            const ok = await savePrefs()
            if (ok) pushToast('Đã lưu preferences.', 'success')
          }}
          className="ds-interactive mt-8 rounded-ds-sm bg-ds-primary px-8 py-3 text-sm font-bold text-ds-text-primary shadow-ds-soft hover:opacity-95 disabled:opacity-45"
          disabled={!prefsTableReady}
        >
          Save preferences now
        </button>
      </section>
    </div>
  )
}
