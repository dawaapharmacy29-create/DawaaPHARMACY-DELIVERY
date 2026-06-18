import { AlertTriangle, CheckCircle2, ChevronLeft, Clock3, Copy, TrendingDown } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { DeliveryOrder, Rider } from '../lib/types'
import { minutesSince } from '../lib/deliveryIntelligence'

type SmartAlert = { id: string; severity: 'urgent' | 'warning' | 'info'; title: string; detail: string; path: string; icon: React.ReactNode }

export function useSmartAlerts(orders: DeliveryOrder[], riders: Rider[]) {
  return useMemo(() => {
    const alerts: SmartAlert[] = []
    const stuck = orders.filter(o => !['delivered', 'failed', 'cancelled'].includes(o.status) && minutesSince(o.registered_at) > 60)
    if (stuck.length) alerts.push({ id: 'stuck', severity: 'urgent', title: `${stuck.length} أوردر عالق أكثر من ساعة`, detail: `أقدم أوردر منتظر منذ ${Math.max(...stuck.map(o => minutesSince(o.registered_at)))} دقيقة`, path: '/admin/ops', icon: <Clock3 size={18}/> })
    const duplicates = orders.filter(o => o.is_duplicate_invoice && o.duplicate_review_status === 'pending')
    if (duplicates.length) alerts.push({ id: 'duplicates', severity: 'warning', title: `${duplicates.length} فاتورة مكررة معلّقة`, detail: 'تحتاج اعتماد أو رفض قبل إغلاق الدورة', path: '/admin/duplicate-invoices', icon: <Copy size={18}/> })
    const today = new Date().toISOString().slice(0, 10)
    const todayOrders = orders.filter(o => (o.delivery_date || (o as any).work_date) === today)
    const failed = todayOrders.filter(o => o.status === 'failed')
    if (todayOrders.length >= 5 && failed.length / todayOrders.length > .2) alerts.push({ id: 'fail-rate', severity: 'warning', title: `نسبة الفشل اليوم ${Math.round(failed.length / todayOrders.length * 100)}%`, detail: `${failed.length} من ${todayOrders.length} أوردر؛ المعدل يحتاج مراجعة`, path: '/admin/performance', icon: <TrendingDown size={18}/> })
    const ridersWithOrders = new Set(todayOrders.map(o => o.rider_id))
    const inactive = riders.filter(r => !ridersWithOrders.has(r.id))
    if (inactive.length) alerts.push({ id: 'inactive', severity: 'info', title: `${inactive.length} دليفري بدون أوردر اليوم`, detail: inactive.slice(0, 3).map(r => r.name).join('، '), path: '/admin/riders', icon: <AlertTriangle size={18}/> })
    return alerts
  }, [orders, riders])
}

export default function SmartAlertsCenter({ orders, riders, compact = false }: { orders: DeliveryOrder[]; riders: Rider[]; compact?: boolean }) {
  const navigate = useNavigate(); const alerts = useSmartAlerts(orders, riders)
  if (!alerts.length) return <div className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700"><CheckCircle2 size={18}/> كل شيء هادئ — لا توجد تنبيهات عاجلة</div>
  return <div className="space-y-2">{alerts.slice(0, compact ? 2 : alerts.length).map(a => { const cls = a.severity === 'urgent' ? 'border-rose-200 bg-rose-50 text-rose-700' : a.severity === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-sky-200 bg-sky-50 text-sky-700'; return <button key={a.id} onClick={() => navigate(a.path)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition hover:shadow-md ${cls}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">{a.icon}</span><span className="min-w-0 flex-1"><b className="block text-sm">{a.title}</b><span className="block truncate text-[11px] font-bold text-slate-500">{a.detail}</span></span><ChevronLeft size={17}/></button> })}</div>
}

