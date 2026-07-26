import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw, Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getOperationalPeriod, wildcardMatchText } from '../lib/helpers'

type MismatchRow = {
  id: string
  invoice_number: string | null
  rider_name: string | null
  app_customer_name: string | null
  system_customer_name: string | null
  app_branch_name: string | null
  system_branch_name: string | null
  app_amount: number | null
  system_amount: number | null
  app_order_id: string | null
}

export default function CustomerNameMismatchPanel() {
  const [params, setParams] = useSearchParams()
  const defaultPeriod = useMemo(() => getOperationalPeriod(), [])
  const from = params.get('from') || defaultPeriod.start
  const to = params.get('to') || defaultPeriod.end
  const [rows, setRows] = useState<MismatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('monthly_invoice_reconciliation_results')
        .select('id,invoice_number,rider_name,app_customer_name,system_customer_name,app_branch_name,system_branch_name,app_amount,system_amount,app_order_id')
        .eq('period_start', from)
        .eq('period_end', to)
        .eq('match_status', 'matched_customer_name_mismatch')
        .order('invoice_number', { ascending: true })
        .limit(500)
      if (error) throw error
      setRows((data || []) as MismatchRow[])
    } catch (error) {
      console.error('Failed to load customer name mismatches', error)
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [from, to])

  const filtered = rows.filter(row => {
    if (!search.trim()) return true
    return [row.invoice_number, row.rider_name, row.app_customer_name, row.system_customer_name, row.app_branch_name, row.system_branch_name]
      .some(value => wildcardMatchText(String(value || ''), search))
  })

  function showInMainList() {
    const next = new URLSearchParams(params)
    next.set('filter', 'customer_mismatch')
    next.set('from', from)
    next.set('to', to)
    setParams(next)
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
  }

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-amber-200 bg-amber-50 shadow-sm" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="rounded-2xl bg-amber-500 p-3 text-white"><AlertTriangle size={22} /></span>
          <div>
            <h2 className="font-black text-amber-950">فواتير رقمها مطابق واسم العميل مختلف</h2>
            <p className="text-sm font-bold text-amber-800">تُحتسب للمندوب لأن رقم الفاتورة صحيح، وتظهر هنا فقط لمراجعة احتمال خطأ اسم العميل.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-4 py-2 text-sm font-black text-amber-900">{rows.length} فاتورة</span>
          <button onClick={() => void load()} disabled={loading} className="rounded-2xl bg-white p-3 text-amber-900 disabled:opacity-50" title="تحديث"><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setOpen(value => !value)} className="rounded-2xl bg-amber-900 px-4 py-2 text-sm font-black text-white">{open ? 'إخفاء' : 'عرض'}</button>
        </div>
      </div>

      {open && (
        <div className="border-t border-amber-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={18} className="text-slate-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث برقم الفاتورة أو اسم العميل أو المندوب" className="w-full bg-transparent text-sm font-bold outline-none" />
            </label>
            <button onClick={showInMainList} className="rounded-2xl bg-[#008E92] px-4 py-2 text-sm font-black text-white">عرضها في قائمة الأوردرات</button>
          </div>

          {!loading && filtered.length === 0 && <div className="rounded-2xl bg-emerald-50 p-4 text-center font-black text-emerald-700">لا توجد اختلافات أسماء في الدورة المختارة.</div>}
          {filtered.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[850px] text-sm">
                <thead className="sticky top-0 bg-slate-900 text-white"><tr><th className="p-3">الفاتورة</th><th className="p-3">المندوب</th><th className="p-3">اسم التطبيق</th><th className="p-3">اسم السيستم</th><th className="p-3">الفرع</th><th className="p-3">القيمة</th></tr></thead>
                <tbody>
                  {filtered.map(row => <tr key={row.id} className="border-t border-slate-100 text-center">
                    <td className="p-3 font-black">{row.invoice_number || '—'}</td>
                    <td className="p-3">{row.rider_name || '—'}</td>
                    <td className="p-3 font-bold text-rose-700">{row.app_customer_name || '—'}</td>
                    <td className="p-3 font-bold text-emerald-700">{row.system_customer_name || '—'}</td>
                    <td className="p-3">{row.app_branch_name || row.system_branch_name || '—'}</td>
                    <td className="p-3">{Number(row.system_amount ?? row.app_amount ?? 0).toLocaleString('en-US')} ج.م</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
