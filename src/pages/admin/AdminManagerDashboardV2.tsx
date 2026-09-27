import { lazy, Suspense, useState } from 'react'
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardCheck, FileText, Gauge, PackageSearch, ShieldAlert, Truck, Users, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import AdminDashboardFast from './AdminDashboardFast'

const LiveRiderLeaderboardPanel = lazy(() => import('../../components/LiveRiderLeaderboardPanel'))
const RiderOperationsHealth = lazy(() => import('../../components/RiderOperationsHealth'))
const DashboardTripCustomerInsights = lazy(() => import('../../components/DashboardTripCustomerInsights'))
const DashboardGrowthPanelReliable = lazy(() => import('../../components/DashboardGrowthPanelReliable'))
const CycleArchiveOverview = lazy(() => import('../../components/CycleArchiveOverview'))

type ActionCardProps = {
  title: string
  text: string
  to: string
  icon: JSX.Element
  tone?: 'teal' | 'amber' | 'rose' | 'slate'
}

function ActionCard({ title, text, to, icon, tone = 'teal' }: ActionCardProps) {
  const navigate = useNavigate()
  const cls = {
    teal: 'border-teal-100 bg-teal-50 text-teal-800',
    amber: 'border-amber-100 bg-amber-50 text-amber-800',
    rose: 'border-rose-100 bg-rose-50 text-rose-800',
    slate: 'border-slate-200 bg-white text-slate-800',
  }[tone]
  return (
    <button type="button" onClick={() => navigate(to)} className={`group rounded-[1.6rem] border p-4 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cls}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/80 shadow-sm">{icon}</span>
        <span className="text-xs font-black opacity-60 transition group-hover:translate-x-[-2px]">فتح الصفحة ←</span>
      </div>
      <h3 className="font-black">{title}</h3>
      <p className="mt-1 text-xs font-bold leading-5 opacity-70">{text}</p>
    </button>
  )
}

function PanelSkeleton() {
  return <div className="h-44 animate-pulse rounded-[1.8rem] border border-slate-100 bg-white shadow-sm" />
}

export default function AdminManagerDashboardV2() {
  const [showMore, setShowMore] = useState(false)

  return (
    <div className="space-y-6" dir="rtl">
      <section className="overflow-hidden rounded-[2.4rem] border border-[#0b6468]/10 bg-gradient-to-l from-[#072f36] via-[#07565d] to-[#008e92] p-6 text-white shadow-xl">
        <div className="max-w-3xl">
          <p className="text-xs font-black text-teal-200">لوحة الإدارة · النسخة التجريبية</p>
          <h1 className="mt-2 text-3xl font-black">ماذا يحتاج قرارك الآن؟</h1>
          <p className="mt-2 text-sm font-bold leading-7 text-white/75">
            الواجهة الجديدة تفصل بين القرار الإداري، متابعة التشغيل، والتحليل. كل وظائف الدليفري الحالية تظل كما هي بدون تغيير.
          </p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ActionCard title="مركز مراجعة الدورة" text="ابدأ من قائمة القرارات المعلقة ثم انتقل للمطابقة والمشاوير والإغلاق." to="/admin/review-center" icon={<PackageSearch size={20}/>} tone="amber" />
          <ActionCard title="مراجعة المشاوير" text="المشاوير المعلقة والمرفوضة وإثباتات الحركة." to="/admin/trips" icon={<Truck size={20}/>} tone="teal" />
          <ActionCard title="جاهزية إغلاق الدورة" text="تأكد من أن كل البنود المالية والتشغيلية جاهزة للقفل." to="/admin/cycle-closing" icon={<ClipboardCheck size={20}/>} tone="rose" />
          <ActionCard title="مستحقات الدليفري" text="الأوردرات والمشاوير والأسعار والخصومات والمكافآت." to="/admin/rider-compensation" icon={<WalletCards size={20}/>} tone="slate" />
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black text-[#008E92]">التشغيل الحالي</p>
            <h2 className="mt-1 text-xl font-black text-[#061827]">ملخص الدورة والحركة اليومية</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">الأرقام الأساسية كما هي من الداشبورد الحالي؛ التغيير هنا في التنظيم فقط.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionCard title="ملخص الإدارة" text="صورة موحدة عن أداء المناديب والحالات." to="/admin/executive" icon={<Gauge size={18}/>} tone="slate" />
          </div>
        </div>
        <AdminDashboardFast />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard title="فريق الدليفري" text="بيانات الفريق والمواعيد والحسابات والأجهزة." to="/admin/riders" icon={<Users size={20}/>} />
        <ActionCard title="أداء الدليفري" text="تحليل الأداء والفروقات على مستوى الدورة." to="/admin/performance" icon={<BarChart3 size={20}/>} />
        <ActionCard title="قرارات وملاحظات" text="الخصومات والمكافآت والملاحظات الإدارية." to="/admin/rider-actions" icon={<FileText size={20}/>} tone="amber" />
        <ActionCard title="مراجعة الحالات غير الطبيعية" text="التكرار، التأخير، البيانات الناقصة، والحالات غير المعتادة." to="/admin/fraud-alerts" icon={<ShieldAlert size={20}/>} tone="rose" />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[#061827]">تحليلات إضافية</h2>
            <p className="mt-1 text-xs font-bold text-slate-400">مخفية افتراضيًا حتى تفضل الصفحة خفيفة وواضحة.</p>
          </div>
          <button type="button" onClick={() => setShowMore(value => !value)} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
            {showMore ? 'إخفاء التفاصيل' : 'عرض التحليلات الإضافية'}
          </button>
        </div>

        {showMore && (
          <Suspense fallback={<div className="mt-5 grid gap-4 md:grid-cols-2"><PanelSkeleton/><PanelSkeleton/></div>}>
            <div className="mt-5 space-y-5">
              <LiveRiderLeaderboardPanel />
              <RiderOperationsHealth />
              <DashboardTripCustomerInsights />
              <DashboardGrowthPanelReliable />
              <CycleArchiveOverview />
            </div>
          </Suspense>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ActionCard title="العملاء والمناطق" text="تحليل العملاء وتحديث البيانات وربطها بالمناطق." to="/admin/customer-analytics" icon={<CheckCircle2 size={20}/>} tone="slate" />
        <ActionCard title="تقارير وأرشيف الدورات" text="الرجوع لدورات سابقة وتقارير الإدارة." to="/admin/reports" icon={<FileText size={20}/>} tone="slate" />
        <ActionCard title="تنبيهات تحتاج مراجعة" text="افتح مركز الحالات غير الطبيعية لو فيه أي إشارة تستحق قرار." to="/admin/fraud-alerts" icon={<AlertTriangle size={20}/>} tone="amber" />
      </section>
    </div>
  )
}
