import { useState, useEffect, useMemo } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { ArrowLeft, Search, Users, TrendingUp, AlertTriangle, Star, RefreshCw } from 'lucide-react'
  import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'
  import { supabase } from '../../lib/supabase'
  import { toast } from 'sonner'

  type Segment = 'all' | 'vip' | 'active' | 'at_risk' | 'declining' | 'stopped' | 'new'

  // Matches customer_delivery_analytics view in supabase/52_delivery_intelligence_hardening.sql
  interface CustomerAnalytics {
    customer_id: string
    customer_code?: string
    customer_name?: string
    phone?: string
    branch_name?: string
    total_orders?: number
    matched_orders?: number
    rejected_orders?: number
    last_delivery_order_at?: string
    last_invoice_date?: string
    total_sales?: number
    invoices_count?: number
    average_invoice?: number
    days_since_last_invoice?: number
    delivery_problem_count?: number
    customer_segment?: string   // 'vip' | 'active' | 'at_risk' | 'declining' | 'stopped' | 'new'
    risk_level?: string         // 'high' | 'medium' | 'low' | 'unknown'
  }

  const SEGMENT_META: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
    vip:      { label: 'VIP',        color: '#7c3aed', bg: '#f5f3ff', emoji: '👑' },
    active:   { label: 'نشط',        color: '#059669', bg: '#ecfdf5', emoji: '✅' },
    at_risk:  { label: 'في خطر',     color: '#dc2626', bg: '#fef2f2', emoji: '⚠️' },
    declining:{ label: 'متراجع',     color: '#d97706', bg: '#fffbeb', emoji: '📉' },
    stopped:  { label: 'متوقف',      color: '#64748b', bg: '#f8fafc', emoji: '🔴' },
    new:      { label: 'جديد',       color: '#0284c7', bg: '#f0f9ff', emoji: '🆕' },
  }

  const SEGMENT_TABS = [
    { id: 'all',       label: 'الكل',       emoji: '📋' },
    { id: 'vip',       label: 'VIP',        emoji: '👑' },
    { id: 'active',    label: 'نشط',        emoji: '✅' },
    { id: 'at_risk',   label: 'في خطر',    emoji: '⚠️' },
    { id: 'declining', label: 'متراجع',    emoji: '📉' },
    { id: 'stopped',   label: 'متوقف',     emoji: '🔴' },
    { id: 'new',       label: 'جديد',       emoji: '🆕' },
  ]

  function SegmentBadge({ segment }: { segment?: string }) {
    const meta = SEGMENT_META[segment || '']
    if (!meta) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-500">غير محدد</span>
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black"
        style={{ backgroundColor: meta.bg, color: meta.color }}>
        {meta.emoji} {meta.label}
      </span>
    )
  }

  function RiskBadge({ risk }: { risk?: string }) {
    const cls =
      risk === 'high'    ? 'bg-rose-50 text-rose-700' :
      risk === 'medium'  ? 'bg-amber-50 text-amber-700' :
      risk === 'unknown' ? 'bg-slate-50 text-slate-500' :
                           'bg-emerald-50 text-emerald-700'
    const label =
      risk === 'high'    ? 'عالي ⚠️' :
      risk === 'medium'  ? 'متوسط' :
      risk === 'unknown' ? 'غير محدد' :
                           'منخفض'
    return <span className={`rounded-full px-2 py-0.5 text-xs font-black ${cls}`}>{label}</span>
  }

  export default function CustomerAnalytics() {
    const navigate = useNavigate()
    const [customers, setCustomers] = useState<CustomerAnalytics[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [segment, setSegment] = useState<Segment>('all')
    const [riskFilter, setRiskFilter] = useState('all')

    async function loadCustomers() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('customer_delivery_analytics')
          .select('*')
          .order('total_orders', { ascending: false })
          .limit(500)
        if (error) throw error
        setCustomers((data || []) as CustomerAnalytics[])
      } catch (err: any) {
        // fallback: try customers table directly if view doesn't exist yet
        try {
          const { data: fallback, error: err2 } = await supabase
            .from('customers')
            .select('id, customer_code, customer_name, phone, branch_id')
            .eq('active', true)
            .order('created_at', { ascending: false })
            .limit(500)
          if (!err2 && fallback) {
            setCustomers(fallback.map((c: any) => ({ customer_id: c.id, ...c })))
            toast.warning('بيانات التصنيف غير متاحة — شغّل ملف 52_delivery_intelligence_hardening.sql في Supabase')
          } else {
            throw err
          }
        } catch {
          toast.error('تعذّر تحميل بيانات العملاء')
        }
      } finally {
        setLoading(false)
      }
    }

    useEffect(() => { loadCustomers() }, [])

    const filtered = useMemo(() => {
      return customers.filter(c => {
        const segmentOk  = segment === 'all' || c.customer_segment === segment
        const riskOk     = riskFilter === 'all' || c.risk_level === riskFilter
        const q = search.trim().toLowerCase()
        const searchOk   = !q || [c.customer_name, c.customer_code, c.phone, c.branch_name]
          .some(v => String(v || '').toLowerCase().includes(q))
        return segmentOk && riskOk && searchOk
      })
    }, [customers, segment, riskFilter, search])

    // Chart: segment distribution
    const segmentChart = useMemo(() => {
      const counts: Record<string, number> = {}
      customers.forEach(c => {
        const s = c.customer_segment || 'غير محدد'
        counts[s] = (counts[s] || 0) + 1
      })
      return Object.entries(counts)
        .map(([seg, count]) => ({
          label: SEGMENT_META[seg]?.label || seg,
          count,
          color: SEGMENT_META[seg]?.color || '#94a3b8',
        }))
        .sort((a, b) => b.count - a.count)
    }, [customers])

    const atRiskCount = customers.filter(c => c.risk_level === 'high').length
    const vipCount    = customers.filter(c => c.customer_segment === 'vip').length
    const stoppedCount = customers.filter(c => c.customer_segment === 'stopped').length

    return (
      <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
        <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur-md shadow-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <button onClick={() => navigate('/admin')} className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">
              <ArrowLeft size={16} /> رجوع
            </button>
            <h1 className="text-lg font-black text-[#061827]">تحليل العملاء</h1>
            <button onClick={loadCustomers} className="rounded-2xl border bg-white p-2 text-slate-600 hover:bg-slate-50">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-5xl p-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: <Users size={20} />,        label: 'إجمالي العملاء',    value: customers.length,  bg: 'bg-sky-50 text-sky-700' },
              { icon: <Star size={20} />,          label: 'عملاء VIP',         value: vipCount,           bg: 'bg-purple-50 text-purple-700' },
              { icon: <AlertTriangle size={20} />, label: 'في خطر عالي',       value: atRiskCount,        bg: 'bg-rose-50 text-rose-700' },
              { icon: <TrendingUp size={20} />,    label: 'متوقفون 90+ يوم',   value: stoppedCount,       bg: 'bg-slate-50 text-slate-600' },
            ].map(c => (
              <div key={c.label} className="rounded-3xl border bg-white p-4 shadow-sm flex items-center gap-3">
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl ${c.bg}`}>{c.icon}</span>
                <div>
                  <p className="text-xs font-bold text-slate-400">{c.label}</p>
                  <p className="text-2xl font-black text-[#061827]">{c.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Segment distribution chart */}
          {!loading && segmentChart.length > 0 && (
            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-black text-[#061827]">توزيع العملاء حسب التصنيف</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={segmentChart} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                    formatter={(v: any) => [v, 'عميل']}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {segmentChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Segment filter tabs */}
          <div className="rounded-3xl border border-slate-100 bg-white p-2 shadow-sm">
            <div className="flex flex-wrap gap-1">
              {SEGMENT_TABS.map(t => {
                const cnt = t.id === 'all' ? customers.length
                  : customers.filter(c => c.customer_segment === t.id).length
                return (
                  <button key={t.id} onClick={() => setSegment(t.id as Segment)}
                    className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-sm font-black transition-all
                      ${segment === t.id ? 'bg-[#008E92] text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <span>{t.emoji}</span>
                    <span>{t.label}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px]
                      ${segment === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{cnt}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Search + risk filter */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-48">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم، الكود، التليفون..."
                className="w-full rounded-2xl border bg-white py-2.5 pr-9 pl-3 text-sm font-bold outline-none focus:border-[#008E92]" />
            </div>
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
              className="rounded-2xl border bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-[#008E92]">
              <option value="all">كل مستويات الخطر</option>
              <option value="high">خطر عالي</option>
              <option value="medium">خطر متوسط</option>
              <option value="low">خطر منخفض</option>
            </select>
          </div>

          {/* At-risk banner */}
          {atRiskCount > 0 && segment === 'all' && riskFilter === 'all' && (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-3 flex items-center gap-3">
              <AlertTriangle size={18} className="text-rose-600 shrink-0" />
              <p className="text-sm font-black text-rose-700">
                {atRiskCount} عميل في خطر عالي (لم يشتروا 60+ يوم) — يحتاجون متابعة عاجلة
              </p>
              <button onClick={() => { setRiskFilter('high'); setSegment('all') }}
                className="mr-auto rounded-2xl bg-rose-600 px-3 py-1.5 text-xs font-black text-white shrink-0">
                عرضهم
              </button>
            </div>
          )}

          {loading && <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />}

          {!loading && filtered.length === 0 && (
            <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
              <p className="text-4xl">🔍</p>
              <p className="mt-3 font-bold text-slate-500">لا توجد نتائج</p>
            </div>
          )}

          {/* Table */}
          {!loading && filtered.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-right text-sm">
                  <thead className="bg-slate-50 text-xs font-black text-slate-500">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">اسم العميل</th>
                      <th className="p-3">الكود</th>
                      <th className="p-3">التليفون</th>
                      <th className="p-3">الفرع</th>
                      <th className="p-3">التصنيف</th>
                      <th className="p-3">مستوى الخطر</th>
                      <th className="p-3">إجمالي أوردرات</th>
                      <th className="p-3">آخر فاتورة</th>
                      <th className="p-3">مبيعات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.slice(0, 200).map((c, i) => (
                      <tr key={c.customer_id}
                        className={`hover:bg-slate-50 ${c.risk_level === 'high' ? 'bg-rose-50/20' : ''}`}>
                        <td className="p-3 text-slate-400 font-black">{i + 1}</td>
                        <td className="p-3 font-black text-[#061827]">{c.customer_name || '—'}</td>
                        <td className="p-3 text-slate-500">{c.customer_code || '—'}</td>
                        <td className="p-3 text-slate-500" dir="ltr">{c.phone || '—'}</td>
                        <td className="p-3 text-slate-500">{c.branch_name || '—'}</td>
                        <td className="p-3"><SegmentBadge segment={c.customer_segment} /></td>
                        <td className="p-3"><RiskBadge risk={c.risk_level} /></td>
                        <td className="p-3 font-black text-[#008E92]">{c.total_orders ?? 0}</td>
                        <td className="p-3 text-slate-400">
                          {c.last_invoice_date ? c.last_invoice_date : '—'}
                          {c.days_since_last_invoice != null && (
                            <span className={`mr-1 text-[10px] ${c.days_since_last_invoice > 60 ? 'text-rose-500' : 'text-slate-400'}`}>
                              ({c.days_since_last_invoice} يوم)
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-black text-slate-600">
                          {c.total_sales ? `${Number(c.total_sales).toLocaleString('ar-EG')} ج.م` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length > 200 && (
                <div className="border-t bg-slate-50 p-3 text-center text-xs font-black text-slate-400">
                  عرض أول 200 من {filtered.length} — استخدم فلتر التصنيف لتضييق النتائج
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    )
  }
  