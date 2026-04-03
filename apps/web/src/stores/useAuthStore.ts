import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabase, getSupabaseAnonKeyType } from '../lib/supabase'

type AuthState = {
  session: Session | null
  user: User | null
  ready: boolean
  initialize: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

let authListener: { unsubscribe: () => void } | undefined

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  ready: false,

  initialize: async () => {
    if (get().ready) return
    const supabase = getSupabase()
    if (!supabase) {
      set({ session: null, user: null, ready: true })
      return
    }
    const { data } = await supabase.auth.getSession()
    const session = data.session ?? null
    set({ session, user: session?.user ?? null })

    if (!authListener) {
      const { data: authSub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        set({ session: nextSession, user: nextSession?.user ?? null })
      })
      authListener = authSub.subscription
    }

    set({ ready: true })
  },

  signInWithEmail: async (email, password) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured (missing VITE_SUPABASE_URL / ANON KEY).' }
    const t = getSupabaseAnonKeyType()
    if (t === 'publishable') {
      return {
        error:
          'VITE_SUPABASE_ANON_KEY đang là sb_publishable_… (publishable key). ' +
          'Đăng nhập email/password cần legacy anon JWT bắt đầu bằng “eyJ…”. ' +
          'Vui lòng dùng đúng “anon/public” key trong Supabase Dashboard → Settings → API.',
      }
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return { error: error?.message ?? null }
  },

  signUpWithEmail: async (email, password, displayName) => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase is not configured (missing VITE_SUPABASE_URL / ANON KEY).' }
    const t = getSupabaseAnonKeyType()
    if (t === 'publishable') {
      return {
        error:
          'VITE_SUPABASE_ANON_KEY đang là sb_publishable_… (publishable key). ' +
          'Đăng ký email/password cần legacy anon JWT bắt đầu bằng “eyJ…”. ' +
          'Vui lòng dùng đúng “anon/public” key trong Supabase Dashboard → Settings → API.',
      }
    }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: displayName?.trim()
        ? { data: { full_name: displayName.trim(), display_name: displayName.trim() } }
        : undefined,
    })
    return { error: error?.message ?? null }
  },

  signOut: async () => {
    const supabase = getSupabase()
    if (supabase) await supabase.auth.signOut()
    set({ session: null, user: null })
  },
}))
