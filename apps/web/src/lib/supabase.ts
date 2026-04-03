import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null | undefined
let warnedPublishableKey = false
let anonKeyType: 'unset' | 'publishable' | 'legacyAnonJwt' | null = null

export function getSupabaseAnonKeyType():
  | 'unset'
  | 'publishable'
  | 'legacyAnonJwt' {
  if (anonKeyType) return anonKeyType
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  if (!key) {
    anonKeyType = 'unset'
  } else if (key.startsWith('sb_publishable')) {
    anonKeyType = 'publishable'
  } else {
    // Legacy anon JWT thường bắt đầu bằng `eyJ…`
    anonKeyType = 'legacyAnonJwt'
  }
  return anonKeyType
}

function warnIfPublishableKeyOnly(key: string) {
  if (warnedPublishableKey || !key.startsWith('sb_publishable')) return
  warnedPublishableKey = true
  console.warn(
    '[EtherAI] VITE_SUPABASE_ANON_KEY is a publishable key (sb_publishable_…). ' +
      '@supabase/supabase-js Auth (signInWithPassword) expects the legacy anon JWT (starts with eyJ…) ' +
      'from Dashboard → Settings → API → “anon” / “public” key. ' +
      'Otherwise /auth/v1/token may return 400 and Quiz/Dashboard calls can fail.',
  )
}

/**
 * Lectures list: prefer rows for this user or shared (user_id null).
 * If `user_id` column is missing on `lectures`, retry without the filter (avoids PostgREST 400).
 */
export async function fetchLecturesRows(client: SupabaseClient, userId: string) {
  const scoped = await client
    .from('lectures')
    .select('*')
    .order('id', { ascending: false })
    .or(`user_id.eq.${userId},user_id.is.null`)

  if (!scoped.error) return scoped

  const msg = (scoped.error.message ?? '').toLowerCase()
  if (msg.includes('user_id') || scoped.error.code === 'PGRST204') {
    return client.from('lectures').select('*').order('id', { ascending: false })
  }

  return scoped
}

/** Returns null when VITE_SUPABASE_* are unset (local UI still works with mocks). */
export function getSupabase(): SupabaseClient | null {
  if (_client === undefined) {
    const url = import.meta.env.VITE_SUPABASE_URL?.trim()
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
    if (!url || !key) {
      _client = null
    } else {
      warnIfPublishableKeyOnly(key)
      _client = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    }
  }
  return _client
}

export function isSupabaseConfigured(): boolean {
  return getSupabase() !== null
}
