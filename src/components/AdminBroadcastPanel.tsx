/**
 * AdminBroadcastPanel — مركز البث الفوري
 * يرسل رسالة عاجلة لكل الدليفري أو مجموعة منهم دفعة واحدة
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Megaphone, X, Send, ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, Info, Bell, Users, User, Loader2,
  History, Clock
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { showLocalNotification } from '../lib/pushNotifications'
import { formatDateTime } from '../lib/helpers'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type MsgType = 'urgent' | 'reminder' | 'order_alert' | 'info'

interface RiderOption { id: string; name: string; branch_name?: string | null }

interface BroadcastRecord {
  id: string
  title: string
  message: string
  msg_type: MsgType
  target_type: 'all' | 'branch' | 'rider'
  target_label: string
  sent_count: number
  sent_at: string
}

interface Props {
  branchId?: string | null          // null = super-admin (all branches)
  branchName?: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MSG_TYPES: { value: MsgType; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'urgent',      label: 'عاجل 🚨',      icon: <AlertTriangle size={14} />, color: 'bg-rose-100 text-rose-800 border-rose-300' },
  { value: 'reminder',    label: 'تذكير 🔔',      icon: <Bell size={14} />,          color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'order_alert', label: 'أوردر 📦',      icon: <CheckCircle2 size={14} />,  color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'info',        label: 'معلومة 💬',     icon: <Info size={14} />,          color: 'bg-sky-100 text-sky-800 border-sky-300' },
]

const QUICK_MESSAGES: { label: string; title: string; body: string; type: MsgType }[] = [
  { label: 'شحن الهاتف',   title: 'تنبيه: شحن الهاتف',            body: 'برجاء التأكد من شحن هاتفك وبقاء التطبيق مفتوحًا طوال الشيفت.',       type: 'urgent' },
  { label: 'اجتماع عاجل',  title: '🚨 اجتماع عاجل',               body: 'مطلوب حضورك فورًا في الفرع. يرجى التواصل مع المشرف.',                   type: 'urgent' },
  { label: 'تذكير الشيفت', title: 'تذكير: بدء الشيفت',            body: 'تذكير بأن شيفتك يبدأ قريبًا. تأكد من جاهزيتك ووجودك في المكان.',       type: 'reminder' },
  { label: 'أوردرات كتير', title: '📦 أوردرات بتنتظرك',           body: 'يوجد أوردرات تنتظر التوصيل. يرجى المتابعة فورًا والتسريع.',             type: 'order_alert' },
  { label: 'شكرًا',        title: '✅ شكرًا على الأداء المميز',    body: 'شكرًا لجهودكم اليوم. استمروا على هذا المستوى الرائع!',                  type: 'info' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminBroadcastPanel({ branchId, branchName }: Props) {
  const [open, setOpen]           = useState(false)
  const [tab, setTab]             = useState<'compose' | 'history'>('compose')
  const panelRef                  = useRef<HTMLDivElement>(null)

  // Form state
  const [title,       setTitle]      = useState('')
  const [body,        setBody]       = useState('')
  const [msgType,     setMsgType]    = useState<MsgType>('urgent')
  const [targetType,  setTargetType] = useState<'all' | 'branch' | 'rider'>('all')
  const [riderId,     setRiderId]    = useState<string>('')
  const [targetBranch, setTargetBranch] = useState<string>(branchId ?? '')
  const [showPreview, setShowPreview] = useState(false)

  // Data
  const [riders,   setRiders]   = useState<RiderOption[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [history,  setHistory]  = useState<BroadcastRecord[]>([])
  const [sending,  setSending]  = useState(false)

  // ── Load riders + branches ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const rq = supabase.from('riders').select('id, name, branch_name').eq('status', 'active').order('name')
    const bq = supabase.from('branches').select('id, name').eq('active', true).order('name')
    const [{ data: r }, { data: b }] = await Promise.all([
      branchId ? rq.eq('branch_id', branchId) : rq,
      bq,
    ])
    setRiders((r ?? []) as RiderOption[])
    setBranches((b ?? []) as { id: string; name: string }[])
  }, [branchId])

  // ── Load history from Supabase ─────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('broadcast_history')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(20)
    if (data) setHistory(data as BroadcastRecord[])
  }, [])

  useEffect(() => {
    if (open) {
      void loadData()
      void loadHistory()
    }
  }, [open, loadData, loadHistory])

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // ── Target label ──────────────────────────────────────────────────────────
  const targetLabel = () => {
    if (targetType === 'rider') return riders.find(r => r.id === riderId)?.name ?? 'مندوب محدد'
    if (targetType === 'branch') return branches.find(b => b.id === targetBranch)?.name ?? 'فرع'
    return branchId ? `فرع ${branchName ?? ''}` : 'جميع المندوبين'
  }

  // ── Send broadcast ─────────────────────────────────────────────────────────
  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      toast.error('من فضلك اكتب العنوان والرسالة')
      return
    }
    if (targetType === 'rider' && !riderId) {
      toast.error('اختر المندوب أولًا')
      return
    }

    setSending(true)
    try {
      // 1. Build target list
      let targets: RiderOption[] = []
      if (targetType === 'rider') {
        targets = riders.filter(r => r.id === riderId)
      } else if (targetType === 'branch') {
        targets = riders.filter(r =>
          targetBranch
            ? (r as any).branch_id === targetBranch
            : true
        )
      } else {
        targets = riders
      }

      if (targets.length === 0) {
        toast.warning('لا يوجد مندوبين في النطاق المحدد')
        setSending(false)
        return
      }

      // 2. Insert notifications in bulk
      const inserts = targets.map(r => ({
        rider_id:          r.id,
        title:             title.trim(),
        message:           body.trim(),
        notification_type: msgType,
        severity:          msgType === 'urgent' ? 'danger' : msgType === 'reminder' ? 'warning' : 'info',
        is_read:           false,
        metadata:          { source: 'admin_broadcast', target_type: targetType },
      }))

      const { error } = await supabase.from('rider_notifications').insert(inserts)
      if (error) throw error

      // 3. Try Edge Function for push delivery
      await supabase.functions.invoke('send-push-broadcast', {
        body: {
          rider_ids: targets.map(r => r.id),
          title: title.trim(),
          body: body.trim(),
          url: '/rider',
        },
      }).catch(() => {
        // Edge Function not deployed — fall back to local SW notification
      })

      // 4. Local notification for admin tab (confirm)
      await showLocalNotification({
        title: `✅ تم الإرسال: ${title.trim()}`,
        body: `أُرسلت الرسالة لـ ${targets.length} مندوب`,
        tag: 'broadcast-confirm',
        url: '/admin',
      })

      // 5. Save to broadcast_history
      await supabase.from('broadcast_history').insert({
        title:        title.trim(),
        message:      body.trim(),
        msg_type:     msgType,
        target_type:  targetType,
        target_label: targetLabel(),
        sent_count:   targets.length,
        sent_at:      new Date().toISOString(),
      }).then(() => {})

      toast.success(`✅ تم الإرسال لـ ${targets.length} مندوب بنجاح`)
      setTitle('')
      setBody('')
      setShowPreview(false)
      setTab('history')
      void loadHistory()
    } catch (e: any) {
      toast.error(e?.message || 'فشل الإرسال')
    } finally {
      setSending(false)
    }
  }

  const selectedType = MSG_TYPES.find(t => t.value === msgType)!

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-2xl bg-[#061827] px-3 py-2.5 text-sm font-black text-white shadow-sm hover:bg-[#0a2540] active:scale-95 transition"
        title="بث رسالة عاجلة"
      >
        <Megaphone size={17} />
        <span className="hidden sm:inline">بث فوري</span>
      </button>

      {/* Panel */}
      {open && (
        <div
          className="absolute left-0 top-14 z-50 w-96 rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
          dir="rtl"
          style={{ maxHeight: '85vh', overflowY: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-[#061827] px-5 py-4">
            <div className="flex items-center gap-2">
              <Megaphone size={18} className="text-[#008E92]" />
              <span className="font-black text-white">مركز البث الفوري</span>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-xl p-1 text-slate-400 hover:text-white transition">
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {(['compose', 'history'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-black transition ${
                  tab === t ? 'border-b-2 border-[#008E92] text-[#008E92]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {t === 'compose' ? <><Send size={13} className="inline ml-1" />إنشاء رسالة</> : <><History size={13} className="inline ml-1" />السجل</>}
              </button>
            ))}
          </div>

          {/* ── COMPOSE ── */}
          {tab === 'compose' && (
            <div className="space-y-4 p-4">

              {/* Quick messages */}
              <div>
                <p className="mb-2 text-xs font-black text-slate-500">رسائل سريعة</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_MESSAGES.map(q => (
                    <button
                      key={q.label}
                      onClick={() => { setTitle(q.title); setBody(q.body); setMsgType(q.type) }}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-[#008E92] hover:text-[#008E92] transition"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message type */}
              <div>
                <p className="mb-2 text-xs font-black text-slate-500">نوع الرسالة</p>
                <div className="grid grid-cols-2 gap-2">
                  {MSG_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setMsgType(t.value)}
                      className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-black transition ${
                        msgType === t.value ? t.color + ' ring-1 ring-current' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {t.icon} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target */}
              <div>
                <p className="mb-2 text-xs font-black text-slate-500">الإرسال إلى</p>
                <div className="flex gap-2">
                  {[
                    { v: 'all' as const,    label: 'الكل',   icon: <Users size={13} /> },
                    { v: 'branch' as const, label: 'فرع',    icon: <Bell size={13} />, hide: !!branchId },
                    { v: 'rider' as const,  label: 'مندوب',  icon: <User size={13} /> },
                  ].filter(x => !x.hide).map(opt => (
                    <button
                      key={opt.v}
                      onClick={() => setTargetType(opt.v)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-2xl border py-2 text-xs font-black transition ${
                        targetType === opt.v
                          ? 'border-[#008E92] bg-[#008E92]/10 text-[#008E92]'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>

                {/* Branch selector */}
                {targetType === 'branch' && !branchId && (
                  <select
                    value={targetBranch}
                    onChange={e => setTargetBranch(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:border-[#008E92]"
                  >
                    <option value="">اختر الفرع</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}

                {/* Rider selector */}
                {targetType === 'rider' && (
                  <select
                    value={riderId}
                    onChange={e => setRiderId(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:border-[#008E92]"
                  >
                    <option value="">اختر المندوب</option>
                    {riders.map(r => (
                      <option key={r.id} value={r.id}>{r.name}{r.branch_name ? ` — ${r.branch_name}` : ''}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="mb-1 block text-xs font-black text-slate-500">العنوان</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="مثال: تنبيه عاجل بخصوص الشيفت"
                  maxLength={100}
                  className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-[#008E92] focus:ring-2 focus:ring-[#008E92]/20"
                />
              </div>

              {/* Body */}
              <div>
                <label className="mb-1 block text-xs font-black text-slate-500">نص الرسالة</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  placeholder="اكتب الرسالة هنا..."
                  rows={3}
                  maxLength={500}
                  className="w-full resize-none rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-[#008E92] focus:ring-2 focus:ring-[#008E92]/20"
                />
                <p className="mt-1 text-left text-[10px] text-slate-400">{body.length}/500</p>
              </div>

              {/* Preview toggle */}
              {title && body && (
                <button
                  onClick={() => setShowPreview(p => !p)}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  <span>معاينة الإشعار</span>
                  {showPreview ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}

              {/* Preview */}
              {showPreview && title && body && (
                <div className={`rounded-2xl border p-3 ${selectedType.color}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">📱</span>
                    <div>
                      <p className="text-sm font-black">{title}</p>
                      <p className="mt-0.5 text-xs opacity-80">{body}</p>
                      <p className="mt-1 text-[10px] opacity-60">إلى: {targetLabel()} • الآن</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={sending || !title.trim() || !body.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#008E92] py-3 font-black text-white shadow-sm hover:bg-[#05777B] disabled:opacity-50 active:scale-95 transition"
              >
                {sending
                  ? <><Loader2 size={16} className="animate-spin" /> جاري الإرسال...</>
                  : <><Send size={16} /> إرسال الآن</>}
              </button>
            </div>
          )}

          {/* ── HISTORY ── */}
          {tab === 'history' && (
            <div className="p-4 space-y-3">
              {history.length === 0 && (
                <div className="py-10 text-center text-sm text-slate-400">
                  <Megaphone size={32} className="mx-auto mb-2 opacity-30" />
                  لا يوجد سجل بث بعد
                </div>
              )}
              {history.map(h => {
                const t = MSG_TYPES.find(m => m.value === h.msg_type)
                return (
                  <div key={h.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-black text-[#061827] leading-snug">{h.title}</p>
                      <span className={`flex-shrink-0 rounded-xl border px-2 py-0.5 text-[10px] font-black ${t?.color ?? ''}`}>
                        {t?.label ?? h.msg_type}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">{h.message}</p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><Users size={10} /> {h.sent_count} مندوب</span>
                      <span className="flex items-center gap-1"><User size={10} /> {h.target_label}</span>
                      <span className="flex items-center gap-1 mr-auto"><Clock size={10} /> {formatDateTime(h.sent_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
