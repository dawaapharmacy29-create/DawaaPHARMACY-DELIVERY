import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Eye, RefreshCw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../../lib/supabase'
import { getOperationalPeriod } from '../../lib/helpers'
import { displayBranchName } from '../../lib/branchUtils'

type Filter = 'all' | 'pending' | 'approved' | 'rejected' | 'without_invoice' | 'missing_proof' | 'pending_upload'
function statusOf(t: any) { return String(t.status || t.review_status || 'pending_approval').toLowerCase() }
function isApproved(t: any) { return ['approved','completed','countable','تم الاعتماد'].includes(statusOf(t)) }
function isRejected(t: any) { return ['rejected','مرفوض'].includes(statusOf(t)) }
function isPending(t: any) { return !isApproved(t) && !isRejected(t) }
function hasProof(t: any) { return Boolean(t.proof_image_url || t.attachment_url || t.image_url || t.receipt_url) }
function isProofPendingUpload(t: any) { return t.proof_review_status === 'pending_upload' || t.evidence_status === 'pending_upload' }
function hasInvoice(t: any) { return Boolean(t.has_invoice_reference || t.related_invoice_number || t.invoice_number) }
function tripDate(t: any) { return String(t.work_date || t.trip_date || t.created_at || '').slice(0, 10) }
function proofUrl(t: any) { return t.proof_image_url || t.attachment_url || t.image_url || t.receipt_url || '' }

export default function TripsOps() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [trips, setTrips] = useState<any[]>([])
  const [riders, setRiders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [riderId, setRiderId] = useState('all')
  const [q, setQ] = useState('')

  async function load() {
    setLoading(true)
    try {
      const [t, r] = await Promise.all([
        supabase.from('internal_trips').select('*').gte('work_date', period.start).lte('work_date', period.end).order('work_date', { ascending: false }).limit(10000),
        supabase.from('riders').select('*').order('name'),
      ])
      if (t.error) throw t.error
      setTrips(t.data || [])
      setRiders(r.data || [])
    } catch (e: any) { toast.error(e?.message || 'فشل تحميل المشاوير') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const riderMap = useMemo(() => new Map(riders.map(r => [r.id, r])), [riders])
  const visible = trips.filter(t => {
    const r = riderMap.get(t.rider_id)
    const f = filter === 'all' || (filter === 'pending' && isPending(t)) || (filter === 'approved' && isApproved(t)) || (filter === 'rejected' && isRejected(t)) || (filter === 'without_invoice' && !hasInvoice(t)) || (filter === 'missing_proof' && !hasInvoice(t) && !hasProof(t)) || (filter === 'pending_upload' && isProofPendingUpload(t))
    const riderOk = riderId === 'all' || t.rider_id === riderId
    const searchOk = !q || [r?.name, t.reason, t.from_label, t.to_label, t.related_invoice_number].some(x => String(x || '').includes(q))
    return f && riderOk && searchOk
  })
  const counts = { all: trips.length, pending: trips.filter(isPending).length, approved: trips.filter(isApproved).length, rejected: trips.filter(isRejected).length, without_invoice: trips.filter(t => !hasInvoice(t)).length, missing_proof: trips.filter(t => !hasInvoice(t) && !hasProof(t)).length, pending_upload: trips.filter(isProofPendingUpload).length }
  async function updateStatus(t: any, status: string) {
    const { error } = await supabase.from('internal_trips').update({ status, review_status: status, reviewed_at: new Date().toISOString() }).eq('id', t.id)
    if (error) return toast.error(error.message)
    toast.success(status === 'approved' ? 'تم اعتماد المشوار' : 'تم رفض المشوار')
    await load()
  }
  const chip = (k: Filter, l: string) => <button onClick={() => setFilter(k)} className={`rounded-xl px-3 py-2 text-xs font-black ${filter === k ? 'bg-[#008E92] text-white' : 'bg-white text-slate-600 border'}`}>{l} {counts[k]}</button>
  return <div className="min-h-screen bg-[#F3F7F8] p-4 text-right" dir="rtl"><div className="mx-auto max-w-7xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-sm"><button onClick={() => navigate('/admin')} className="rounded-2xl bg-slate-100 px-4 py-2 font-black text-slate-600"><ArrowLeft size={16} className="inline"/> رجوع</button><div><h1 className="text-2xl font-black text-[#061827]">إدارة المشاوير الفعلية</h1><p className="text-xs font-bold text-slate-400">من {period.start} إلى {period.end} — اعتماد ورفض ومراجعة الإثبات</p></div><button onClick={load} className="rounded-2xl bg-[#008E92] px-4 py-2 font-black text-white"><RefreshCw size={16} className={loading ? 'inline animate-spin' : 'inline'}/> تحديث</button></header>
    <section className="flex flex-wrap gap-2">{chip('all','الكل')}{chip('pending','مستني')}{chip('approved','معتمد')}{chip('rejected','مرفوض')}{chip('without_invoice','بدون فاتورة')}{chip('missing_proof','بدون إثبات')}{chip('pending_upload','إثبات معلق')}</section>
    <section className="grid gap-2 rounded-3xl border bg-white p-4 shadow-sm md:grid-cols-3"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث بالسبب/الدليفري/من/إلى" className="rounded-2xl border px-4 py-3 font-bold"/><select value={riderId} onChange={e=>setRiderId(e.target.value)} className="rounded-2xl border px-4 py-3 font-bold"><option value="all">كل الدليفري</option>{riders.map(r => <option key={r.id} value={r.id}>{r.name || r.username}</option>)}</select><div className="rounded-2xl bg-amber-50 px-4 py-3 text-xs font-black text-amber-700">مشوار المورد/المخزن بدون فاتورة لازم له صورة إثبات</div></section>
    <section className="grid gap-3 lg:grid-cols-2">{visible.map(t => { const r = riderMap.get(t.rider_id); const url = proofUrl(t); return <article key={t.id} className={`rounded-3xl border bg-white p-4 shadow-sm ${!hasInvoice(t) && !hasProof(t) ? 'border-rose-200' : ''}`}><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-[#061827]">{r?.name || 'دليفري غير محدد'}</h2><p className="text-xs font-bold text-slate-400">{displayBranchName(r?.branch_name)} · {tripDate(t)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${isApproved(t) ? 'bg-emerald-50 text-emerald-700' : isRejected(t) ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{isApproved(t) ? 'معتمد' : isRejected(t) ? 'مرفوض' : 'مستني اعتماد'}</span></div><div className="mt-3 rounded-2xl bg-slate-50 p-3"><p className="font-black">{t.from_label || '—'} ← {t.to_label || '—'}</p><p className="mt-1 text-sm text-slate-600">{t.reason || 'بدون سبب'}</p>{t.related_invoice_number && <p className="mt-1 text-xs font-bold text-slate-400">فاتورة: {t.related_invoice_number}</p>}</div><div className="mt-3 flex flex-wrap gap-2">{!hasInvoice(t) && <span className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">بدون فاتورة</span>}{isProofPendingUpload(t) && <span className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700">إثبات صورة معلق</span>}{url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-xl bg-sky-50 px-3 py-2 text-xs font-black text-sky-700"><Eye size={14}/> فتح الإثبات</a> : <span className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">لا يوجد إثبات</span>}{isPending(t) && <><button onClick={() => updateStatus(t, 'approved')} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"><CheckCircle2 size={14}/> اعتماد</button><button onClick={() => updateStatus(t, 'rejected')} className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white"><XCircle size={14}/> رفض</button></>}</div></article> })}{!loading && !visible.length && <div className="rounded-3xl bg-white p-12 text-center font-black text-slate-400 lg:col-span-2">لا توجد مشاوير بهذا الفلتر</div>}</section>
  </div></div>
}
