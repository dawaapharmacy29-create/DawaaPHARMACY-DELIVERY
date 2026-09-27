import { Archive, BarChart3, Building2, FileText, ShieldAlert, WalletCards } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ReportsAdminTabs from '../../components/ReportsAdminTabs'

function Card({title,text,to,icon}:{title:string;text:string;to:string;icon:JSX.Element}){
  const navigate=useNavigate()
  return <button type="button" onClick={()=>navigate(to)} className="rounded-[1.7rem] border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50 text-slate-700">{icon}</span>
    <h2 className="mt-4 text-lg font-black text-[#061827]">{title}</h2>
    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{text}</p>
  </button>
}
export default function ReportsCenter(){
  return <div className="space-y-5" dir="rtl">
    <ReportsAdminTabs/>
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black text-[#008E92]">التقارير والإدارة</p>
      <h1 className="mt-1 text-2xl font-black text-[#061827]">مركز التقارير والإدارة</h1>
      <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-500">التقارير الدورية والأرشيف والرقابة وملخصات المستحقات في مكان واحد للرجوع السريع.</p>
    </section>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card title="تقارير الدورة" text="تقارير الدليفري والدورة الحالية وملخصات الأداء." to="/admin/reports" icon={<FileText size={20}/>}/>
      <Card title="أرشيف الدورات" text="الرجوع للدورات السابقة والنسخ المحفوظة." to="/admin/cycles" icon={<Archive size={20}/>}/>
      <Card title="الحالات غير الطبيعية" text="إشارات البيانات التي تحتاج مراجعة إدارية." to="/admin/fraud-alerts" icon={<ShieldAlert size={20}/>}/>
      <Card title="ملخص مستحقات الدورة" text="صورة مالية سريعة للأوردرات والمشاوير والأسعار الناقصة." to="/admin/cash-flow" icon={<WalletCards size={20}/>}/>
      <Card title="لوحة مدير الفرع" text="متابعة تشغيل الفرع والصلاحيات المحلية." to="/admin/branch" icon={<Building2 size={20}/>}/>
      <Card title="ملخص الإدارة" text="ملخص تنفيذي للمدير قبل الدخول في التفاصيل." to="/admin/executive" icon={<BarChart3 size={20}/>}/>
    </section>
  </div>
}
