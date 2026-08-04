import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Smartphone, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { APP_VERSION } from '../lib/appVersion'
import EmptyState from './ui/EmptyState'
import Badge from './ui/Badge'

type Row = {
  rider_id: string
  rider_name?: string | null
  branch_name?: string | null
  last_seen_at?: string | null
  device_label?: string | null
  device_user_agent?: string | null
  platform?: string | null
  app_version?: string | null
}

function ageText(value?: string | null) {
  if (!value) return 'لا يوجد ظهور'
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'الآن'
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  return `منذ ${Math.round(minutes / 60)} ساعة`
}

export default function RiderAppVersionStatus() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('rider_device_status')
        .select('*')
        .order('last_seen_at', { ascending: false })
        .limit(80)
      if (error) throw error
      setRows((data || []) as Row[])
    } catch (error) {
      console.warn('rider app version status unavailable', error)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const summary = useMemo(() => {
    const unknown = rows.filter(row => !row.app_version).length
    const old = rows.filter(row => row.app_version && row.app_version !== APP_VERSION).length
    return { unknown, old, ok: rows.length - unknown - old }
  }, [rows])

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm" dir="rtl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Smartphone size={20} /></span>
          <div>
            <h2 className="font-black text-[#102a32]">نسخ تطبيق الدليفري</h2>
            <p className="text-xs font-bold text-slate-400">النسخة الحالية: {APP_VERSION}</p>
          </div>
        </div>
        <button onClick={() => void load()} className="rounded-2xl bg-slate-100 p-2 text-slate-600">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs font-black">
        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">{summary.ok}<br />محدث</div>
        <div className="rounded-2xl bg-amber-50 p-3 text-amber-700">{summary.unknown}<br />غير معروف</div>
        <div className="rounded-2xl bg-rose-50 p-3 text-rose-700">{summary.old}<br />قديم</div>
      </div>

      <div className="max-h-[360px] space-y-2 overflow-auto">
        {rows.length === 0 ? (
          <EmptyState title="لا توجد بيانات أجهزة حتى الآن" />
        ) : rows.map(row => {
          const status = !row.app_version ? 'unknown' : row.app_version === APP_VERSION ? 'ok' : 'old'
          return (
            <article key={row.rider_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <b className="block truncate text-sm text-[#102a32]">{row.rider_name || 'دليفري غير محدد'}</b>
                  <p className="mt-1 truncate text-[11px] font-bold text-slate-400">{row.branch_name || '—'} · {ageText(row.last_seen_at)}</p>
                  <p className="mt-1 truncate text-[11px] font-bold text-slate-400">{row.device_label || row.platform || row.device_user_agent || 'جهاز غير معروف'}</p>
                </div>
                <Badge tone={status === 'ok' ? 'success' : status === 'old' ? 'danger' : 'warning'}>{row.app_version || 'غير معروفة'}</Badge>
              </div>
              {status !== 'ok' && <p className="mt-2 flex items-center gap-1 text-[11px] font-black text-amber-700"><AlertTriangle size={13} /> يحتاج فتح التطبيق بعد التحديث أو تحديث النسخة.</p>}
            </article>
          )
        })}
      </div>
    </section>
  )
}
