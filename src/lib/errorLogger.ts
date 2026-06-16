/**
 * errorLogger.ts
 * يسجّل الأخطاء غير المتوقعة في Supabase بشكل صامت
 * — بدون console.error في production
 * — لا يرفع معلومات حساسة (passwords, tokens)
 */
import { supabase } from './supabase'

const isDev = import.meta.env.DEV

function sanitize(val: unknown): unknown {
  if (typeof val !== 'string') return val
  // امسح أي حاجة تبدو زي token أو password
  return val.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[JWT]')
           .replace(/password["':\s]+["'][^"']+["']/gi, '[PASSWORD]')
}

let _riderContext: { riderId?: string; role?: string } = {}

export function setErrorLoggerContext(ctx: { riderId?: string; role?: string }) {
  _riderContext = ctx
}

export async function logError(
  error: unknown,
  context?: Record<string, unknown>
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const stack   = error instanceof Error ? error.stack?.slice(0, 1000) : undefined

  if (isDev) {
    // في dev — نطبع بالكونسول فقط
    console.error('[ErrorLogger]', message, error, context)
    return
  }

  try {
    await supabase.from('client_error_logs').insert({
      message: sanitize(message),
      stack,
      rider_id: _riderContext.riderId ?? null,
      role: _riderContext.role ?? null,
      url: window.location.pathname,
      user_agent: navigator.userAgent.slice(0, 200),
      context_json: context ? JSON.parse(JSON.stringify(context, (_k, v) => sanitize(v))) : null,
      occurred_at: new Date().toISOString(),
    })
  } catch {
    // لو حتى logging فشل — بلاش نعمل حاجة
  }
}

/** يُسجّل global window errors تلقائيًا */
export function setupGlobalErrorLogger(): () => void {
  const onError = (event: ErrorEvent) => {
    void logError(event.error ?? new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  }

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    void logError(event.reason, { type: 'unhandledRejection' })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onUnhandledRejection)

  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onUnhandledRejection)
  }
}
