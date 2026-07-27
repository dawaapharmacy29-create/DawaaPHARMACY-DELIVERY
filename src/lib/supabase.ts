import { createClient } from '@supabase/supabase-js'

function cleanEnv(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
}

function normalizeSupabaseUrl(value: unknown) {
  const cleaned = cleanEnv(value)
  if (!cleaned) return ''

  // Vercel values are sometimes pasted with /rest/v1 or a trailing slash.
  // createClient needs the project base URL only.
  return cleaned
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/$/, '')
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
  },
  realtime: {
    timeout: 30000,
  },
})

export const supabaseProjectUrl = supabaseUrl
