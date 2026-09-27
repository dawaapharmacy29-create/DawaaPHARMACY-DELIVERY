import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, Clock3, KeyRound, ShieldCheck, UserCog, Users, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getRiders } from '../../lib/delivery'
import { supabase } from '../../lib/supabase'
import TeamAdminTabs from '../../components/TeamAdminTabs'

type TeamStats = {
  total: number
  active: number
  inactive: number
  missingRate: number
  missingAccount: number
  lockedAccounts: number
}

function HubCard({ title, text, to, icon, badge, tone = 'teal' }: { title: string; text: string; to: string; icon: JSX.Element; badge?: string | number; tone?: 'teal' | 'amber' | 'rose' | 'violet' | 'slate' }) {
  const navigate = useNavigate()
  const tones = {
    teal: 'border-teal-100 bg-teal-50 text-teal-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    rose: 'border-rose-100 bg-rose-50 text-rose-800',
    violet: 'border-violet-100 bg-violet-50 text-violet-800',
    slate: 'border-slate-200 bg-white text-slate-800',
  }
  return (
    <button type="button" onClick={() => navigate(to)} className={`group rounded-[1.7rem] border p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/85 shadow-sm">{icon}</span>
        {badge !== undefined && <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-black shadow-sm">{badge}</span>}
      </div>
      <h2 className="mt-4 text-lg font-black">{title}</h2>
      <p className="mt-1 text-xs font-bold leading-6 opacity-70">{text}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-black opacity-60">فتح <ChevronLeft size={14} className="transition group-hover:-translate-x-1" /></span>
    </button>
  )
}

export default function DeliveryTeamCenter() {
  const [stats, setStats] = useState<TeamStats>({ total: 0, active: 0, inactive: 0, missingRate: 0, missingAccount: 0, lockedAccounts: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      try {
        const [ridersResult, accountsResult] = await Promise.allSettled([
          getRiders(),
          supabase.from('staff_accounts_full_view').select('rider_id,account_id,account_status,locked_until,account_scope'),
        ])
        if (!alive) return
        const riders = ridersResult.status === 'fulfilled' ? ridersResult.value : []
        const accountRows = accountsResult.status === 'fulfilled' ? (accountsResult.value.data || []) as any[] : []
        const riderAccountMap = new Map(accountRows.filter(row => row.account_scope === 'rider' && row.rider_id).map(row => [row.rider_id, row]))
        const active = riders.filter((r: any) => r.status === 'active').length
        const missingRate = riders.filter((r: any) => r.status === 'active' && (Number(r.order_rate || 0) <= 0 || Number(r.trip_rate || 0) <= 0)).length
        const missingAccount = riders.filter((r: any) => r.status === 'active' && !riderAccountMap.get(r.id)?.account_id).length
        const lockedAccounts = accountRows.filter(row => row.account_scope === 'rider' && row.locked_until && new Date(row.locked_until).getTime() > Date.now()).length
        setStats({
          total: riders.length,
          active,
          inactive: Math.max(0, riders.length - active),
          missingRate,
          missingAccount,
          lockedAccounts,
        })
      } finally {
        if (alive) setLoading(false)
      }
    }
    void load()
    return () => { alive = false }
  }, [])

  const attention = useMemo(() => stats.missingRate + stats.missingAccount + stats.lockedAccounts, [stats])

  return (
    <div className="space-y-5" dir="rtl">
      <TeamAdminTabs />
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-[#008E92]">الفريق والأداء</p>
            <h1 className="mt-1 text-2xl font-black text-[#061827]">مركز فريق الدليفري</h1>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-500">بدل صفحة واحدة ضخمة لكل شيء، قسمت إدارة الفريق إلى مسارات واضحة: بيانات الفريق، الجداول، الحسابات، الأداء، والقرارات المالية.</p>
          </div>
          <div className={`rounded-2xl px-4 py-3 text-center ${attention ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            <p className="text-2xl font-black">{loading ? '—' : attention}</p>
            <p className="text-[11px] font-black">حالات تحتاج انتباه</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-[1.5rem] border border-slate-100 bg-white p-4 shadow-sm"><p className="text-xs font-black text-slate-400">إجمالي الفريق</p><p className="mt-2 text-3xl font-black">{loading ? '—' : stats.total}</p></div>
        <div className="rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4 shadow-sm"><p className="text-xs font-black text-emerald-700">نشط</p><p className="mt-2 text-3xl font-black text-emerald-900">{loading ? '—' : stats.active}</p></div>
        <div className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4 shadow-sm"><p className="text-xs font-black text-slate-500">غير نشط</p><p className="mt-2 text-3xl font-black text-slate-800">{loading ? '—' : stats.inactive}</p></div>
        <div className="rounded-[1.5rem] border border-amber-100 bg-amber-50 p-4 shadow-sm"><p className="text-xs font-black text-amber-700">مشاكل إعداد</p><p className="mt-2 text-3xl font-black text-amber-900">{loading ? '—' : attention}</p></div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <HubCard title="بيانات فريق الدليفري" text="الأسماء، الفروع، الأسعار الأساسية، الحالة، والإجازة الأسبوعية." to="/admin/riders/manage" icon={<Users size={20}/>} badge={stats.total} />
        <HubCard title="الجداول والمواعيد" text="إدارة واستيراد جداول العمل ومراجعة التحذيرات قبل الاعتماد." to="/admin/rider-schedules" icon={<CalendarDays size={20}/>} tone="violet" />
        <HubCard title="الحسابات والأجهزة" text="حسابات الدخول، PIN، حالة الحساب، والقفل أو إعادة التعيين." to="/admin/rider-accounts" icon={<KeyRound size={20}/>} badge={stats.missingAccount ? `${stats.missingAccount} بدون حساب` : 'مكتمل'} tone={stats.missingAccount ? 'amber' : 'teal'} />
        <HubCard title="أداء الدليفري" text="الأوردرات، المشاوير، نسب النجاح، والمقارنة على مستوى الدورة." to="/admin/performance" icon={<Clock3 size={20}/>} tone="slate" />
        <HubCard title="قرارات وملاحظات" text="الملاحظات الإدارية، الخصومات، المكافآت، واعتماد الإجراءات." to="/admin/rider-actions" icon={<ShieldCheck size={20}/>} tone="amber" />
        <HubCard title="مستحقات الدليفري" text="الحساب النهائي للأوردرات والمشاوير والخصومات والمكافآت." to="/admin/rider-compensation" icon={<WalletCards size={20}/>} badge={stats.missingRate ? `${stats.missingRate} سعر ناقص` : undefined} tone={stats.missingRate ? 'rose' : 'teal'} />
      </section>

      {(stats.missingRate > 0 || stats.missingAccount > 0 || stats.lockedAccounts > 0) && (
        <section className="rounded-[1.8rem] border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-black text-amber-900">قبل قفل أي دورة</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/80 p-3"><b className="text-rose-700">{stats.missingRate}</b><p className="mt-1 text-xs font-bold text-slate-600">مندوب نشط عنده سعر أوردر أو مشوار ناقص</p></div>
            <div className="rounded-2xl bg-white/80 p-3"><b className="text-amber-700">{stats.missingAccount}</b><p className="mt-1 text-xs font-bold text-slate-600">مندوب نشط بدون حساب دخول</p></div>
            <div className="rounded-2xl bg-white/80 p-3"><b className="text-amber-700">{stats.lockedAccounts}</b><p className="mt-1 text-xs font-bold text-slate-600">حساب دليفري مقفول حاليًا</p></div>
          </div>
        </section>
      )}
    </div>
  )
}
