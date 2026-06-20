import { supabase } from './supabase'
import { Rider } from './types'
import { getOrCreateDeviceId, getDeviceLabel } from './deviceBinding'

// ─── RIDER LOGIN (uses rider_accounts table, NOT Supabase Auth) ─────────────

/**
 * تسجيل دخول الدليفري باستخدام rider_pin_login RPC
 * لا يعتمد على Supabase Auth، فقط على جدول rider_accounts
 */
export async function loginWithPin(username: string, pin: string): Promise<{
  success: boolean
  account_id?: string
  rider_id?: string
  username?: string
  rider_name: string
  branch_id?: string
  branch_name?: string
  role?: string
  must_change_pin?: boolean
  error?: string
  message?: string
  attempts_left?: number
  session_token?: string
  device_status?: string
  device_message?: string
} | null> {
  // نحوّل الـ username للـ UPPER لأن قاعدة البيانات بتعمل UPPER() من جانبها
  // لكن نحوّل هنا كمان للـ consistency ولو في uppercase-sensitive comparison
  const rawUsername = username.trim()
  // الأسماء العربية تُرسل كما هي، الأسماء اللاتينية تُحوّل لـ uppercase
  const cleanUsername = /[\u0600-\u06FF]/.test(rawUsername) ? rawUsername : rawUsername.toUpperCase()
  const cleanPin = pin.trim()
  const deviceId = getOrCreateDeviceId()
  const deviceLabel = getDeviceLabel()

  // نحاول أولاً بالنسخة الجديدة التي تدعم ربط الجهاز.
  const { data, error: fnError } = await supabase.rpc('rider_pin_login', {
    p_username: cleanUsername,
    p_pin: cleanPin,
    p_ip: null,
    p_ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    p_device_id: deviceId,
    p_device_label: deviceLabel,
  })

  if (fnError) {
    // fallback لو PostgREST schema cache لسه شايف الدالة القديمة
    const { data: oldData, error: oldError } = await supabase.rpc('rider_pin_login', {
      p_username: cleanUsername,
      p_pin: cleanPin,
      p_ip: null,
      p_ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    })

    if (oldError) {
      return null
    }
    return (Array.isArray(oldData) ? oldData[0] : oldData) as any
  }

  return (Array.isArray(data) ? data[0] : data) as any
}

// ─── RIDER SESSION (localStorage, NOT Supabase Auth) ────────────────────────

// ثابت لمدة الجلسة (30 يوم)
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000
const RIDER_SESSION_KEY = 'dawaa_rider_session'

export type StoredRiderSession = {
  account_id: string | null
  rider_id: string | null
  username: string | null
  rider_name: string | null
  branch_id: string | null
  branch_name: string | null
  session_token: string | null
  role: string | null
  must_change_pin?: boolean
  logged_in_at?: string
  expires_at?: string
}

function emptyRiderSession(): StoredRiderSession {
  return {
    account_id: null,
    rider_id: null,
    username: null,
    rider_name: null,
    branch_id: null,
    branch_name: null,
    session_token: null,
    role: null,
  }
}

function normalizeStoredSession(s: any): StoredRiderSession {
  const loggedInAt = s?.logged_in_at || new Date().toISOString()
  const expiresAt = s?.expires_at || new Date(new Date(loggedInAt).getTime() + SESSION_DURATION_MS).toISOString()
  return {
    account_id: s?.account_id || null,
    rider_id: s?.rider_id || null,
    username: s?.username || null,
    rider_name: s?.rider_name || null,
    branch_id: s?.branch_id || null,
    branch_name: s?.branch_name || null,
    session_token: s?.session_token || null,
    role: s?.role || 'rider',
    must_change_pin: !!s?.must_change_pin,
    logged_in_at: loggedInAt,
    expires_at: expiresAt,
  }
}

export function restoreRiderSession(): StoredRiderSession | null {
  try {
    const raw = localStorage.getItem(RIDER_SESSION_KEY)
    if (raw) {
      const session = normalizeStoredSession(JSON.parse(raw))
      const expiresAt = session.expires_at ? new Date(session.expires_at).getTime() : 0
      if (!session.account_id && !session.rider_id) return null
      if (!expiresAt || Date.now() > expiresAt) {
        clearRiderSession()
        return null
      }
      localStorage.setItem(RIDER_SESSION_KEY, JSON.stringify(session))
      return session
    }
  } catch {
    clearRiderSession()
    return null
  }

  const riderId = localStorage.getItem('rider_id')
  const riderName = localStorage.getItem('rider_name')
  if (!riderId && !riderName) return null

  const legacy = normalizeStoredSession({
    rider_id: riderId,
    rider_name: riderName,
    branch_id: localStorage.getItem('rider_branch_id'),
    branch_name: localStorage.getItem('rider_branch_name'),
    session_token: localStorage.getItem('rider_session_token'),
    role: 'rider',
    logged_in_at: new Date().toISOString(),
  })
  localStorage.setItem(RIDER_SESSION_KEY, JSON.stringify(legacy))
  return legacy
}

export function getRiderSession(): {
  account_id: string | null
  rider_id: string | null
  username: string | null
  rider_name: string | null
  branch_id: string | null
  branch_name: string | null
  session_token: string | null
  role: string | null
} {
  return restoreRiderSession() || emptyRiderSession()
}

export function setRiderSession(data: {
  account_id?: string
  rider_id?: string
  username?: string
  rider_name: string
  branch_id?: string
  branch_name?: string
  role?: string
  must_change_pin?: boolean
  session_token?: string
  expires_at?: string
}) {
  const loggedInAt = new Date()
  localStorage.setItem(RIDER_SESSION_KEY, JSON.stringify({
    account_id: data.account_id || '',
    rider_id: data.rider_id || '',
    username: data.username || '',
    rider_name: data.rider_name,
    branch_id: data.branch_id || '',
    branch_name: data.branch_name || '',
    role: data.role || 'rider',
    must_change_pin: !!data.must_change_pin,
    session_token: data.session_token || '',
    logged_in_at: loggedInAt.toISOString(),
    expires_at: data.expires_at || new Date(loggedInAt.getTime() + SESSION_DURATION_MS).toISOString(),
  }))
  // backward compat
  if (data.rider_id) localStorage.setItem('rider_id', data.rider_id)
  else localStorage.removeItem('rider_id')
  localStorage.setItem('rider_name', data.rider_name)
  if (data.branch_id) localStorage.setItem('rider_branch_id', data.branch_id)
  if (data.branch_name) localStorage.setItem('rider_branch_name', data.branch_name)
  if (data.session_token) localStorage.setItem('rider_session_token', data.session_token)
}

export function clearRiderSession() {
  localStorage.removeItem(RIDER_SESSION_KEY)
  localStorage.removeItem('rider_id')
  localStorage.removeItem('rider_name')
  localStorage.removeItem('rider_branch_id')
  localStorage.removeItem('rider_branch_name')
  localStorage.removeItem('rider_session_token')
}

export function hasRiderSession(): boolean {
  const s = restoreRiderSession()
  return !!(s?.account_id || s?.rider_id)
}

export async function validateStoredRiderSession(): Promise<StoredRiderSession | null> {
  const local = restoreRiderSession()
  if (!local?.session_token) {
    clearRiderSession()
    return null
  }
  try {
    const { data, error } = await supabase.rpc('rider_validate_session', { p_token: local.session_token })
    const result = (Array.isArray(data) ? data[0] : data) as any
    // خطأ اتصال أو PostgREST مؤقت لا يخرج الدليفري من الشغل؛ الرد valid=false فقط هو الذي يلغي الجلسة.
    if (error) return local
    if (!result?.valid) {
      clearRiderSession()
      return null
    }
    const verified: StoredRiderSession = normalizeStoredSession({
      ...local,
      account_id: result.account_id || local.account_id,
      rider_id: result.rider_id || local.rider_id,
      username: result.username || local.username,
      rider_name: result.rider_name || local.rider_name,
      branch_id: result.branch_id || local.branch_id,
      branch_name: result.branch_name || local.branch_name,
      role: result.role || local.role,
      must_change_pin: result.must_change_pin ?? local.must_change_pin,
      expires_at: result.expires_at || local.expires_at,
      session_token: local.session_token,
    })
    localStorage.setItem(RIDER_SESSION_KEY, JSON.stringify(verified))
    return verified
  } catch {
    // فشل الشبكة المؤقت لا يساوي انتهاء الجلسة؛ نحتفظ بها حتى يعود الاتصال.
    if (navigator.onLine) {
      clearRiderSession()
      return null
    }
    return local
  }
}

// ─── RIDER DATA FETCHING (by rider_id from session) ───────────────────────

export async function getRiderById(riderId: string): Promise<Rider | null> {
  const { data, error } = await supabase
    .from('riders')
    .select('*')
    .eq('id', riderId)
    .maybeSingle()

  if (error) {
    return null
  }

  return data as Rider | null
}

// ─── ADMIN LOGIN (uses Supabase Auth) ───────────────────────────────────────

// Admin login aliases — loaded from env or fallback
const ADMIN_EMAIL_DOMAIN = import.meta.env.VITE_ADMIN_EMAIL_DOMAIN || 'dawaa-delivery.local'
const ADMIN_LOGIN_ALIASES: Record<string, string> = {
  'dr.moaz':  `dr.moaz@${ADMIN_EMAIL_DOMAIN}`,
  'DR.MOAZ':  `dr.moaz@${ADMIN_EMAIL_DOMAIN}`,
  'د.معاذ':   `dr.moaz@${ADMIN_EMAIL_DOMAIN}`,
  'د. معاذ':  `dr.moaz@${ADMIN_EMAIL_DOMAIN}`,
}

export function resolveAdminLogin(input: string): string | null {
  const raw = input.trim()
  const lower = raw.toLowerCase()
  if (raw.includes('@')) return raw.toLowerCase()
  return ADMIN_LOGIN_ALIASES[raw] || ADMIN_LOGIN_ALIASES[lower] || null
}

/**
 * تسجيل دخول موحد للأدمن:
 * - الدليفري: يستخدم loginWithPin (راكب)
 * - الأدمن  : يستخدم loginUnified (Supabase Auth)
 */
export async function loginUnified(usernameOrEmail: string, password: string) {
  const input = usernameOrEmail.trim()
  const email = resolveAdminLogin(input) || input

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function loginWithUsername(username: string, password: string) {
  return loginUnified(username, password)
}

export async function getUserProfile(userId: string): Promise<any | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (error) {
    return null
  }

  return data
}

export async function logout() {
  const riderSession = restoreRiderSession()
  if (riderSession?.session_token) {
    try {
      await supabase.rpc('rider_logout', { p_token: riderSession.session_token })
    } catch {
      // نمسح الجهاز حتى لو تعذر إبلاغ السيرفر؛ الجلسة ستنتهي أو تُلغى عند Login جديد.
    }
  }
  clearRiderSession()
  // Also clear Supabase Auth session for admin
  await supabase.auth.signOut()
}

export async function getCurrentSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
