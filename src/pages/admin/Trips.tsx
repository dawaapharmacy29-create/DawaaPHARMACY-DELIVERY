import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, Search, Clock, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { InternalTrip, Rider } from '../../lib/types'
import { getTodayTrips, getRiders, approveTrip, rejectTrip } from '../../lib/delivery'
import { formatTime } from '../../lib/helpers'

const tripLabels: Record<InternalTrip['trip_type'], string> = {
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

const statusLabels: Record<InternalTrip['status'], string> = {
  pending_approval: 'مستني اعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
  completed: 'تم',
  cancelled: 'ملغي'
}

function statusClass(status: InternalTrip['status']) {
  if (status === 'approved' || status === 'completed') return 'bg-emerald-100 text-emerald-700'
  if (status === 'rejected') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

export default function Trips() {
  const navigate = useNavigate()
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending_approval' | 'approved' | 'rejected'>('all')
  const [filterType, setFilterType] = useState('all')
  const [filterRider, setFilterRider] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [rejectModal, setRejectModal] = useState<{ trip: InternalTrip } | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [tripsData, ridersData] = await Promise.allSettled([
        getTodayTrips(),
        getRiders()
      ])
      if (tripsData.status === 'fulfilled') setTrips(tripsData.value)
      if (ridersData.status === 'fulfilled') setRiders(ridersData.value)
    } catch (error) {
      console.error(error)
      toast.error('فشل تحميل بيانات المشاوير')
    } finally {
      setLoading(false)
    }
  }

  const riderMap = new Map(riders.map(r => [r.id, r]))
  const filteredTrips = trips.filter(trip => {
    const matchesFilter = filter === 'all' || trip.status === filter
    const matchesType = filterType === 'all' || trip.trip_type === filterType
    const matchesRider = filterRider === 'all' || trip.rider_id === filterRider
    const riderName = riderMap.get(trip.rider_id)?.name || ''
    const matchesSearch = !searchTerm ||
      trip.reason?.includes(searchTerm) ||
      riderName.includes(searchTerm) ||
      trip.from_label?.includes(searchTerm) ||
      trip.to_label?.includes(searchTerm)
    return matchesFilter && matchesType && matchesRider && matchesSearch
  })

  const activeRiders = riders.filter(r => trips.some(t => t.rider_id === r.id))

  async function handleApprove(trip: InternalTrip) {
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

  const pendingCount = trips.filter(t => t.status === 'pending_approval').length

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
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <button onClick={() => navigate('/admin')} className="rounded-xl bg-white/10 p-2 hover:bg-white/20">
            <ArrowLeft size={22} />
          </button>
          <img src="/dawaa-logo.jpeg" className="h-10 w-10 rounded-xl bg-white object-contain p-1" alt="دواء" />
          <div>
            <h1 className="text-xl font-black">إدارة المشاوير</h1>
            <p className="text-xs text-teal-100">
              {pendingCount > 0 ? `${pendingCount} مشوار مستني اعتماد` : 'جميع المشاوير تمت مراجعتها'}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-4">
        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'pending_approval', 'approved', 'rejected'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                filter === f
                  ? 'bg-[#008E92] text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {f === 'all' ? `الكل (${trips.length})` :
               f === 'pending_approval' ? `مستني (${trips.filter(t => t.status === 'pending_approval').length})` :
               f === 'approved' ? 'معتمد' : 'مرفوض'}
            </button>
          ))}
        </div>

        {/* Search + Extra Filters */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="ابحث باسم الدليفري أو السبب..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pr-9 pl-4 text-sm focus:border-[#008E92] focus:outline-none"
            />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold focus:border-[#008E92] focus:outline-none"
          >
            <option value="all">كل الأنواع</option>
            {Object.entries(tripLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterRider}
            onChange={e => setFilterRider(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold focus:border-[#008E92] focus:outline-none"
          >
            <option value="all">كل الدليفري</option>
            {activeRiders.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Trips */}
        {filteredTrips.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm">
            <MapPin size={40} className="mx-auto text-slate-200 mb-3" />
            <p className="font-bold text-slate-400">لا توجد مشاوير</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTrips.map(trip => {
              const rider = riderMap.get(trip.rider_id)
              const isPending = trip.status === 'pending_approval'
              return (
                <div key={trip.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-[#061827]">{rider?.name || 'دليفري غير محدد'}</span>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">
                          {tripLabels[trip.trip_type] || trip.trip_type}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusClass(trip.status)}`}>
                          {statusLabels[trip.status]}
                        </span>
                        {!trip.has_invoice_reference && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">بدون فاتورة</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 text-sm text-slate-600">
                        <span className="font-bold">{trip.from_label}</span>
                        <span>→</span>
                        <span className="font-bold">{trip.to_label}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{trip.reason}</p>
                      {trip.related_invoice_number && (
                        <p className="mt-0.5 text-xs text-slate-400">فاتورة: {trip.related_invoice_number}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-400">
                        <Clock size={12} />
                        <span>{formatTime(trip.registered_at)}</span>
                      </div>
                    </div>
                    {isPending && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleApprove(trip)}
                          disabled={actionLoading === trip.id}
                          className="flex items-center gap-1 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} />
                          اعتماد
                        </button>
                        <button
                          onClick={() => { setRejectModal({ trip }); setRejectReason('') }}
                          disabled={actionLoading === trip.id}
                          className="flex items-center gap-1 rounded-xl bg-rose-500 px-3 py-2 text-xs font-bold text-white hover:bg-rose-600 disabled:opacity-50"
                        >
                          <XCircle size={14} />
                          رفض
                        </button>
                      </div>
                    )}
                  </div>
                  {trip.rejection_reason && (
                    <div className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700 font-bold">
                      سبب الرفض: {trip.rejection_reason}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" dir="rtl">
            <h2 className="mb-1 text-xl font-black text-[#061827]">رفض المشوار</h2>
            <p className="mb-4 text-sm text-slate-500">
              {riderMap.get(rejectModal.trip.rider_id)?.name} — {rejectModal.trip.from_label} → {rejectModal.trip.to_label}
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="اكتب سبب الرفض بالتفصيل..."
              rows={3}
              className="w-full rounded-2xl border border-slate-200 p-3 text-sm focus:border-rose-500 focus:outline-none resize-none"
            />
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleRejectConfirm}
                disabled={!rejectReason.trim() || actionLoading !== null}
                className="flex-1 rounded-2xl bg-rose-500 py-3 font-black text-white hover:bg-rose-600 disabled:opacity-50"
              >
                تأكيد الرفض
              </button>
              <button
                onClick={() => setRejectModal(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 font-bold text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
