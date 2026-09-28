import { BarChart3, MapPinned, UploadCloud, UsersRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import CustomerAdminTabs from '../../components/CustomerAdminTabs'
import { useAdminAccess } from '../../hooks/useAdminAccess'

function Card({title,text,to,icon}:{title:string;text:string;to:string;icon:JSX.Element}){
  const navigate=useNavigate()
  return <button type="button" onClick={()=>navigate(to)} className="rounded-[1.7rem] border border-slate-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">{icon}</span>
    <h2 className="mt-4 text-lg font-black text-[#061827]">{title}</h2>
    <p className="mt-1 text-sm font-bold leading-6 text-slate-500">{text}</p>
  </button>
}
export default function CustomerCenter(){
  const { ready, canAccess } = useAdminAccess()
  return <div className="space-y-5" dir="rtl">
    <CustomerAdminTabs/>
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black text-[#008E92]">العملاء والمناطق</p>
      <h1 className="mt-1 text-2xl font-black text-[#061827]">مركز العملاء والمناطق</h1>
      <p className="mt-2 max-w-2xl text-sm font-bold leading-7 text-slate-500">اختر المسار المناسب: تحليل العملاء، تحديث البيانات، أو تنظيم المناطق والمسارات.</p>
    </section>
    <section className="grid gap-4 md:grid-cols-3">
      <Card title="تحليل العملاء" text="العملاء المتكررين، المهمين، عدد الفواتير، المبيعات، وآخر تعامل." to="/admin/customer-analytics" icon={<BarChart3 size={20}/>}/>
      {ready && canAccess('customer_import') && <Card title="تحديث بيانات العملاء" text="رفع ملفات العملاء ومراجعة الصفوف قبل الحفظ في قاعدة البيانات." to="/admin/customer-import" icon={<UploadCloud size={20}/>} />}
      {ready && canAccess('dashboard') && <Card title="المناطق والمسارات" text="ترتيب الأوردرات حسب المنطقة وربطها بالمندوب المناسب." to="/admin/route-planner" icon={<MapPinned size={20}/>} />}
    </section>
    <section className="rounded-[1.8rem] border border-teal-100 bg-teal-50 p-5">
      <div className="flex items-start gap-3"><UsersRound className="mt-0.5 text-teal-700"/><div><h2 className="font-black text-teal-900">طريقة الاستخدام</h2><p className="mt-1 text-sm font-bold leading-7 text-teal-800">استخدم التحليل لاتخاذ القرار، وتحديث البيانات للاستيراد والمراجعة، والمناطق والمسارات للتوزيع والتشغيل.</p></div></div>
    </section>
  </div>
}
