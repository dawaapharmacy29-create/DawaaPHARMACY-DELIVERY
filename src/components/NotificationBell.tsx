/**
 * NotificationBell — مركز الإشعارات للأدمن
 * يعرض عدد الإشعارات غير المقروءة ويفتح قائمة بالإشعارات الأخيرة
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Bell, BellRing, Check, CheckCheck, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDateTime } from '../lib/helpers'

type Notif = {
  id: string
  title: string
  message: string
  notification_type: string
  severity: 'info' | 'warning' | 'danger' | 'success'
  is_read: boolean
  created_at: string
  rider_name?: string
}

const SEVERITY_STYLES: Record<string, string> = {
  danger:  'bg-rose-50 border-rose-200 text-rose-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  info:    'bg-sky-50 border-sky-200 text-sky-800',
}

const SEVERITY_DOT: Record<string, string> = {
  danger:  'bg-rose-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  info:    'bg-sky-500',
}

interface Props {
  branchId?: string | null
}

export default function NotificationBell({ branchId }: Props) {
  const [open, setOpen]           = useState(false)
  const [notifs, setNotifs]       = useState<Notif[]>([])
  const [unread, setUnread]       = useState(0)
  const [loading, setLoading]     = useState(false)
  const [marking, setMarking]     = useState(false)
  const panelRef                  = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('rider_notifications')
        .select('id, title, message, notification_type, severity, is_read, created_at')
        .order('created_at', { ascending: false })
        .limit(30)

      if (branchId) {
        // فلتر حسب الدليفري التابعين للفرع
        const { data: riders } = await supabase
          .from('riders').select('id').eq('branch_id', branchId)
        const ids = (riders ?? []).map(r => r.id)
        if (ids.length) q = q.in('rider_id', ids)
      }

      const { data } = await q
      const rows = (data ?? []) as Notif[]
      setNotifs(rows)
      setUnread(rows.filter(r => !r.is_read).length)
    } finally {
      setLoading(false)
    }
  }, [branchId])

  // Realtime subscription
  useEffect(() => {
    void load()
    const channel = supabase
      .channel(`notif-bell-${branchId ?? 'all'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rider_notifications' },
        () => void load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [load])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function markAllRead() {
    const ids = notifs.filter(n => !n.is_read).map(n => n.id)
    if (!ids.length) return
    setMarking(true)
    await supabase.from('rider_notifications').update({ is_read: true }).in('id', ids)
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnread(0)
    setMarking(false)
  }

  async function markOne(id: string) {
    await supabase.from('rider_notifications').update({ is_read: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnread(prev => Math.max(0, prev - 1))
  }

  const BellIcon = unread > 0 ? BellRing : Bell

  return (
    <div className="relative" ref={panelRef}>
      {/* زر الجرس */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) void load() }}
        className="relative flex items-center justify-center rounded-2xl p-2 text-slate-600 hover:bg-slate-100 active:scale-95 transition"
        title="الإشعارات"
      >
        <BellIcon size={22} className={unread > 0 ? 'text-[#008E92] animate-pulse' : ''} />
        {unread > 0 && (
          <span className="absolute -top-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* لوحة الإشعارات */}
      {open && (
        <div className="absolute left-0 top-12 z-50 w-80 rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden" dir="rtl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-[#061827]">
            <div className="flex items-center gap-2">
              <BellRing size={16} className="text-[#008E92]" />
              <span className="font-black text-white text-sm">الإشعارات</span>
              {unread > 0 && (
                <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white">
                  {unread} جديد
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={marking}
                  className="flex items-center gap-1 rounded-xl bg-[#008E92]/20 px-2 py-1 text-xs font-bold text-[#008E92] hover:bg-[#008E92]/30 disabled:opacity-50"
                  title="تحديد الكل كمقروء"
                >
                  <CheckCheck size={12} />
                  الكل مقروء
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-xl p-1 text-slate-400 hover:text-white transition">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#008E92] border-t-transparent" />
              </div>
            )}

            {!loading && notifs.length === 0 && (
              <div className="py-10 text-center text-sm text-slate-400">
                <Bell size={32} className="mx-auto mb-2 opacity-30" />
                لا توجد إشعارات
              </div>
            )}

            {!loading && notifs.map(n => (
              <div
                key={n.id}
                className={`border-b border-slate-50 p-3 transition ${n.is_read ? 'opacity-60' : 'bg-slate-50/80'}`}
              >
                <div className="flex items-start gap-2">
                  {/* Dot */}
                  <div className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${SEVERITY_DOT[n.severity] ?? 'bg-slate-400'} ${n.is_read ? 'opacity-30' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-black ${n.is_read ? 'text-slate-500' : 'text-slate-800'}`}>
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500 leading-relaxed line-clamp-2">{n.message}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(n.created_at)}</p>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={() => void markOne(n.id)}
                      className="flex-shrink-0 rounded-xl p-1 text-slate-300 hover:text-[#008E92] transition"
                      title="تحديد كمقروء"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </div>
                {/* Badge */}
                <div className={`mt-1.5 mr-4 inline-block rounded-xl border px-2 py-0.5 text-[10px] font-bold ${SEVERITY_STYLES[n.severity] ?? ''}`}>
                  {n.notification_type === 'battery_warning' ? '🔋 بطارية' :
                   n.notification_type === 'order_alert'    ? '📦 أوردر'   :
                   n.notification_type === 'urgent'         ? '🚨 عاجل'    : n.notification_type}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
