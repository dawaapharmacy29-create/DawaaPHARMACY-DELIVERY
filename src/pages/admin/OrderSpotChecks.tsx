import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, RefreshCw, ShieldAlert, Shuffle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { getRiderSession } from '../../lib/auth'
import OperationsAdminTabs from '../../components/OperationsAdminTabs'

// Weekly random review of orders that were approved automatically because their invoice matched
// (orders without a shift and x1.5 orders). Every Saturday up to 5 orders per rider are picked from
// the previous week. "فيها مشكلة" sends the order back to review, out of payroll, until it is decided.

type SpotCheck = {
  id: string
  rider_id: string
  rider_name: string | null
  branch_name: string | null
  order_id: string
  invoice_number: string | null
  delivery_date: string | null
  customer_name: string | null
  customer_code: string | null
  invoice_value: number | null
  order_multiplier: number | null
  status: string | null
  pick_reason: string
  result: 'pending' | 'ok' | 'issue'
  note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
}

const REASON_LABELS: Record<string, string> = {
  x1_5: 'أوردر ×1.5',
  no_shift: 'من غير شيفت',
  name_mismatch: 'اسم العميل مختلف',
  random: 'عشوائي',
}

const RESULT_LABELS: Record<SpotCheck['result'], string> = {
  pending: 'لسه',
  ok: 'سليم',
  issue: 'فيها مشكلة',
}

function weekLabel(start: string | null) {
  if (!start) return ''
  const d = new Date(`${start}T00:00:00`)
  const e = new Date(d)
  e.setDate(e.getDate() + 6)
  const f = (x: Date) => x.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric' })
  return `${f(d)} – ${f(e)}`
}

export default function OrderSpotChecks() {
  const [week, setWeek] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<string[]>([])
  const [rows, setRows] = useState<SpotCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<'all' | 'pending' | 'issue'>('pending')

  const load = useCallback(async (w: string | null) => {
    setLoading(true)
    const { data, error } = await supabase.rpc('admin_order_spot_checks_v1', {
      p_token: getRiderSession().session_token || '',
      p_week_start: w,
    })
    setLoading(false)
    if (error) {
      toast.error(error.message.includes('not_authorized') ? 'الصفحة دي للمدير العام بس' : 'تعذر تحميل المراجعة')
      return
    }
    setWeek(data?.week_start ?? null)
    setWeeks(Array.isArray(data?.weeks) ? data.weeks : [])
    setRows(Array.isArray(data?.rows) ? data.rows : [])
  }, [])

  useEffect(() => { void load(null) }, [load])

  async function decide(row: SpotCheck, result: 'ok' | 'issue') {
    const note = (notes[row.id] || '').trim()
    if (result === 'issue' && note.length < 3) {
      toast.error('اكتب المشكلة في الملاحظة الأول')
      return
    }
    setBusyId(row.id)
    const session = getRiderSession()
    const { error } = await supabase.rpc('admin_decide_order_spot_check_v1', {
      p_token: session.session_token || '',
      p_id: row.id,
      p_result: result,
      p_note: note || null,
      p_reviewer: session.rider_name || session.username || null,
    })
    setBusyId(null)
    if (error) {
      toast.error('تعذر حفظ القرار')
      return
    }
    toast.success(result === 'ok' ? 'اتسجل إنه سليم' : 'الأوردر رجع للمراجعة وطلع من الحساب لحد ما تقرر')
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, result, note: note || null, reviewed_at: new Date().toISOString() } : r))
  }

  const byRider = useMemo(() => {
    const visible = rows.filter(r => filter === 'all' || r.result === filter)
    const groups = new Map<string, { name: string; branch: string; items: SpotCheck[] }>()
    for (const r of visible) {
      const g = groups.get(r.rider_id) || { name: r.rider_name || '—', branch: r.branch_name || '', items: [] }
      g.items.push(r)
      groups.set(r.rider_id, g)
    }
    return [...groups.values()]
  }, [rows, filter])

  const totals = useMemo(() => ({
    all: rows.length,
    pending: rows.filter(r => r.result === 'pending').length,
    ok: rows.filter(r => r.result === 'ok').length,
    issue: rows.filter(r => r.result === 'issue').length,
  }), [rows])

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <OperationsAdminTabs />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-black text-slate-800"><Shuffle size={18} /> المراجعة الأسبوعية العشوائية</h1>
            <p className="mt-1 text-xs text-slate-500">
              أوردرات اتعمدت لوحدها علشان فاتورتها مطابقة (من غير شيفت أو ×1.5). كل سبت بيتسحب لحد ٥ أوردرات لكل طيار من الأسبوع اللي فات.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={week || ''}
              onChange={e => void load(e.target.value || null)}
            >
              {weeks.length === 0 && <option value="">مفيش أسابيع لسه</option>}
              {weeks.map(w => <option key={w} value={w}>أسبوع {weekLabel(w)}</option>)}
            </select>
            <button className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" onClick={() => void load(week)} title="تحديث">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
          {([['pending', `لسه (${totals.pending})`], ['issue', `فيها مشكلة (${totals.issue})`], ['all', `الكل (${totals.all})`]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-xl px-3 py-1.5 ${filter === k ? 'bg-[#008E92] text-white' : 'bg-slate-50 text-slate-600'}`}
            >{label}</button>
          ))}
          <span className="rounded-xl bg-emerald-50 px-3 py-1.5 text-emerald-700">سليم: {totals.ok}</span>
        </div>
      </div>

      {loading && <div className="p-6 text-center text-sm text-slate-500">جاري التحميل…</div>}
      {!loading && byRider.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          {totals.all === 0 ? 'مفيش أوردرات متسحبة للأسبوع ده.' : 'خلصت كل الأوردرات في الفلتر ده.'}
        </div>
      )}

      {byRider.map(group => (
        <div key={group.name + group.branch} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="font-black text-slate-800">{group.name}</div>
            <div className="text-xs text-slate-500">{group.branch}</div>
          </div>
          <div className="divide-y divide-slate-100">
            {group.items.map(row => (
              <div key={row.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black">فاتورة {row.invoice_number || '—'}</span>
                    <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{REASON_LABELS[row.pick_reason] || row.pick_reason}</span>
                    {Number(row.order_multiplier) >= 1.5 && <span className="rounded-lg bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">×1.5</span>}
                    <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${row.result === 'ok' ? 'bg-emerald-50 text-emerald-700' : row.result === 'issue' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{RESULT_LABELS[row.result]}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {row.delivery_date} · {row.customer_name || '—'} {row.customer_code ? `(${row.customer_code})` : ''} · {Number(row.invoice_value || 0).toLocaleString('ar-EG')} ج
                  </div>
                  {row.note && row.result !== 'pending' && <div className="text-xs text-slate-600">ملاحظة: {row.note}</div>}
                </div>
                {row.result === 'pending' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="w-48 rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
                      placeholder="ملاحظة (لازم لو فيه مشكلة)"
                      value={notes[row.id] || ''}
                      onChange={e => setNotes(prev => ({ ...prev, [row.id]: e.target.value }))}
                    />
                    <button
                      disabled={busyId === row.id}
                      onClick={() => void decide(row, 'ok')}
                      className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                    ><CheckCircle2 size={14} /> سليم</button>
                    <button
                      disabled={busyId === row.id}
                      onClick={() => void decide(row, 'issue')}
                      className="flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
                    ><ShieldAlert size={14} /> فيها مشكلة</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
