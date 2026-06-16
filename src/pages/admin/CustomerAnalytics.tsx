import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, RefreshCw, Search, Star, TrendingDown, Users } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'

type CustomerAnalyticsRow = {
  customer_id: string
  customer_code: string | null
  customer_name: string | null
  phone: string | null
  branch_name: string | null
  total_orders: number | null
  matched_orders: number | null
  rejected_orders: number | null
  last_delivery_order_at: string | null
  last_invoice_date: string | null
  total_sales: number | null
  invoices_count: number | null
  average_invoice: number | null
  days_since_last_invoice: number | null
  delivery_problem_count: number | null
  customer_segment: string | null
  risk_level: string | null
}

const SEGMENT_LABELS: Record<string, string> = {
  vip: 'VIP', active: 'نشط', declining: 'منخفض', at_risk: 'قابل للتوقف', stopped: 'متوقف', new: 'جديد', delivery_problem: 'مشاكل توصيل'
}

export default function CustomerAnalytics() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<CustomerAnalyticsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    try {
      setLoading(true)
      const { data, error } = await supabase.from('customer_delivery_analytics').select('*').order('total_sales', { ascending: false }).limit(500)
      if (error) throw error
      setRows((data || []) as CustomerAnalyticsRow[])
    } catch (e: any) {
      toast.error(`تعذر تحميل تحليل العملاء: ${e?.message || e}`)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => [r.customer_code, r.customer_name, r.phone, r.branch_name, r.customer_segment].some(v => String(v || '').toLowerCase().includes(q)))
  }, [rows, search])

  const stats = useMemo(() => ({
    total: rows.length,
    vip: rows.filter(r => r.customer_segment === 'vip').length,
    stopped: rows.filter(r => r.customer_segment === 'stopped' || r.risk_level === 'high').length,
    problems: rows.filter(r => Number(r.delivery_problem_count || 0) > 0).length,
  }), [rows])

  return (
    <div className="min-h-screen bg-[#F3F7F8] p-4 text-right" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-600 shadow-sm"><ArrowRight size={16}/> رجوع</button>
            <h1 className="text-3xl font-black text-[#061827]">تحليل العملاء من التوصيل</h1>
            <p className="mt-1 text-sm font-bold text-slate-500">تقسيم العملاء حسب النشاط، القيمة، مشاكل التوصيل، وآخر شراء.</p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-2 rounded-3xl bg-white px-5 py-3 font-black text-slate-700 shadow-sm"><RefreshCw size={18}/> تحديث</button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Metric label="إجمالي العملاء" value={stats.total} icon={<Users/>}/>
          <Metric label="VIP" value={stats.vip} icon={<Star/>}/>
          <Metric label="متوقف/خطر" value={stats.stopped} icon={<TrendingDown/>}/>
          <Metric label="مشاكل توصيل" value={stats.problems} icon={<Users/>}/>
        </div>

        <div className="rounded-3xl border bg-white p-4 shadow-sm">
          <div className="relative"><Search className="absolute right-4 top-3 text-slate-400" size={20}/><input value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded-2xl border bg-slate-50 py-3 pr-12 font-bold outline-none focus:border-emerald-400" placeholder="بحث بالكود / الاسم / التليفون / الفرع / التصنيف" /></div>
        </div>

        <div className="overflow-hidden rounded-3xl border bg-white shadow-sm">
          <div className="border-b p-4 font-black text-slate-700">قائمة العملاء التحليلية {loading ? '— جاري التحميل...' : `— ${filtered.length} عميل`}</div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">العميل</th><th className="p-3">الفرع</th><th className="p-3">إجمالي مشتريات</th><th className="p-3">فواتير</th><th className="p-3">أوردرات توصيل</th><th className="p-3">مطابقة</th><th className="p-3">مشاكل</th><th className="p-3">آخر شراء</th><th className="p-3">تصنيف</th><th className="p-3">خطر</th></tr></thead>
              <tbody>{filtered.map(r => <tr key={r.customer_id} className="border-t align-top"><td className="p-3"><p className="font-black text-[#061827]">{r.customer_name || '—'}</p><p className="text-xs font-bold text-slate-400">{r.customer_code || '—'} · {r.phone || '—'}</p></td><td className="p-3">{r.branch_name || '—'}</td><td className="p-3 font-black">{Number(r.total_sales || 0).toLocaleString('ar-EG')}</td><td className="p-3">{r.invoices_count || 0}</td><td className="p-3">{r.total_orders || 0}</td><td className="p-3">{r.matched_orders || 0}</td><td className="p-3">{r.delivery_problem_count || 0}</td><td className="p-3">{r.last_invoice_date || '—'}<p className="text-xs text-slate-400">{r.days_since_last_invoice ?? '—'} يوم</p></td><td className="p-3"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{SEGMENT_LABELS[String(r.customer_segment || '')] || r.customer_segment || '—'}</span></td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${r.risk_level === 'high' ? 'bg-rose-50 text-rose-700' : r.risk_level === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'}`}>{r.risk_level || 'low'}</span></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-3xl border bg-white p-5 shadow-sm"><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">{icon}</div><p className="text-sm font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-[#061827]">{value}</p></div>
}
