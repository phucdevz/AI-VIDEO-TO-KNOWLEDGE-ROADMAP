import { create } from 'zustand'
import { fetchLecturesRows, getSupabase } from '../lib/supabase'
import { useAuthStore } from './useAuthStore'

export type UiTheme = 'dark' | 'light'
export type AppLanguage = 'vi' | 'en'

export type LibraryLectureRow = {
  id: string
  video_id?: string | null
  video_url?: string | null
  title?: string | null
  source_url?: string | null
  status?: string | null
  transcript?: unknown
  flow_data?: unknown
  quiz_data?: unknown
  tutor_data?: unknown
  user_id?: string | null
  created_at?: string | null
}

export type UserPrefsJson = {
  summaryLength?: 'short' | 'medium' | 'long'
  quizDifficulty?: 'easy' | 'medium' | 'hard'
  uiTheme?: UiTheme
  language?: AppLanguage
  groq_api_key?: string
  google_api_key?: string
}

type AppState = {
  summaryLength: 'short' | 'medium' | 'long'
  quizDifficulty: 'easy' | 'medium' | 'hard'
  uiTheme: UiTheme
  language: AppLanguage
  groqApiKey: string
  googleApiKey: string
  libraryLectures: LibraryLectureRow[]
  libraryRealtimeCleanup: (() => void) | null

  setSummaryLength: (v: AppState['summaryLength']) => void
  setQuizDifficulty: (v: AppState['quizDifficulty']) => void
  setUiTheme: (v: UiTheme) => void
  setLanguage: (v: AppLanguage) => void
  setGroqApiKey: (v: string) => void
  setGoogleApiKey: (v: string) => void

  applyThemeDocument: (theme: UiTheme) => void
  applyRemotePreferences: (prefs: UserPrefsJson) => void

  setLibraryLectures: (rows: LibraryLectureRow[]) => void
  mergeLibraryRow: (row: LibraryLectureRow) => void
  removeLibraryRow: (id: string) => void

  fetchLibraryLectures: () => Promise<void>
  /** Subscribe to `lectures` INSERT/UPDATE/DELETE (call from Dashboard when authenticated). */
  bindLibraryRealtime: () => void
  unbindLibraryRealtime: () => void
}

function applyThemeToDom(theme: UiTheme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('light', theme === 'light')
}

const LANGUAGE_STORAGE_KEY = 'etherai:language-v1'

export const useAppStore = create<AppState>((set, get) => ({
  summaryLength: 'medium',
  quizDifficulty: 'medium',
  uiTheme: 'dark',
  language:
    typeof window === 'undefined'
      ? 'vi'
      : ((() => {
          try {
            const v = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
            return v === 'en' ? 'en' : 'vi'
          } catch {
            return 'vi'
          }
        })() as AppLanguage),
  groqApiKey: '',
  googleApiKey: '',
  libraryLectures: [],
  libraryRealtimeCleanup: null,

  setSummaryLength: (summaryLength) => set({ summaryLength }),
  setQuizDifficulty: (quizDifficulty) => set({ quizDifficulty }),
  setUiTheme: (uiTheme) => {
    applyThemeToDom(uiTheme)
    set({ uiTheme })
  },
  setLanguage: (language) => {
    set({ language })
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    } catch {
      // ignore
    }
  },
  setGroqApiKey: (groqApiKey) => set({ groqApiKey }),
  setGoogleApiKey: (googleApiKey) => set({ googleApiKey }),

  applyThemeDocument: (theme) => applyThemeToDom(theme),

  applyRemotePreferences: (prefs) => {
    const next: Partial<AppState> = {}
    if (prefs.summaryLength === 'short' || prefs.summaryLength === 'medium' || prefs.summaryLength === 'long') {
      next.summaryLength = prefs.summaryLength
    }
    if (prefs.quizDifficulty === 'easy' || prefs.quizDifficulty === 'medium' || prefs.quizDifficulty === 'hard') {
      next.quizDifficulty = prefs.quizDifficulty
    }
    if (prefs.uiTheme === 'dark' || prefs.uiTheme === 'light') {
      next.uiTheme = prefs.uiTheme
      applyThemeToDom(prefs.uiTheme)
    }
    if (prefs.language === 'vi' || prefs.language === 'en') {
      next.language = prefs.language
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, prefs.language)
      } catch {
        // ignore
      }
    }
    if (typeof prefs.groq_api_key === 'string') next.groqApiKey = prefs.groq_api_key
    if (typeof prefs.google_api_key === 'string') next.googleApiKey = prefs.google_api_key
    set(next)
  },

  setLibraryLectures: (libraryLectures) => set({ libraryLectures }),

  mergeLibraryRow: (row) =>
    set((s) => {
      const idx = s.libraryLectures.findIndex((l) => l.id === row.id)
      const next = [...s.libraryLectures]
      if (idx >= 0) next[idx] = { ...next[idx], ...row }
      else next.unshift(row)
      return { libraryLectures: next }
    }),

  removeLibraryRow: (id) =>
    set((s) => ({
      libraryLectures: s.libraryLectures.filter((l) => l.id !== id),
    })),

  fetchLibraryLectures: async () => {
    const supabase = getSupabase()
    const uid = useAuthStore.getState().user?.id
    if (!supabase || !uid) return
    const { data, error } = await fetchLecturesRows(supabase, uid)
    if (error || !data) return
    set({ libraryLectures: data as LibraryLectureRow[] })
  },

  unbindLibraryRealtime: () => {
    const c = get().libraryRealtimeCleanup
    c?.()
    set({ libraryRealtimeCleanup: null })
  },

  bindLibraryRealtime: () => {
    get().unbindLibraryRealtime()
    const supabase = getSupabase()
    const uid = useAuthStore.getState().user?.id
    if (!supabase || !uid) return

    const allowRow = (row: LibraryLectureRow) => row.user_id === uid || row.user_id == null || row.user_id === ''
    const channel = supabase
      .channel(`realtime:lectures:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lectures' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const oldRow = payload.old as LibraryLectureRow & { id?: string }
          if (oldRow?.id) get().removeLibraryRow(String(oldRow.id))
          return
        }
        const row = payload.new as LibraryLectureRow
        if (row?.id && allowRow(row)) get().mergeLibraryRow(row)
      })
      .subscribe()

    set({
      libraryRealtimeCleanup: () => {
        supabase.removeChannel(channel)
      },
    })
  },
}))
