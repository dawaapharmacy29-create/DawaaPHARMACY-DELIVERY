import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, Search, Clock, MapPin, Eye, Camera, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'
import { InternalTrip, Rider } from '../../lib/types'
import { getRiders, approveTrip, rejectTrip } from '../../lib/delivery'
import { formatTime, getOperationalPeriod } from '../../lib/helpers'
import { supabase } from '../../lib/supabase'

type TripAuditRow = InternalTrip & {
  rider_name?: string | null
  branch_name?: string | null
  proof_required?: boolean | null
  proof_image_url?: string | null
  proof_note?: string | null
  proof_captured_at?: string | null
  proof_uploaded_at?: string | null
  proof_source?: string | null
  proof_review_status?: string | null
  evidence_status?: string | null
  proof_exception_status?: string | null
  proof_exception_reason?: string | null
  audit_status?: string | null
  created_at?: string | null
}

const tripLabels: Record<string, string> = {
  branch_to_branch: 'بين الفروع',
  warehouse: 'مخزن',
  supplies: 'مستلزمات',
  pharmacy: 'صيدلية',
  shipment_pickup: 'استلام شحن',
  accessories: 'إكسسوار',
  purchase_missing_item: 'شراء نواقص',
  supplier: 'مورد',
  returns: 'مرتجع',
  collection: 'تحصيل',
  visit_again: 'زيارة تانية',
  other: 'أخرى'
}

const statusLabels: Record<string, string> = {
  pending_approval: 'مستني اعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
  completed: 'تم',
  cancelled: 'ملغي'
}

const auditLabels: Record<string, string> = {
  all: 'كل المشاوير',
  with_photo: 'بصورة كاميرا',
  without_photo: 'بدون صورة',
  exception: 'استثناء بدون صورة',
  pending_upload: 'إثبات صورة معلق',
  old_without_proof: 'قديم بلا إثبات',
  pending_approval: 'مستني اعتماد',
  missing_required_photo: 'صورة مطلوبة ومفقودة',
  photo_without_capture_time: 'صورة بدون توقيت',
  ok: 'سليم'
}

type AuditFilter = keyof typeof auditLabels

function statusClass(status?: string | null) {
  if (status === 'approved' || status === 'completed') return 'bg-emerald-100 text-emerald-700'
  if (status === 'rejected') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

function proofUrl(trip: TripAuditRow) {
  return String(trip.proof_image_url || '').trim()
}

function isOldWithoutProof(trip: TripAuditRow) {
  return trip.proof_required === false && !proofUrl(trip) && trip.proof_exception_status !== 'pending'
}

function tripAuditBadges(trip: TripAuditRow) {
  const badges: { label: string; cls: string }[] = []
  if (proofUrl(trip)) badges.push({ label: 'صورة كاميرا', cls: 'bg-emerald-50 text-emerald-700' })
  if (trip.proof_review_status === 'pending_upload' || trip.evidence_status === 'pending_upload') badges.push({ label: 'إثبات صورة معلق', cls: 'bg-amber-50 text-amber-700' })
  if (!proofUrl(trip) && trip.proof_exception_status !== 'pending') badges.push({ label: 'بدون صورة', cls: 'bg-rose-50 text-rose-700' })
  if (trip.proof_exception_status === 'pending') badges.push({ label: 'بدون صورة - يحتاج مراجعة', cls: 'bg-amber-50 text-amber-700' })
  if (isOldWithoutProof(trip)) badges.push({ label: 'قديم بلا إثبات', cls: 'bg-slate-100 text-slate-600' })
  if (trip.audit_status === 'photo_without_capture_time') badges.push({ label: 'صورة بدون توقيت', cls: 'bg-orange-50 text-orange-700' })
  if (!trip.has_invoice_reference && !trip.related_invoice_number) badges.push({ label: 'بدون فاتورة', cls: 'bg-blue-50 text-blue-700' })
  return badges
}

function matchesAuditFilter(trip: TripAuditRow, filter: AuditFilter) {
  if (filter === 'all') return true
  if (filter === 'with_photo') return Boolean(proofUrl(trip))
  if (filter === 'without_photo') return !proofUrl(trip)
  if (filter === 'exception') return trip.proof_exception_status === 'pending'
  if (filter === 'pending_upload') return trip.proof_review_status === 'pending_upload' || trip.evidence_status === 'pending_upload'
  if (filter === 'old_without_proof') return isOldWithoutProof(trip)
  if (filter === 'pending_approval') return trip.status === 'pending_approval' || trip.audit_status === 'pending_approval'
  return trip.audit_status === filter
}

function displayDate(value?: string | null) {
  if (!value) return '—'
  try { return new Date(value).toLocaleString('ar-EG') } catch { return value }
}

export default function Trips() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [trips, setTrips] = useState<TripAuditRow[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending_approval' | 'approved' | 'rejected'>('all')
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all')
  const [filterType, setFilterType] = useState('all')
  const [filterRider, setFilterRider] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [rejectModal, setRejectModal] = useState<{ trip: TripAuditRow } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [selectedTrip, setSelectedTrip] = useState<TripAuditRow | null>(null)

  useEffect(() => { void loadAll() }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [tripsResult, ridersResult] = await Promise.allSettled([
        supabase
          .from('internal_trip_daily_audit')
          .select('*')
          .gte('trip_date', period.start)
          .lte('trip_date', period.end)
          .order('registered_at', { ascending: false })
          .limit(1200),
        getRiders()
      ])
      if (tripsResult.status === 'fulfilled') {
        if (tripsResult.value.error) throw tripsResult.value.error
        setTrips((tripsResult.value.data || []) as TripAuditRow[])
      }
      if (ridersResult.status === 'fulfilled') setRiders(ridersResult.value)
    } catch (error) {
      console.error(error)
      toast.error('فشل تحميل بيانات المشاوير')
    } finally {
      setLoading(false)
    }
  }

  const riderMap = new Map(riders.map(r => [r.id, r]))
  const activeRiders = riders.filter(r => trips.some(t => t.rider_id === r.id))

  const counts = useMemo(() => ({
    all: trips.length,
    with_photo: trips.filter(t => Boolean(proofUrl(t))).length,
    without_photo: trips.filter(t => !proofUrl(t)).length,
    exception: trips.filter(t => t.proof_exception_status === 'pending').length,
    pending_upload: trips.filter(t => t.proof_review_status === 'pending_upload' || t.evidence_status === 'pending_upload').length,
    old_without_proof: trips.filter(isOldWithoutProof).length,
    pending_approval: trips.filter(t => t.status === 'pending_approval' || t.audit_status === 'pending_approval').length,
    missing_required_photo: trips.filter(t => t.audit_status === 'missing_required_photo').length,
    photo_without_capture_time: trips.filter(t => t.audit_status === 'photo_without_capture_time').length,
    ok: trips.filter(t => t.audit_status === 'ok').length,
  }), [trips])

  const dailyExceptions = trips.filter(t => t.proof_exception_status === 'pending').slice(0, 8)

  const filteredTrips = trips.filter(trip => {
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter
    const matchesAudit = matchesAuditFilter(trip, auditFilter)
    const matchesType = filterType === 'all' || trip.trip_type === filterType
    const matchesRider = filterRider === 'all' || trip.rider_id === filterRider
    const riderName = trip.rider_name || riderMap.get(trip.rider_id)?.name || ''
    const q = searchTerm.trim()
    const matchesSearch = !q ||
      trip.reason?.includes(q) ||
      riderName.includes(q) ||
      trip.branch_name?.includes(q) ||
      trip.from_label?.includes(q) ||
      trip.to_label?.includes(q) ||
      trip.related_invoice_number?.includes(q)
    return matchesStatus && matchesAudit && matchesType && matchesRider && matchesSearch
  })

  async function handleApprove(trip: TripAuditRow) {
    try {
      setActionLoading(trip.id)
      await approveTrip(trip.id)
      toast.success('✅ تم اعتماد المشوار')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('تعذر اعتماد المشوار')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRejectConfirm() {
    if (!rejectModal) return
    if (!rejectReason.trim()) { toast.error('اكتب سبب الرفض'); return }
    try {
      setActionLoading(rejectModal.trip.id)
      await rejectTrip(rejectModal.trip.id, rejectReason.trim())
      toast.success('تم رفض المشوار')
      setRejectModal(null)
      setRejectReason('')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('تعذر رفض المشوار')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent" />
          <p className="mt-3 font-bold text-slate-600">بنحمل المشاوير...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8]" dir="rtl">
      <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <button onClick={() => navigate('/admin')} className="rounded-xl bg-white/10 p-2 hover:bg-white/20"><ArrowLeft size={22} /></button>
          <img src="/logo.png" className="h-10 w-10 rounded-xl bg-white object-contain p-1" alt="دواء" />
          <div>
            <h1 className="text-xl font-black">إدارة ورقابة المشاوير</h1>
            <p className="text-xs text-teal-100">الدورة {period.start} → {period.end} · {counts.pending_approval} مشوار مستني اعتماد · {counts.pending_upload} إثبات صورة معلق</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 space-y-4">
        <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <StatButton label="كل المشاوير" value={counts.all} active={auditFilter === 'all'} onClick={() => setAuditFilter('all')} />
          <StatButton label="بصورة" value={counts.with_photo} active={auditFilter === 'with_photo'} onClick={() => setAuditFilter('with_photo')} tone="emerald" />
          <StatButton label="بدون صورة" value={counts.without_photo} active={auditFilter === 'without_photo'} onClick={() => setAuditFilter('without_photo')} tone="rose" />
          <StatButton label="إثبات معلق" value={counts.pending_upload} active={auditFilter === 'pending_upload'} onClick={() => setAuditFilter('pending_upload')} tone="amber" />
          <StatButton label="استثناء" value={counts.exception} active={auditFilter === 'exception'} onClick={() => setAuditFilter('exception')} tone="amber" />
          <StatButton label="قديم بلا إثبات" value={counts.old_without_proof} active={auditFilter === 'old_without_proof'} onClick={() => setAuditFilter('old_without_proof')} tone="slate" />
          <StatButton label="مستني اعتماد" value={counts.pending_approval} active={auditFilter === 'pending_approval'} onClick={() => setAuditFilter('pending_approval')} tone="sky" />
        </section>

        {dailyExceptions.length > 0 && (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-3 flex items-center gap-2 font-black text-amber-900"><AlertTriangle size={18} /> استثناءات بدون صورة تحتاج مراجعة يومية</div>
            <div className="grid gap-3 lg:grid-cols-2">
              {dailyExceptions.map(trip => <TripMini key={trip.id} trip={trip} riderName={trip.rider_name || riderMap.get(trip.rider_id)?.name || 'دليفري غير محدد'} onView={() => setSelectedTrip(trip)} />)}
            </div>
          </section>
        )}

        <section className="rounded-3xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap gap-2">
            {(['all', 'pending_approval', 'approved', 'rejected'] as const).map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${statusFilter === f ? 'bg-[#008E92] text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                {f === 'all' ? `كل الحالات` : f === 'pending_approval' ? 'مستني' : f === 'approved' ? 'معتمد' : 'مرفوض'}
              </button>
            ))}
          </div>

          <div className="grid gap-2 lg:grid-cols-[1fr_220px_220px]">
            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="ابحث باسم الدليفري أو الفرع أو السبب أو رقم الفاتورة..." className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pr-9 pl-4 text-sm focus:border-[#008E92] focus:outline-none" />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold focus:border-[#008E92] focus:outline-none">
              <option value="all">كل الأنواع</option>
              {Object.entries(tripLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filterRider} onChange={e => setFilterRider(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold focus:border-[#008E92] focus:outline-none">
              <option value="all">كل الدليفري</option>
              {activeRiders.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </section>

        {filteredTrips.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm"><MapPin size={40} className="mx-auto text-slate-200 mb-3" /><p className="font-bold text-slate-400">لا توجد مشاوير لهذا الفلتر</p></div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {filteredTrips.map(trip => {
              const riderName = trip.rider_name || riderMap.get(trip.rider_id)?.name || 'دليفري غير محدد'
              const isPending = trip.status === 'pending_approval'
              return (
                <article key={trip.id} className="rounded-3xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-[#061827]">{riderName}</span>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{tripLabels[trip.trip_type] || trip.trip_type}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusClass(trip.status)}`}>{statusLabels[trip.status] || trip.status}</span>
                        {tripAuditBadges(trip).map(b => <span key={b.label} className={`rounded-full px-2 py-0.5 text-xs font-bold ${b.cls}`}>{b.label}</span>)}
                      </div>
                      <div className="mt-2 text-sm text-slate-700"><b>{trip.from_label}</b> <span>→</span> <b>{trip.to_label}</b></div>
                      <p className="mt-1 text-sm text-slate-500">{trip.reason || 'بدون سبب تفصيلي'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400"><span className="inline-flex items-center gap-1"><Clock size={12} />{formatTime(trip.registered_at)}</span>{trip.related_invoice_number && <span>فاتورة: {trip.related_invoice_number}</span>}</div>
                    </div>
                    <button onClick={() => setSelectedTrip(trip)} className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><Eye size={14} /> عين</button>
                  </div>
                  {proofUrl(trip) && <img src={proofUrl(trip)} alt="إثبات المشوار" className="mt-3 h-40 w-full rounded-2xl border object-cover" />}
                  {isPending && <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => handleApprove(trip)} disabled={actionLoading === trip.id} className="flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={14} /> اعتماد</button><button onClick={() => { setRejectModal({ trip }); setRejectReason('') }} disabled={actionLoading === trip.id} className="flex items-center justify-center gap-1 rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white hover:bg-rose-600 disabled:opacity-50"><XCircle size={14} /> رفض</button></div>}
                  {trip.rejection_reason && <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">سبب الرفض: {trip.rejection_reason}</div>}
                </article>
              )
            })}
          </div>
        )}
      </main>

      {selectedTrip && <TripDetailsModal trip={selectedTrip} riderName={selectedTrip.rider_name || riderMap.get(selectedTrip.rider_id)?.name || 'دليفري غير محدد'} onClose={() => setSelectedTrip(null)} onApprove={() => handleApprove(selectedTrip)} onReject={() => { setRejectModal({ trip: selectedTrip }); setRejectReason('') }} />}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" dir="rtl">
            <h2 className="mb-1 text-xl font-black text-[#061827]">رفض المشوار</h2>
            <p className="mb-4 text-sm text-slate-500">{rejectModal.trip.rider_name || riderMap.get(rejectModal.trip.rider_id)?.name} — {rejectModal.trip.from_label} → {rejectModal.trip.to_label}</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="اكتب سبب الرفض بالتفصيل..." rows={3} className="w-full resize-none rounded-2xl border border-slate-200 p-3 text-sm focus:border-rose-500 focus:outline-none" />
            <div className="mt-4 flex gap-3"><button onClick={handleRejectConfirm} disabled={!rejectReason.trim() || actionLoading !== null} className="flex-1 rounded-2xl bg-rose-500 py-3 font-black text-white hover:bg-rose-600 disabled:opacity-50">تأكيد الرفض</button><button onClick={() => setRejectModal(null)} className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-600 hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatButton({ label, value, active, onClick, tone = 'teal' }: { label: string; value: number; active: boolean; onClick: () => void; tone?: 'teal' | 'emerald' | 'rose' | 'amber' | 'slate' | 'sky' }) {
  const activeCls = tone === 'emerald' ? 'bg-emerald-600 text-white' : tone === 'rose' ? 'bg-rose-600 text-white' : tone === 'amber' ? 'bg-amber-500 text-white' : tone === 'sky' ? 'bg-sky-600 text-white' : tone === 'slate' ? 'bg-slate-700 text-white' : 'bg-[#008E92] text-white'
  return <button onClick={onClick} className={`rounded-3xl p-4 text-center shadow-sm transition ${active ? activeCls : 'bg-white text-slate-600 hover:bg-slate-50'}`}><p className="text-xs font-black opacity-80">{label}</p><b className="mt-1 block text-2xl">{value.toLocaleString('ar-EG')}</b></button>
}

function TripMini({ trip, riderName, onView }: { trip: TripAuditRow; riderName: string; onView: () => void }) {
  return <button onClick={onView} className="rounded-2xl bg-white p-3 text-right shadow-sm"><b className="block text-sm text-slate-700">{riderName}</b><p className="mt-1 text-xs font-bold text-slate-500">{trip.from_label} → {trip.to_label}</p><p className="mt-1 text-[11px] font-bold text-amber-700">{trip.proof_exception_reason || 'استثناء بدون صورة'}</p></button>
}

function TripDetailsModal({ trip, riderName, onClose, onApprove, onReject }: { trip: TripAuditRow; riderName: string; onClose: () => void; onApprove: () => void; onReject: () => void }) {
  const isPending = trip.status === 'pending_approval'
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onMouseDown={onClose}><div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" dir="rtl" onMouseDown={e => e.stopPropagation()}><div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-black text-[#008E92]">تفاصيل المشوار</p><h2 className="text-2xl font-black text-[#061827]">{riderName}</h2></div><button onClick={onClose} className="rounded-xl bg-slate-100 p-2"><X size={18} /></button></div><div className="grid gap-3 md:grid-cols-2"><Info label="النوع" value={tripLabels[trip.trip_type] || trip.trip_type} /><Info label="الحالة" value={statusLabels[trip.status] || trip.status} /><Info label="من" value={trip.from_label || '—'} /><Info label="إلى" value={trip.to_label || '—'} /><Info label="السبب" value={trip.reason || '—'} wide /><Info label="الفاتورة" value={trip.related_invoice_number || 'بدون فاتورة'} /><Info label="وقت التسجيل" value={displayDate(trip.registered_at || trip.created_at)} /><Info label="وقت التصوير" value={displayDate(trip.proof_captured_at)} /><Info label="وقت الرفع" value={displayDate(trip.proof_uploaded_at)} /><Info label="مصدر الإثبات" value={trip.proof_source || '—'} /><Info label="استثناء بدون صورة" value={trip.proof_exception_reason || 'لا يوجد'} wide /></div><div className="mt-4 rounded-2xl border bg-slate-50 p-4"><div className="mb-3 flex items-center gap-2 font-black"><Camera size={18} /> صورة الإثبات</div>{proofUrl(trip) ? <img src={proofUrl(trip)} alt="إثبات المشوار" className="max-h-[520px] w-full rounded-2xl bg-white object-contain" /> : <p className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700">لا توجد صورة إثبات لهذا المشوار</p>}</div>{isPending && <div className="mt-4 grid grid-cols-2 gap-3"><button onClick={onApprove} className="rounded-2xl bg-emerald-500 py-3 font-black text-white">اعتماد المشوار</button><button onClick={onReject} className="rounded-2xl bg-rose-500 py-3 font-black text-white">رفض المشوار</button></div>}</div></div>
}

function Info({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return <div className={`rounded-2xl bg-slate-50 p-3 ${wide ? 'md:col-span-2' : ''}`}><p className="text-[11px] font-black text-slate-400">{label}</p><div className="mt-1 text-sm font-bold text-slate-700">{value}</div></div>
}
