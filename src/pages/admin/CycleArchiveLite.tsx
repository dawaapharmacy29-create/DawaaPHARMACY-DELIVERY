import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatMoney } from '../../lib/helpers'
import { getCycleOptions } from '../../components/CycleSelector'

export default function CycleArchiveLite() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    const cycles = getCycleOptions(12)
    const result = await Promise.all(cycles.map(async cycle => {
      const { data: orders } = await supabase.from('delivery_orders').select('id,status,invoice_amount,order_multiplier,is_duplicate_invoice,bconnect_match_status,final_count_status,is_countable,deleted_at').gte('delivery_date', cycle.start).lte('delivery_date', cycle.end)
      const { data: trips } = await supabase.from('internal_trips').select('id,status').gte('trip_date', cycle.start).lte('trip_date', cycle.end)
      const list = orders || []
      const active = list.filter((o:any) => !o.deleted_at)
      const counted = active.filter((o:any) => o.is_countable === true || String(o.final_count_status || '').startsWith('counted'))
      const failed = active.filter((o:any) => String(o.status || '').includes('failed'))
      const duplicate = active.filter((o:any) => o.is_duplicate_invoice)
      const notFound = active.filter((o:any) => o.bconnect_match_status === 'invoice_not_found')
      const multiplier = active.filter((o:any) => Number(o.order_multiplier || 1) >= 1.5)
      return { ...cycle, total: active.length, counted: counted.length, failed: failed.length, duplicate: duplicate.length, notFound: notFound.length, multiplier: multiplier.length, trips: (trips || []).length, sales: counted.reduce((s:any, o:any) => s + Number(o.invoice_amount || 0), 0), risk: failed.length + duplicate.length + notFound.length }
    }))
    setRows(result)
    setLoading(false)
  }

  return <div className="min-h-screen bg-[#F3F7F8] p-4" dir="rtl">
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="rounded-3xl bg-gradient-to-l from-[#061827] to-[#008E92] p-5 text-white">
        <h1 className="text-2xl font-black">أرشيف الدورات</h1>
        <p className="mt-1 text-sm font-bold text-white/80">آخر 12 دورة تشغيل ومحاسبة للدليفري من 26 إلى 25.</p>
      </header>
      {loading ? <div className="rounded-3xl bg-white p-8 text-center font-black text-slate-500">جاري تحميل الدورات...</div> : <div className="overflow-x-auto rounded-3xl bg-white p-4 shadow-sm"><table className="w-full min-w-[1000px] text-right text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-3">الدورة</th><th className="p-3">الأوردرات</th><th className="p-3">المحتسب</th><th className="p-3">×1.5</th><th className="p-3">فاشل</th><th className="p-3">مكرر</th><th className="p-3">غير موجود</th><th className="p-3">مشاوير</th><th className="p-3">مبيعات محتسبة</th><th className="p-3">مخاطر</th><th className="p-3">فتح</th></tr></thead><tbody>{rows.map(row => <tr key={row.key} className="border-t"><td className="p-3 font-black">{row.start} إلى {row.end}</td><td className="p-3">{row.total}</td><td className="p-3 text-emerald-700 font-black">{row.counted}</td><td className="p-3">{row.multiplier}</td><td className="p-3 text-rose-700">{row.failed}</td><td className="p-3 text-amber-700">{row.duplicate}</td><td className="p-3 text-rose-700">{row.notFound}</td><td className="p-3">{row.trips}</td><td className="p-3">{formatMoney(row.sales)}</td><td className="p-3 font-black">{row.risk}</td><td className="p-3"><button onClick={() => navigate(`/admin/reconciliation?from=${row.start}&to=${row.end}`)} className="rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white">فتح الدورة</button></td></tr>)}</tbody></table></div>}
    </div>
  </div>
}
