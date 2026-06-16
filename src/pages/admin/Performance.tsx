import { useState, useEffect, useMemo } from 'react'
  import { useNavigate } from 'react-router-dom'
  import { ArrowLeft, TrendingUp, TrendingDown, Award, RefreshCw, BarChart2 } from 'lucide-react'
  import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
  import { getRiderPerformanceDaily, getRiders, getBranches } from '../../lib/delivery'
  import { formatMoney, getOperationalPeriod, localIsoDate } from '../../lib/helpers'
  import { toast } from 'sonner'

  type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly'

  interface RiderStat {
    rider: string
    branch: string
    riderId: string
    orders: number
    delivered: number
    failed: number
    trips: number
    approvedTrips: number
    duplicates: number
    lateMinutes: number
    absence: number
    incidents: number
    rewards: number
    penalties: number
    avgScore: number
    deliveryRate: number
    netEarnings: number
  }

  function getDateRange(tab: Period): { startDate: string; endDate: string } {
    const now = new Date()
    const today = localIsoDate(now)
    switch (tab) {
      case 'daily':
        return { startDate: today, endDate: today }
      case 'weekly': {
        const start = new Date(now)
        start.setDate(now.getDate() - 6)
        return { startDate: localIsoDate(start), endDate: today }
      }
      case 'monthly': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        return { startDate: localIsoDate(start), endDate: today }
      }
      case 'quarterly': {
        const start = new Date(now)
        start.setMonth(now.getMonth() - 3)
        return { startDate: localIsoDate(start), endDate: today }
      }
    }
  }

  function ScoreBadge({ score }: { score: number }) {
    const color = score >= 90 ? 'emerald' : score >= 75 ? 'amber' : 'rose'
    const label = score >= 90 ? 'ممتاز' : score >= 75 ? 'جيد' : 'يحتاج تحسين'
    const cls = score >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : score >= 75 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black border ${cls}`}>
        {score >= 90 ? '🏆' : score >= 75 ? '✅' : '⚠️'} {label}
      </span>
    )
  }

  function MiniBar({ value, max, color = '#008E92' }: { value: number; max: number; color?: string }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
    return (
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
        <span className="w-8 text-right text-xs font-black text-slate-600">{value}</span>
      </div>
    )
  }

  function StatCard({ label, value, sub, icon, tone = 'green' }: { label: string; value: string | number; sub?: string; icon: string; tone?: 'green' | 'blue' | 'red' | 'orange' }) {
    const colors = {
      green:  'from-emerald-50 to-white border-emerald-100 text-emerald-700',
      blue:   'from-sky-50 to-white border-sky-100 text-sky-700',
      red:    'from-rose-50 to-white border-rose-100 text-rose-700',
      orange: 'from-amber-50 to-white border-amber-100 text-amber-700',
    }
    return (
      <div className={`rounded-3xl border bg-gradient-to-br ${colors[tone]} p-4`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          <div>
            <p className="text-xs font-bold text-slate-500">{label}</p>
            <p className="text-xl font-black">{value}</p>
            {sub && <p className="text-xs text-slate-500">{sub}</p>}
          </div>
        </div>
      </div>
    )
  }

  export default function Performance() {
    const navigate = useNavigate()
    const [tab, setTab] = useState<Period>('weekly')
    const [performanceData, setPerformanceData] = useState<RiderStat[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortBy, setSortBy] = useState<'score' | 'orders' | 'delivered' | 'penalties'>('score')
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards')

    const tabs: { id: Period; label: string; desc: string }[] = [
      { id: 'daily',     label: 'اليوم',      desc: 'أداء يوم واحد' },
      { id: 'weekly',    label: 'أسبوعي',     desc: 'آخر 7 أيام' },
      { id: 'monthly',   label: 'شهري',       desc: 'الشهر الحالي' },
      { id: 'quarterly', label: 'ربع سنوي',   desc: 'آخر 3 أشهر' },
    ]

    useEffect(() => { loadPerformanceData() }, [tab])

    async function loadPerformanceData() {
      setLoading(true)
      try {
        const { startDate, endDate } = getDateRange(tab)
        const [perfData, ridersData, branchesData] = await Promise.allSettled([
          getRiderPerformanceDaily(undefined, startDate, endDate),
          getRiders(),
          getBranches(),
        ])
        const riders   = ridersData.status   === 'fulfilled' ? ridersData.value   : []
        const branches = branchesData.status === 'fulfilled' ? branchesData.value : []
        const perf     = perfData.status     === 'fulfilled' ? perfData.value     : []

        const aggregated: RiderStat[] = riders.map(rider => {
          const rp = perf.filter((p: any) => p.rider_id === rider.id)
          const sum = (key: string) => rp.reduce((s: number, p: any) => s + (Number(p[key]) || 0), 0)
          const orders    = sum('orders_count')
          const delivered = sum('delivered_count')
          const failed    = sum('failed_count')
          const rewards   = sum('rewards_amount')
          const penalties = sum('penalties_amount')
          const avgScore  = rp.length > 0 ? Math.round(sum('performance_score') / rp.length) : 0
          const branch    = branches.find((b: any) => b.id === rider.branch_id)
          return {
            rider: rider.name || 'غير محدد',
            branch: (branch as any)?.name || 'غير محدد',
            riderId: rider.id,
            orders, delivered, failed,
            trips:        sum('internal_trips_count'),
            approvedTrips: sum('approved_trips_count'),
            duplicates:   sum('duplicate_invoices_count'),
            lateMinutes:  sum('late_minutes'),
            absence:      sum('absence_count'),
            incidents:    sum('incidents_count'),
            rewards, penalties,
            avgScore,
            deliveryRate: orders > 0 ? Math.round((delivered / orders) * 100) : 0,
            netEarnings:  rewards - penalties,
          }
        }).filter(r => r.orders > 0 || r.trips > 0 || tab !== 'daily')

        setPerformanceData(aggregated)
      } catch {
        toast.error('حصلت مشكلة في تحميل بيانات الأداء')
      } finally {
        setLoading(false)
      }
    }

    const filtered = useMemo(() => {
      let rows = performanceData.filter(r =>
        !searchTerm || r.rider.includes(searchTerm) || r.branch.includes(searchTerm)
      )
      return [...rows].sort((a, b) => {
        if (sortBy === 'score')     return b.avgScore    - a.avgScore
        if (sortBy === 'orders')    return b.orders      - a.orders
        if (sortBy === 'delivered') return b.delivered   - a.delivered
        if (sortBy === 'penalties') return b.penalties   - a.penalties
        return 0
      })
    }, [performanceData, searchTerm, sortBy])

    const totals = useMemo(() => ({
      orders:    filtered.reduce((s, r) => s + r.orders, 0),
      delivered: filtered.reduce((s, r) => s + r.delivered, 0),
      failed:    filtered.reduce((s, r) => s + r.failed, 0),
      trips:     filtered.reduce((s, r) => s + r.trips, 0),
      penalties: filtered.reduce((s, r) => s + r.penalties, 0),
      rewards:   filtered.reduce((s, r) => s + r.rewards, 0),
      avgScore:  filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + r.avgScore, 0) / filtered.length) : 0,
    }), [filtered])

    const maxOrders  = Math.max(...filtered.map(r => r.orders), 1)
    const { startDate, endDate } = getDateRange(tab)

    // Chart data — top 8 by orders
    const chartData = filtered.slice(0, 8).map(r => ({
      name: r.rider.split(' ')[0],
      أوردرات: r.orders,
      تسليم: r.delivered,
      فشل: r.failed,
    }))

    return (
      <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
        <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-3 backdrop-blur-md shadow-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <button onClick={() => navigate('/admin')} className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200 active:scale-95">
              <ArrowLeft size={16} /> رجوع
            </button>
            <div className="text-center">
              <h1 className="text-lg font-black text-[#061827]">تقرير الأداء</h1>
              <p className="text-xs text-slate-400">{startDate} — {endDate}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setViewMode(v => v === 'cards' ? 'table' : 'cards')} className="rounded-2xl border bg-white p-2 text-slate-600 hover:bg-slate-50 active:scale-95">
                <BarChart2 size={16} />
              </button>
              <button onClick={loadPerformanceData} disabled={loading} className="rounded-2xl border bg-white p-2 text-slate-600 hover:bg-slate-50 active:scale-95">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl p-4 space-y-4">
          {/* Period tabs */}
          <div className="rounded-3xl border border-slate-100 bg-white p-2 shadow-sm">
            <div className="grid grid-cols-4 gap-1">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex flex-col items-center rounded-2xl px-3 py-2.5 text-center transition-all active:scale-95 ${tab === t.id ? 'bg-[#008E92] text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                  <span className="text-sm font-black">{t.label}</span>
                  <span className={`text-[10px] ${tab === t.id ? 'text-emerald-100' : 'text-slate-400'}`}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Summary stats */}
          {!loading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="إجمالي الأوردرات"  value={totals.orders}    icon="📦" tone="blue" />
              <StatCard label="تم التسليم"          value={totals.delivered} icon="✅" tone="green" sub={`${totals.orders > 0 ? Math.round((totals.delivered/totals.orders)*100) : 0}%`} />
              <StatCard label="إجمالي المكافآت"    value={formatMoney(totals.rewards)}   icon="🎁" tone="green" />
              <StatCard label="إجمالي الخصومات"    value={formatMoney(totals.penalties)} icon="⚠️" tone="red" />
            </div>
          )}

          {/* Bar chart comparison */}
          {!loading && chartData.length > 0 && (
            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <h3 className="mb-4 text-base font-black text-[#061827]">مقارنة الأداء — أوردرات مقابل تسليم</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                  <Bar dataKey="أوردرات" fill="#008E92" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="تسليم"   fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="فشل"     fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <input
              type="search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="بحث باسم المندوب أو الفرع..." dir="rtl"
              className="flex-1 min-w-48 rounded-2xl border bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#008E92] focus:ring-2 focus:ring-[#008E92]/20"
            />
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="rounded-2xl border bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#008E92]">
              <option value="score">ترتيب: التقييم</option>
              <option value="orders">ترتيب: الأوردرات</option>
              <option value="delivered">ترتيب: التسليم</option>
              <option value="penalties">ترتيب: الخصومات</option>
            </select>
          </div>

          {loading && <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-28 animate-pulse rounded-3xl bg-slate-200" />)}</div>}

          {!loading && filtered.length === 0 && (
            <div className="rounded-3xl bg-white p-10 text-center shadow-sm">
              <p className="text-4xl">📭</p>
              <p className="mt-3 font-bold text-slate-500">لا توجد بيانات أداء للفترة المحددة</p>
              <p className="text-sm text-slate-400 mt-1">{startDate} — {endDate}</p>
            </div>
          )}

          {/* Table view */}
          {!loading && viewMode === 'table' && filtered.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-right text-sm">
                  <thead className="bg-slate-50 text-xs font-black text-slate-500">
                    <tr>
                      <th className="p-3">#</th>
                      <th className="p-3">المندوب</th>
                      <th className="p-3">الفرع</th>
                      <th className="p-3">أوردرات</th>
                      <th className="p-3">تسليم</th>
                      <th className="p-3">معدل التسليم</th>
                      <th className="p-3">فشل</th>
                      <th className="p-3">مشاوير</th>
                      <th className="p-3">تأخر (د)</th>
                      <th className="p-3">غياب</th>
                      <th className="p-3">مكافآت</th>
                      <th className="p-3">خصومات</th>
                      <th className="p-3">التقييم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((r, idx) => (
                      <tr key={r.riderId} className={`hover:bg-slate-50 ${r.failed > 5 || r.absence > 1 ? 'bg-rose-50/30' : ''}`}>
                        <td className="p-3 font-black text-slate-400">{idx + 1}</td>
                        <td className="p-3 font-black text-[#061827]">{r.rider}</td>
                        <td className="p-3 text-slate-500">{r.branch}</td>
                        <td className="p-3 font-black">{r.orders}</td>
                        <td className="p-3 font-black text-emerald-700">{r.delivered}</td>
                        <td className="p-3"><span className={`rounded-full px-2 py-0.5 text-xs font-black ${r.deliveryRate >= 90 ? 'bg-emerald-50 text-emerald-700' : r.deliveryRate >= 70 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{r.deliveryRate}%</span></td>
                        <td className={`p-3 font-black ${r.failed > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{r.failed}</td>
                        <td className="p-3">{r.trips}</td>
                        <td className={`p-3 ${r.lateMinutes > 60 ? 'text-amber-600 font-black' : 'text-slate-500'}`}>{r.lateMinutes}</td>
                        <td className={`p-3 ${r.absence > 0 ? 'text-rose-600 font-black' : 'text-slate-400'}`}>{r.absence}</td>
                        <td className="p-3 text-emerald-700 font-black">{r.rewards > 0 ? formatMoney(r.rewards) : '—'}</td>
                        <td className={`p-3 font-black ${r.penalties > 0 ? 'text-rose-700' : 'text-slate-400'}`}>{r.penalties > 0 ? formatMoney(r.penalties) : '—'}</td>
                        <td className="p-3"><ScoreBadge score={r.avgScore} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Cards view */}
          {!loading && viewMode === 'cards' && filtered.map((r, idx) => (
            <div key={r.riderId} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#008E92] to-[#006A70] text-sm font-black text-white shadow-sm">{idx + 1}</div>
                  <div>
                    <p className="font-black text-[#061827]">{r.rider}</p>
                    <p className="text-xs font-bold text-slate-400">{r.branch}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <ScoreBadge score={r.avgScore} />
                  <span className="text-xs font-black text-slate-400">{r.deliveryRate}% معدل تسليم</span>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">الأوردرات</span>
                  <span className="text-xs font-black text-slate-700">{r.delivered} / {r.orders} تسليم</span>
                </div>
                <MiniBar value={r.delivered} max={maxOrders} color="#008E92" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  { label: 'مشاوير',  value: r.trips,        emoji: '🛵' },
                  { label: 'فشل',     value: r.failed,       emoji: '❌', warn: r.failed > 5 },
                  { label: 'تأخر',    value: r.lateMinutes > 0 ? `${r.lateMinutes}د` : '0', emoji: '⏰', warn: r.lateMinutes > 60 },
                  { label: 'غياب',    value: r.absence,      emoji: '📵', warn: r.absence > 0 },
                  { label: 'مكافآت', value: formatMoney(r.rewards).replace(' ج.م',''),   emoji: '🎁' },
                  { label: 'خصومات', value: formatMoney(r.penalties).replace(' ج.م',''), emoji: '💸', warn: r.penalties > 0 },
                ].map(s => (
                  <div key={s.label} className={`rounded-2xl p-2 text-center ${s.warn ? 'bg-rose-50 border border-rose-100' : 'bg-slate-50'}`}>
                    <p className="text-base">{s.emoji}</p>
                    <p className={`text-xs font-black ${s.warn ? 'text-rose-700' : 'text-slate-700'}`}>{s.value}</p>
                    <p className="text-[10px] font-bold text-slate-400">{s.label}</p>
                  </div>
                ))}
              </div>
              {(r.rewards > 0 || r.penalties > 0) && (
                <div className={`flex items-center justify-between rounded-2xl px-3 py-2 text-sm font-black ${r.netEarnings >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  <span>{r.netEarnings >= 0 ? <TrendingUp size={14} className="inline ml-1" /> : <TrendingDown size={14} className="inline ml-1" />}صافي المكافآت والخصومات</span>
                  <span>{formatMoney(r.netEarnings)}</span>
                </div>
              )}
            </div>
          ))}

          {!loading && filtered.length > 0 && (
            <div className="rounded-3xl bg-gradient-to-l from-amber-50 to-white border border-amber-200 p-4 text-center shadow-sm">
              <Award className="mx-auto mb-2 text-amber-500" size={28} />
              <p className="font-black text-amber-800">🏆 الأفضل في هذه الفترة</p>
              <p className="mt-1 text-lg font-black text-[#008E92]">{filtered[0]?.rider}</p>
              <p className="text-sm font-bold text-slate-500">{filtered[0]?.branch} — معدل تسليم {filtered[0]?.deliveryRate}% — تقييم {filtered[0]?.avgScore}/100</p>
            </div>
          )}
        </main>
      </div>
    )
  }
  