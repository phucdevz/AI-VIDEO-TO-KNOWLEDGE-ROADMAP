import type { RealtimeChannel } from '@supabase/supabase-js'
import { Check, ChevronDown, KeyRound, Sliders, User } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { PageMeta } from '../components/seo'
import { getSupabase } from '../lib/supabase'
import { friendlySupabaseError } from '../lib/userFacingErrors'
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

const LANGUAGE_OPTIONS = [
  { value: 'vi' as const, label: 'Tiếng Việt' },
  { value: 'en' as const, label: 'English' },
]

function LanguageSelect(props: {
  value: 'vi' | 'en'
  onChange: (v: 'vi' | 'en') => void
  id: string
  labelId: string
}) {
  const { value, onChange, id, labelId } = props
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = LANGUAGE_OPTIONS.find((o) => o.value === value) ?? LANGUAGE_OPTIONS[0]

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="ds-transition flex w-full items-center justify-between gap-3 rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-left text-sm font-medium text-ds-text-primary shadow-ds-soft hover:border-ds-primary/50 focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
      >
        <span>{current.label}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ds-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-labelledby={labelId}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[120] overflow-hidden rounded-ds-sm border border-ds-border/90 bg-[rgba(16,30,56,0.97)] py-1 shadow-[0_16px_48px_rgba(0,0,0,0.55),0_0_0_1px_rgba(124,77,255,0.12)] backdrop-blur-[12px]"
        >
          {LANGUAGE_OPTIONS.map((opt) => {
            const selected = opt.value === value
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                    selected
                      ? 'bg-ds-primary/25 text-ds-text-primary'
                      : 'text-ds-text-secondary hover:bg-ds-border/25 hover:text-ds-text-primary'
                  }`}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                  {selected ? <Check className="h-4 w-4 shrink-0 text-ds-secondary" strokeWidth={2} aria-hidden /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
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
  const persistLocalPreferences = useAppStore((s) => s.persistLocalPreferences)

  const pushToast = useToastStore((s) => s.pushToast)
  const languageFieldId = useId()
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prefsChannelRef = useRef<RealtimeChannel | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)
  /** false = bảng `user_preferences` chưa có trên Supabase — cloud sync tắt; vẫn lưu cục bộ. */
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
      pushToast(friendlySupabaseError(error), 'error')
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
        pushToast(friendlySupabaseError(error), 'error')
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

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      persistLocalPreferences()
      const supabase = getSupabase()
      const uid = user?.id
      if (supabase && uid && prefsTableReady) void savePrefs()
    }, 650)
  }, [user?.id, prefsTableReady, savePrefs, persistLocalPreferences])

  const saveDisplayName = useCallback(async () => {
    const supabase = getSupabase()
    if (!user || !supabase) {
      pushToast('Đăng nhập để lưu tên hiển thị.', 'error')
      return
    }
    const trimmed = displayName.trim()
    setSavingName(true)
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: trimmed, display_name: trimmed },
      })
      if (error) {
        pushToast(friendlySupabaseError(error), 'error')
        return
      }
      pushToast('Đã cập nhật tên hiển thị.', 'success')
    } finally {
      setSavingName(false)
    }
  }, [user, displayName, pushToast])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 lg:px-8 md:py-8">
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
          <p className="font-bold text-ds-secondary">Đồng bộ tài khoản trên đám mây chưa khả dụng</p>
          <p className="mt-2 text-ds-text-secondary">
            Cài đặt của bạn vẫn được lưu trên thiết bị. Để đồng bộ giữa các máy và lưu an toàn lâu dài, cần hoàn tất
            cấu hình phía máy chủ — người quản trị hệ thống có thể tham khảo tài liệu triển khai đi kèm mã nguồn.
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveDisplayName()
                }}
                className="ds-transition min-w-0 flex-1 rounded-ds-sm border border-ds-border bg-ds-bg/80 px-4 py-3 text-ds-base text-ds-text-primary focus:border-ds-primary focus:outline-none focus:ring-2 focus:ring-ds-primary/40"
              />
              <button
                type="button"
                onClick={() => void saveDisplayName()}
                disabled={savingName || !user}
                className="ds-interactive shrink-0 rounded-ds-sm border border-ds-border bg-ds-bg/80 px-5 py-3 text-sm font-bold text-ds-text-primary hover:bg-ds-border/30 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {savingName ? 'Đang lưu…' : 'Lưu tên'}
              </button>
            </div>
            {!user && (
              <p className="mt-2 text-xs text-ds-text-secondary">Đăng nhập để lưu tên vào tài khoản.</p>
            )}
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
          <div className="relative z-10 min-w-0">
            <label
              id={`${languageFieldId}-label`}
              htmlFor={languageFieldId}
              className="mb-4 block text-xs font-bold uppercase tracking-wider text-ds-text-secondary"
            >
              Language
            </label>
            <div className="max-w-sm">
              <LanguageSelect
                id={languageFieldId}
                labelId={`${languageFieldId}-label`}
                value={language}
                onChange={(v) => {
                  setLanguage(v)
                  scheduleSave()
                  pushToast(v === 'vi' ? 'Đã chọn Tiếng Việt.' : 'Đã chọn English.', 'default')
                }}
              />
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
                  aria-pressed={summaryLength === v}
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
                  aria-pressed={quizDifficulty === v}
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
                  aria-pressed={uiTheme === t}
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
          Được lưu cục bộ trên trình duyệt; khi đồng bộ đám mây đã bật, khóa sẽ được mã hóa đồng bộ theo tài khoản.
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
            setPrefsSaving(true)
            try {
              persistLocalPreferences()
              const supabase = getSupabase()
              const uid = user?.id
              if (!supabase || !uid) {
                pushToast('Đã lưu trên thiết bị. Đăng nhập để đồng bộ khi tính năng sẵn sàng.', 'success')
                return
              }
              if (!prefsTableReady) {
                pushToast(
                  'Đã lưu trên thiết bị. Đồng bộ đám mây sẽ bật khi hệ thống được thiết lập đầy đủ.',
                  'default',
                )
                return
              }
              const ok = await savePrefs()
              if (ok) pushToast('Đã lưu cài đặt (đám mây và thiết bị).', 'success')
            } finally {
              setPrefsSaving(false)
            }
          }}
          className="ds-interactive mt-8 rounded-ds-sm bg-ds-primary px-8 py-3 text-sm font-bold text-ds-text-primary shadow-ds-soft hover:opacity-95 disabled:opacity-45"
          disabled={prefsSaving}
        >
          {prefsSaving ? 'Đang lưu…' : 'Lưu cài đặt ngay'}
        </button>
      </section>
    </div>
  )
}
