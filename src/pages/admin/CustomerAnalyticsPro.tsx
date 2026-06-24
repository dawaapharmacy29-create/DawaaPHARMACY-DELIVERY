import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { displayBranchName } from '../../lib/branchUtils'
import { monthRange, orderAmount, orderCustomerKey } from '../../lib/deliveryAnalytics'

type OrderRow = Record<string, any>
type CustomerRow = { key: string; code: string; name: string; phone: string; branch: string; invoices: number; sales: number; avg: number; last: string; activeDays: number; prevInvoices: number; prevSales: number; prev2Invoices: number; segment: string; needsContact: boolean; reason: string }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function money(v: number) { return Number(v || 0).toLocaleString('ar-EG', { maximumFractionDigits: 0 }) }
function dateOf(o: any) { return String(o.work_date || o.delivery_date || o.registered_at || o.created_at || '').slice(0, 10) }
function addMonths(month: string, delta: number) { const [y,m] = month.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function wa(phone: string) { const p = String(phone || '').replace(/\D/g, ''); if (!p) return '#'; return `https://wa.me/${p.startsWith('2') ? p : `2${p}`}?text=${encodeURIComponent('أهلاً بحضرتك يا فندم\nمع حضرتك صيدليات دواء\nنتشرف بخدمة حضرتك دائمًا')}` }
function classify(invoices: number, days: number, sales: number, prev: number) { if (invoices >= 20 || days >= 10) return 'يومي'; if (sales >= 8000 || invoices >= 5) return 'VIP'; if (invoices >= 4) return 'أسبوعي'; if (invoices >= 1) return 'شهري'; if (prev > 0) return 'متوقف'; return 'غير نشط' }

export default function CustomerAnalyticsPro() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [month, setMonth] = useState(params.get('month') || currentMonth())
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [prevOrders, setPrevOrders] = useState<OrderRow[]>([])
  const [prev2Orders, setPrev2Orders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(params.get('filter') || 'all')

  async function load() {
    setLoading(true)
    try {
      const r0 = monthRange(month), r1 = monthRange(addMonths(month, -1)), r2 = monthRange(addMonths(month, -2))
      const [a,b,c] = await Promise.all([
        supabase.from('delivery_orders').select('*').gte('work_date', r0.start).lte('work_date', r0.end).limit(20000),
        supabase.from('delivery_orders').select('*').gte('work_date', r1.start).lte('work_date', r1.end).limit(20000),
        supabase.from('delivery_orders').select('*').gte('work_date', r2.start).lte('work_date', r2.end).limit(20000),
      ])
      if (a.error) throw a.error
      setOrders(a.data || []); setPrevOrders(b.data || []); setPrev2Orders(c.data || [])
    } catch (e: any) { toast.error(e?.message || 'فشل تحميل تحليل العملاء') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [month])
  useEffect(() => { const n = new URLSearchParams(); n.set('month', month); if (filter !== 'all') n.set('filter', filter); setParams(n, { replace: true }) }, [month, filter, setParams])

  const rows = useMemo<CustomerRow[]>(() => {
    const prev = new Map<string, { invoices: number; sales: number }>()
    const prev2 = new Map<string, { invoices: number }>()
    prevOrders.forEach(o => { const k = orderCustomerKey(o); const p = prev.get(k) || { invoices: 0, sales: 0 }; p.invoices++; p.sales += orderAmount(o); prev.set(k, p) })
    prev2Orders.forEach(o => { const k = orderCustomerKey(o); const p = prev2.get(k) || { invoices: 0 }; p.invoices++; prev2.set(k, p) })
    const map = new Map<string, CustomerRow & { daysSet: Set<string> }>()
    orders.forEach(o => {
      const key = orderCustomerKey(o) || String(o.id)
      const old = map.get(key) || { key, code: String(o.customer_code || o.customer_code_snapshot || ''), name: String(o.customer_name || o.customer_name_snapshot || 'عميل غير مسجل'), phone: String(o.customer_phone || o.customer_phone_snapshot || ''), branch: displayBranchName(o.branch_name || o.branch || ''), invoices: 0, sales: 0, avg: 0, last: '', activeDays: 0, prevInvoices: prev.get(key)?.invoices || 0, prevSales: prev.get(key)?.sales || 0, prev2Invoices: prev2.get(key)?.invoices || 0, segment: 'شهري', needsContact: false, reason: '', daysSet: new Set<string>() }
      old.invoices++; old.sales += orderAmount(o); old.avg = old.sales / old.invoices
      const d = dateOf(o); if (d) { old.daysSet.add(d); if (!old.last || d > old.last) old.last = d }
      map.set(key, old)
    })
    return Array.from(map.values()).map(r => { const activeDays = r.daysSet.size; const segment = classify(r.invoices, activeDays, r.sales, r.prevInvoices); const dropped = r.prevInvoices >= 5 && r.invoices <= Math.floor(r.prevInvoices * 0.6); return { ...r, activeDays, segment, needsContact: dropped || (r.prev2Invoices < r.prevInvoices && r.invoices < r.prevInvoices), reason: dropped ? `انخفاض واضح: الشهر السابق ${r.prevInvoices} طلب، الحالي ${r.invoices}` : r.invoices > r.prevInvoices ? 'نشاط متزايد' : '' } }).sort((a,b) => b.sales - a.sales)
  }, [orders, prevOrders, prev2Orders])

  const daily = useMemo(() => { const map = new Map<string, number>(); orders.forEach(o => { const d = dateOf(o); if (d) map.set(d, (map.get(d)||0)+1) }); return Array.from(map.entries()).sort().map(([date,count]) => ({ date, count })) }, [orders])
  const branches = useMemo(() => { const map = new Map<string, { customers: Set<string>; sales: number; invoices: number }>(); orders.forEach(o => { const b = displayBranchName(o.branch_name || o.branch || 'غير محدد'); const row = map.get(b) || { customers: new Set(), sales: 0, invoices: 0 }; row.customers.add(orderCustomerKey(o)); row.sales += orderAmount(o); row.invoices++; map.set(b,row) }); return Array.from(map.entries()).map(([branch,v]) => ({ branch, customers: v.customers.size, sales: v.sales, invoices: v.invoices })).sort((a,b)=>b.sales-a.sales) }, [orders])
  const filtered = rows.filter(r => {
    const q = search.trim().toLowerCase()
    const f = filter === 'all' || (filter === 'vip' && r.segment === 'VIP') || (filter === 'daily' && r.segment === 'يومي') || (filter === 'weekly' && r.segment === 'أسبوعي') || (filter === 'monthly' && r.segment === 'شهري') || (filter === 'needs_contact' && r.needsContact) || (filter === 'repeat' && r.invoices >= 2) || (filter === 'one' && r.invoices === 1)
    const s = !q || [r.code,r.name,r.phone,r.branch,r.segment].some(v => String(v).toLowerCase().includes(q))
    return f && s
  })
  const stats = { invoices: orders.length, active: rows.length, sales: rows.reduce((s,r)=>s+r.sales,0), vip: rows.filter(r=>r.segment==='VIP').length, daily: rows.filter(r=>r.segment==='يومي').length, weekly: rows.filter(r=>r.segment==='أسبوعي').length, needs: rows.filter(r=>r.needsContact).length, repeat: rows.filter(r=>r.invoices>=2).length }
  const maxDaily = Math.max(...daily.map(d=>d.count), 1), maxBranch = Math.max(...branches.map(b=>b.sales), 1)
  const metric = (label:string,value:any,f:string) => <button onClick={()=>setFilter(f)} className="rounded-3xl border bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-[#061827]">{value}</p><p className="mt-1 text-[11px] font-black text-slate-400">اضغط للتفاصيل</p></button>
  return <div className="space-y-5 text-right" dir="rtl"><header className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border bg-white p-4 shadow-sm"><div><button onClick={()=>navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600"><ArrowRight size={16}/> رجوع</button><h1 className="text-3xl font-black text-[#061827]">تحليل العملاء الشهري المتقدم</h1><p className="text-sm font-bold text-slate-500">مقارنة نشاط العملاء، الفروع، وترشيحات التواصل.</p></div><div className="flex gap-2"><input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="rounded-2xl border bg-slate-50 px-4 py-3 font-black"/><button onClick={load} className="rounded-3xl bg-[#008E92] px-5 py-3 font-black text-white"><RefreshCw size={18} className={loading?'inline animate-spin':'inline'}/> تحديث</button></div></header>
    <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">{metric('فواتير الشهر', stats.invoices, 'all')}{metric('عملاء نشطين', stats.active, 'all')}{metric('إجمالي المبيعات', money(stats.sales), 'all')}{metric('VIP', stats.vip, 'vip')}{metric('يومي', stats.daily, 'daily')}{metric('أسبوعي', stats.weekly, 'weekly')}{metric('متكررون', stats.repeat, 'repeat')}{metric('يحتاج تواصل', stats.needs, 'needs_contact')}</section>
    <section className="grid gap-4 xl:grid-cols-2"><div className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-black">حركة الفواتير اليومية</h2><div className="flex h-52 items-end gap-1 overflow-x-auto">{daily.map(d=><div key={d.date} className="flex min-w-8 flex-col items-center gap-1"><div className="w-5 rounded-t bg-[#008E92]" style={{height:`${Math.max(4,(d.count/maxDaily)*180)}px`}}/><span className="text-[10px] font-bold text-slate-400">{d.date.slice(8)}</span></div>)}</div></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-black">الفروع حسب العملاء والمبيعات</h2><div className="space-y-3">{branches.map(b=><button key={b.branch} onClick={()=>navigate(`/admin/reconciliation?branch=${encodeURIComponent(b.branch)}`)} className="w-full text-right"><div className="mb-1 flex justify-between text-xs font-black"><span>{b.branch}</span><span>{b.customers} عميل — {money(b.sales)} ج</span></div><div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-emerald-500" style={{width:`${Math.max(3,(b.sales/maxBranch)*100)}%`}}/></div></button>)}</div></div></section>
    <div className="rounded-3xl border bg-white p-4 shadow-sm"><div className="relative"><Search className="absolute right-4 top-3 text-slate-400" size={20}/><input value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-2xl border bg-slate-50 py-3 pr-12 font-bold outline-none" placeholder="بحث بالكود / الاسم / الهاتف / الفرع"/></div><div className="mt-3 flex flex-wrap gap-2">{[['all','الكل'],['vip','VIP'],['daily','يومي'],['weekly','أسبوعي'],['monthly','شهري'],['repeat','متكرر'],['one','مرة واحدة'],['needs_contact','يحتاج تواصل']].map(([k,l])=><button key={k} onClick={()=>setFilter(k)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter===k?'bg-[#008E92] text-white':'bg-slate-100 text-slate-600'}`}>{l}</button>)}</div></div>
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-4 font-black text-slate-700">العملاء — {filtered.length}</div><div className="max-h-[70vh] overflow-auto"><table className="w-full min-w-[1300px] text-sm"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">الكود</th><th>العميل</th><th>الهاتف</th><th>الفرع</th><th>فواتير الشهر</th><th>أيام النشاط</th><th>قيمة الشهر</th><th>الشهر السابق</th><th>قبل السابق</th><th>آخر طلب</th><th>تصنيف</th><th>توصية</th><th>واتساب</th></tr></thead><tbody>{filtered.map(r=><tr key={r.key} className="border-t"><td className="p-3 font-black">{r.code||'—'}</td><td className="p-3 font-black">{r.name}</td><td>{r.phone||'—'}</td><td>{r.branch||'—'}</td><td className="font-black text-sky-700">{r.invoices}</td><td>{r.activeDays}</td><td className="font-black text-emerald-700">{money(r.sales)}</td><td>{r.prevInvoices}</td><td>{r.prev2Invoices}</td><td>{r.last}</td><td><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{r.segment}</span></td><td className={r.needsContact?'font-black text-rose-700':'text-slate-400'}>{r.needsContact ? r.reason : r.reason || '—'}</td><td>{r.phone ? <a href={wa(r.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">واتساب <ExternalLink size={12}/></a> : '—'}</td></tr>)}</tbody></table></div></div>
  </div>
}
