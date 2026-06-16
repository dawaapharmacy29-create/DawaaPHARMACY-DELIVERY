import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // احتفظ بالجلسة في localStorage (default)
    persistSession: true,
    // اعمل auto refresh للـ token قبل ما ينتهي
    autoRefreshToken: true,
    // detect session في localStorage وكمان URL (مفيد لـ magic link)
    detectSessionInUrl: true,
  },
  realtime: {
    // timeout أطول للـ Safari على موبايل
    timeout: 30000,
  },
  global: {
    // retry للـ fetch requests في حالة انقطاع الإنترنت
    fetch: (url: RequestInfo | URL, init?: RequestInit) => {
      return fetch(url, {
        ...init,
        signal: AbortSignal.timeout?.(20000) ?? init?.signal,
      }).catch(err => {
        // silent fail على الـ AbortError (timeout)
        if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
          return Promise.reject(new Error('طلب الشبكة انتهى وقته. تأكد من الاتصال.'))
        }
        return Promise.reject(err)
      })
    },
  },
})
