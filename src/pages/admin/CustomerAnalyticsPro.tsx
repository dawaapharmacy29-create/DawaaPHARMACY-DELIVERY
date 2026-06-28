import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ExternalLink, RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { displayBranchName } from '../../lib/branchUtils'
import { monthRange, orderAmount, orderCustomerKey } from '../../lib/deliveryAnalytics'

function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function addMonths(month: string, delta: number) { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function money(value: number) { return Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 0 }) }
function dateOf(order: any) { return String(order.work_date || order.delivery_date || order.registered_at || order.created_at || '').slice(0, 10) }
function wa(phone: string) { const digits = String(phone || '').replace(/\D/g, ''); if (!digits) return '#'; return `https://wa.me/${digits.startsWith('2') ? digits : `2${digits}`}?text=${encodeURIComponent('أهلاً بحضرتك يا فندم\nمع حضرتك صيدليات دواء\nنتشرف بخدمة حضرتك دائمًا')}` }
function classify(invoices: number, days: number, sales: number, prevInvoices: number) { if (invoices >= 20 || days >= 10) return 'يومي'; if (sales >= 8000 || invoices >= 5) return 'VIP'; if (invoices >= 4) return 'أسبوعي'; if (invoices >= 1) return 'شهري'; if (prevInvoices > 0) return 'متوقف'; return 'غير نشط' }

export default function CustomerAnalyticsPro() {
  const navigate = useNavigate()
  const [month, setMonth] = useState(currentMonth())
  const [orders, setOrders] = useState<any[]>([])
  const [previousOrders, setPreviousOrders] = useState<any[]>([])
  const [twoMonthsAgoOrders, setTwoMonthsAgoOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  async function load() {
    setLoading(true)
    try {
      const current = monthRange(month)
      const previous = monthRange(addMonths(month, -1))
      const beforePrevious = monthRange(addMonths(month, -2))
      const [currentResult, previousResult, beforeResult] = await Promise.all([
        supabase.from('delivery_orders').select('*').gte('work_date', current.start).lte('work_date', current.end).limit(20000),
        supabase.from('delivery_orders').select('*').gte('work_date', previous.start).lte('work_date', previous.end).limit(20000),
        supabase.from('delivery_orders').select('*').gte('work_date', beforePrevious.start).lte('work_date', beforePrevious.end).limit(20000),
      ])
      if (currentResult.error) throw currentResult.error
      setOrders(currentResult.data || [])
      setPreviousOrders(previousResult.data || [])
      setTwoMonthsAgoOrders(beforeResult.data || [])
    } catch (error: any) {
      toast.error(error?.message || 'فشل تحميل تحليل العملاء')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [month])

  const rows = useMemo(() => {
    const previousMap = new Map<string, number>()
    const beforeMap = new Map<string, number>()
    previousOrders.forEach(order => { const key = orderCustomerKey(order); previousMap.set(key, (previousMap.get(key) || 0) + 1) })
    twoMonthsAgoOrders.forEach(order => { const key = orderCustomerKey(order); beforeMap.set(key, (beforeMap.get(key) || 0) + 1) })
    const map = new Map<string, any>()
    orders.forEach(order => {
      const key = orderCustomerKey(order) || String(order.id)
      const row = map.get(key) || { key, code: order.customer_code || order.customer_code_snapshot || '', name: order.customer_name || order.customer_name_snapshot || 'عميل غير مسجل', phone: order.customer_phone || order.customer_phone_snapshot || '', branch: displayBranchName(order.branch_name || order.branch || ''), invoices: 0, sales: 0, last: '', days: new Set<string>() }
      row.invoices += 1
      row.sales += orderAmount(order)
      const day = dateOf(order)
      if (day) { row.days.add(day); if (!row.last || day > row.last) row.last = day }
      map.set(key, row)
    })
    return Array.from(map.values()).map(row => {
      const prev = previousMap.get(row.key) || 0
      const before = beforeMap.get(row.key) || 0
      const activeDays = row.days.size
      const segment = classify(row.invoices, activeDays, row.sales, prev)
      const needsContact = prev >= 5 && row.invoices <= Math.floor(prev * 0.6)
      return { ...row, activeDays, previousInvoices: prev, beforePreviousInvoices: before, segment, needsContact, reason: needsContact ? `انخفاض واضح: الشهر السابق ${prev} طلب، الحالي ${row.invoices}` : '' }
    }).sort((a, b) => b.sales - a.sales)
  }, [orders, previousOrders, twoMonthsAgoOrders])

  const daily = useMemo(() => { const map = new Map<string, number>(); orders.forEach(order => { const day = dateOf(order); if (day) map.set(day, (map.get(day) || 0) + 1) }); return Array.from(map.entries()).sort().map(([date, count]) => ({ date, count })) }, [orders])
  const branches = useMemo(() => { const map = new Map<string, { customers: Set<string>; sales: number }>(); orders.forEach(order => { const branch = displayBranchName(order.branch_name || order.branch || 'غير محدد'); const row = map.get(branch) || { customers: new Set<string>(), sales: 0 }; row.customers.add(orderCustomerKey(order)); row.sales += orderAmount(order); map.set(branch, row) }); return Array.from(map.entries()).map(([branch, value]) => ({ branch, customers: value.customers.size, sales: value.sales })).sort((a, b) => b.sales - a.sales) }, [orders])
  const filtered = rows.filter(row => {
    const matchesFilter = filter === 'all' || (filter === 'vip' && row.segment === 'VIP') || (filter === 'daily' && row.segment === 'يومي') || (filter === 'weekly' && row.segment === 'أسبوعي') || (filter === 'monthly' && row.segment === 'شهري') || (filter === 'repeat' && row.invoices >= 2) || (filter === 'one' && row.invoices === 1) || (filter === 'needs_contact' && row.needsContact)
    const q = search.trim().toLowerCase()
    const matchesSearch = !q || [row.code, row.name, row.phone, row.branch, row.segment].some(value => String(value || '').toLowerCase().includes(q))
    return matchesFilter && matchesSearch
  })
  const maxDaily = Math.max(...daily.map(item => item.count), 1)
  const maxBranch = Math.max(...branches.map(item => item.sales), 1)
  const stats = { invoices: orders.length, active: rows.length, sales: rows.reduce((sum, row) => sum + row.sales, 0), vip: rows.filter(row => row.segment === 'VIP').length, daily: rows.filter(row => row.segment === 'يومي').length, weekly: rows.filter(row => row.segment === 'أسبوعي').length, repeat: rows.filter(row => row.invoices >= 2).length, needs: rows.filter(row => row.needsContact).length }
  const metric = (label: string, value: string | number, nextFilter: string) => <button type="button" onClick={() => setFilter(nextFilter)} className="rounded-3xl border bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><p className="text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-[#061827]">{value}</p><p className="mt-1 text-[11px] font-black text-slate-400">اضغط للتفاصيل</p></button>

  return <div className="space-y-5 text-right" dir="rtl"><header className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border bg-white p-4 shadow-sm"><div><button type="button" onClick={() => navigate('/admin')} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-600"><ArrowRight size={16}/> رجوع</button><h1 className="text-3xl font-black text-[#061827]">تحليل العملاء الشهري المتقدم</h1><p className="text-sm font-bold text-slate-500">مقارنة نشاط العملاء، الفروع، وترشيحات التواصل.</p></div><div className="flex gap-2"><input type="month" value={month} onChange={event => setMonth(event.target.value)} className="rounded-2xl border bg-slate-50 px-4 py-3 font-black"/><button type="button" onClick={load} className="rounded-3xl bg-[#008E92] px-5 py-3 font-black text-white"><RefreshCw size={18} className={loading ? 'inline animate-spin' : 'inline'}/> تحديث</button></div></header>
    <section className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">{metric('فواتير الشهر', stats.invoices, 'all')}{metric('عملاء نشطين', stats.active, 'all')}{metric('إجمالي المبيعات', money(stats.sales), 'all')}{metric('VIP', stats.vip, 'vip')}{metric('يومي', stats.daily, 'daily')}{metric('أسبوعي', stats.weekly, 'weekly')}{metric('متكررون', stats.repeat, 'repeat')}{metric('يحتاج تواصل', stats.needs, 'needs_contact')}</section>
    <section className="grid gap-4 xl:grid-cols-2"><div className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-black">حركة الفواتير اليومية</h2><div className="flex h-52 items-end gap-1 overflow-x-auto">{daily.map(item => <div key={item.date} className="flex min-w-8 flex-col items-center gap-1"><div className="w-5 rounded-t bg-[#008E92]" style={{ height: `${Math.max(4, (item.count / maxDaily) * 180)}px` }}/><span className="text-[10px] font-bold text-slate-400">{item.date.slice(8)}</span></div>)}</div></div><div className="rounded-3xl border bg-white p-5 shadow-sm"><h2 className="mb-4 font-black">الفروع حسب العملاء والمبيعات</h2><div className="space-y-3">{branches.map(item => <button key={item.branch} type="button" onClick={() => navigate(`/admin/reconciliation?branch=${encodeURIComponent(item.branch)}`)} className="w-full text-right"><div className="mb-1 flex justify-between text-xs font-black"><span>{item.branch}</span><span>{item.customers} عميل — {money(item.sales)} ج</span></div><div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-emerald-500" style={{ width: `${Math.max(3, (item.sales / maxBranch) * 100)}%` }}/></div></button>)}</div></div></section>
    <div className="rounded-3xl border bg-white p-4 shadow-sm"><div className="relative"><Search className="absolute right-4 top-3 text-slate-400" size={20}/><input value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-2xl border bg-slate-50 py-3 pr-12 font-bold outline-none" placeholder="بحث بالكود / الاسم / الهاتف / الفرع"/></div><div className="mt-3 flex flex-wrap gap-2">{[['all','الكل'],['vip','VIP'],['daily','يومي'],['weekly','أسبوعي'],['monthly','شهري'],['repeat','متكرر'],['one','مرة واحدة'],['needs_contact','يحتاج تواصل']].map(([key, label]) => <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter === key ? 'bg-[#008E92] text-white' : 'bg-slate-100 text-slate-600'}`}>{label}</button>)}</div></div>
    <div className="overflow-hidden rounded-3xl border bg-white shadow-sm"><div className="border-b p-4 font-black text-slate-700">العملاء — {filtered.length}</div><div className="max-h-[70vh] overflow-auto"><table className="w-full min-w-[1300px] text-sm"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">الكود</th><th>العميل</th><th>الهاتف</th><th>الفرع</th><th>فواتير الشهر</th><th>أيام النشاط</th><th>قيمة الشهر</th><th>الشهر السابق</th><th>قبل السابق</th><th>آخر طلب</th><th>تصنيف</th><th>توصية</th><th>واتساب</th></tr></thead><tbody>{filtered.map(row => <tr key={row.key} className="border-t"><td className="p-3 font-black">{row.code || '—'}</td><td className="p-3 font-black">{row.name}</td><td>{row.phone || '—'}</td><td>{row.branch || '—'}</td><td className="font-black text-sky-700">{row.invoices}</td><td>{row.activeDays}</td><td className="font-black text-emerald-700">{money(row.sales)}</td><td>{row.previousInvoices}</td><td>{row.beforePreviousInvoices}</td><td>{row.last}</td><td><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{row.segment}</span></td><td className={row.needsContact ? 'font-black text-rose-700' : 'text-slate-400'}>{row.needsContact ? row.reason : row.reason || '—'}</td><td>{row.phone ? <a href={wa(row.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">واتساب <ExternalLink size={12}/></a> : '—'}</td></tr>)}</tbody></table></div></div>
  </div>
}
