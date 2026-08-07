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

const DELIVERY_PROJECT_REF = 'qlugjplnnkjzxcbhwopg'
const DELIVERY_FALLBACK_URL = `https://${DELIVERY_PROJECT_REF}.supabase.co`
// Supabase publishable keys are intended for client-side use. Keep this fallback so a
// stale/misconfigured Vercel environment can never point the delivery app at another project.
const DELIVERY_FALLBACK_PUBLISHABLE_KEY = 'sb_publishable_mYRf8RCDQiAPvrNt54FVWQ_--lmwiHA'

const configuredUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
const configuredKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)
const configuredProjectIsDelivery = configuredUrl.includes(DELIVERY_PROJECT_REF)

const supabaseUrl = configuredProjectIsDelivery && configuredKey
  ? configuredUrl
  : DELIVERY_FALLBACK_URL
const supabaseAnonKey = configuredProjectIsDelivery && configuredKey
  ? configuredKey
  : DELIVERY_FALLBACK_PUBLISHABLE_KEY

if (!configuredProjectIsDelivery && configuredUrl) {
  console.warn('Dawaa Delivery ignored a non-delivery Supabase project configuration.')
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
