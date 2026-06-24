import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BatteryCharging, CheckCircle2, LogIn, RefreshCw, Send, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { getRiderSession } from '../lib/auth'

type LiveRow = {
  account_id: string; username: string; rider_id: string; rider_name: string; branch_name?: string | null
  active_sessions_count: number; latest_session_at?: string | null; login_status: string
  open_attendance_id?: string | null; shift_date?: string | null; check_in_time?: string | null
  shift_status: 'shift_open' | 'no_open_shift' | 'offline'; current_shift_orders: number; current_shift_trips: number; last_order_at?: string | null
}

type BatteryRow = {
  rider_id: string
  rider_name?: string | null
  branch_name?: string | null
  battery_percent?: number | null
  is_charging?: boolean | null
  battery_supported?: boolean | null
  online?: boolean | null
  last_seen_at?: string | null
  battery_alert_level?: string | null
  battery_alert_message?: string | null
}

function batteryTone(level?: string | null) {
  if (level === 'critical') return 'bg-rose-50 text-rose-700'
  if (level === 'low') return 'bg-amber-50 text-amber-700'
  if (level === 'charging') return 'bg-sky-50 text-sky-700'
  if (level === 'offline') return 'bg-slate-100 text-slate-500'
  if (level === 'unsupported') return 'bg-slate-50 text-slate-400'
  return 'bg-emerald-50 text-emerald-700'
}

function batteryText(row?: BatteryRow) {
  if (!row) return '—'
  if (row.battery_supported === false) return 'غير مدعوم'
  if (row.battery_percent === null || row.battery_percent === undefined) return '—'
  return `${row.battery_percent}%${row.is_charging ? ' · شحن' : ''}`
}

export default function RiderOperationsHealth() {
  const [rows, setRows] = useState<LiveRow[]>([])
  const [batteryRows, setBatteryRows] = useState<BatteryRow[]>([])
  const [missingOrders, setMissingOrders] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [live, missing, battery] = await Promise.all([
      supabase.from('rider_live_status_view').select('*').order('rider_name'),
      supabase.from('delivery_orders_missing_shift_view').select('id', { count: 'exact', head: true }),
      supabase.from('rider_battery_overview').select('*').order('rider_name'),
    ])
    if (live.error) setRows([])
    else setRows((live.data || []) as LiveRow[])
    if (battery.error) setBatteryRows([])
    else setBatteryRows((battery.data || []) as BatteryRow[])
    setMissingOrders(missing.count || 0)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const batteryMap = useMemo(() => new Map(batteryRows.map(row => [row.rider_id, row])), [batteryRows])

  async function action(name: 'open' | 'cleanup', riderId?: string) {
    const token = getRiderSession().session_token
    if (!token) return toast.error('الإجراء يحتاج جلسة مدير PIN صالحة')
    setBusy(`${name}-${riderId || 'all'}`)
    const { data, error } = name === 'open'
      ? await supabase.rpc('admin_open_rider_shift', { p_token: token, p_rider_id: riderId })
      : await supabase.rpc('admin_close_old_rider_sessions', { p_token: token, p_rider_id: riderId || null })
    const result = Array.isArray(data) ? data[0] : data
    if (error || !result?.success) toast.error(error?.message || result?.message || 'تعذر تنفيذ الإجراء')
    else { toast.success(result.message); await load() }
    setBusy(null)
  }

  async function sendBatteryAlert(row: LiveRow) {
    const battery = batteryMap.get(row.rider_id)
    setBusy(`battery-${row.rider_id}`)
    const { error } = await supabase.from('rider_notifications').insert({
      rider_id: row.rider_id,
      title: 'تنبيه شحن البطارية',
      message: `برجاء توصيل الشاحن الآن. نسبة البطارية الحالية: ${batteryText(battery)}.`,
      type: 'battery_alert',
      priority: battery?.battery_alert_level === 'critical' ? 'high' : 'normal',
      created_at: new Date().toISOString(),
    })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success(`تم إرسال تنبيه شحن إلى ${row.rider_name}`)
  }

  const logged = rows.filter(r => r.login_status === 'logged_in')
  const open = rows.filter(r => r.shift_status === 'shift_open')
  const noShift = rows.filter(r => r.shift_status === 'no_open_shift')
  const duplicateSessions = rows.filter(r => Number(r.active_sessions_count) > 1)
  const lowBattery = batteryRows.filter(b => ['low', 'critical'].includes(String(b.battery_alert_level)))

  return <section className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Stethoscope/></span><div><h2 className="font-black text-[#102a32]">صحة تشغيل الدليفري</h2><p className="mt-1 text-xs font-bold text-slate-400">Login، الشيفت، الجلسات، البطارية، والأوردرات غير المرتبطة</p></div></div><div className="flex gap-2"><button onClick={() => void action('cleanup')} disabled={!!busy} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">إغلاق الجلسات القديمة</button><button onClick={() => void load()} className="rounded-xl border p-2 text-slate-500"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button></div></div><div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-6"><Health label="مسجلون الآن" value={logged.length} icon={<LogIn/>}/><Health label="داخل شيفت" value={open.length} tone="green" icon={<CheckCircle2/>}/><Health label="Login بلا شيفت" value={noShift.length} tone="red" icon={<AlertTriangle/>}/><Health label="Sessions مكررة" value={duplicateSessions.length} tone="amber" icon={<AlertTriangle/>}/><Health label="بطارية منخفضة" value={lowBattery.length} tone={lowBattery.length ? 'amber' : 'green'} icon={<BatteryCharging/>}/><Health label="أوردرات بلا شيفت" value={missingOrders} tone="amber" icon={<AlertTriangle/>}/></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead className="bg-slate-50 text-[10px] font-black text-slate-500"><tr><th className="p-3 text-right">الدليفري</th><th>الحالة</th><th>البطارية</th><th>آخر ظهور</th><th>Sessions</th><th>بداية الشيفت</th><th>أوردرات</th><th>مشاوير</th><th>آخر Login</th><th>آخر أوردر</th><th>إجراء</th></tr></thead><tbody>{rows.map(r => { const b = batteryMap.get(r.rider_id); return <tr key={r.account_id} className="border-t border-slate-50"><td className="p-3"><b>{r.rider_name}</b><p className="text-[10px] text-slate-400">{r.username} · {r.branch_name || '—'}</p></td><td><span className={`rounded-full px-2 py-1 text-[10px] font-black ${r.shift_status === 'shift_open' ? 'bg-emerald-50 text-emerald-700' : r.shift_status === 'no_open_shift' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{r.shift_status === 'shift_open' ? 'داخل شيفت' : r.shift_status === 'no_open_shift' ? 'Login بلا شيفت' : 'غير متصل'}</span></td><td><span title={b?.battery_alert_message || ''} className={`rounded-full px-2 py-1 text-[10px] font-black ${batteryTone(b?.battery_alert_level)}`}>{batteryText(b)}</span></td><td className="text-xs">{b?.last_seen_at ? new Date(b.last_seen_at).toLocaleString('ar-EG') : '—'}</td><td className={Number(r.active_sessions_count) > 1 ? 'font-black text-rose-600' : 'font-black'}>{r.active_sessions_count}</td><td>{r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}</td><td>{r.current_shift_orders || 0}</td><td>{r.current_shift_trips || 0}</td><td className="text-xs">{r.latest_session_at ? new Date(r.latest_session_at).toLocaleString('ar-EG') : '—'}</td><td className="text-xs">{r.last_order_at ? new Date(r.last_order_at).toLocaleString('ar-EG') : '—'}</td><td><div className="flex flex-wrap gap-1">{r.shift_status === 'no_open_shift' && <button onClick={() => void action('open', r.rider_id)} disabled={!!busy} className="rounded-lg bg-teal-600 px-2 py-1 text-[10px] font-black text-white">فتح شيفت</button>}<button onClick={() => void action('cleanup', r.rider_id)} disabled={!!busy} className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black">مزامنة</button>{b && ['low','critical'].includes(String(b.battery_alert_level)) && <button onClick={() => void sendBatteryAlert(r)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2 py-1 text-[10px] font-black text-white"><Send size={11}/> شحن</button>}</div></td></tr> })}</tbody></table>{!loading && !rows.length && <p className="py-8 text-center text-xs font-bold text-slate-400">طبّق Migration 57 لإظهار صحة التشغيل</p>}</div></section>
}

function Health({ label, value, icon, tone = 'slate' }: { label: string; value: number; icon: React.ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' }) { const cls = { slate: 'bg-slate-50 text-slate-600', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-rose-50 text-rose-700' }[tone]; return <div className={`rounded-2xl p-3 ${cls}`}><div className="flex items-center gap-2 text-[10px] font-black">{icon}{label}</div><p className="mt-2 text-2xl font-black">{value}</p></div> }
