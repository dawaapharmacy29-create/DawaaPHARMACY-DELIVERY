import { createClient } from '@supabase/supabase-js'

function cleanEnv(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
}

function normalizeSupabaseUrl(value: unknown) {
  const cleaned = cleanEnv(value)
  if (!cleaned) return ''

  return cleaned
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/$/, '')
}

const memoryStorage = new Map<string, string>()

const resilientAuthStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      try {
        return window.sessionStorage.getItem(key)
      } catch {
        return memoryStorage.get(key) ?? null
      }
    }
  },
  setItem(key: string, value: string): void {
    memoryStorage.set(key, value)
    try {
      window.localStorage.setItem(key, value)
      return
    } catch {
      try {
        window.sessionStorage.setItem(key, value)
      } catch {
        // Restricted browser/WebView: memory fallback is enough for this tab.
      }
    }
  },
  removeItem(key: string): void {
    memoryStorage.delete(key)
    try {
      window.localStorage.removeItem(key)
    } catch {
      try {
        window.sessionStorage.removeItem(key)
      } catch {
        // Ignore storage restrictions.
      }
    }
  },
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: resilientAuthStorage,
  },
  realtime: {
    timeout: 30000,
  },
})

export const supabaseProjectUrl = supabaseUrl
