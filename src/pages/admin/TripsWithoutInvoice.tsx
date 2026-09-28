import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle, FileText, FileQuestion } from 'lucide-react'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import { InternalTrip } from '../../lib/types'
import { getTripsWithoutInvoice, approveTrip, rejectTrip } from '../../lib/delivery'
import OperationsAdminTabs from '../../components/OperationsAdminTabs'
import CycleSelector from '../../components/CycleSelector'
import { getOperationalPeriod } from '../../lib/helpers'

export default function TripsWithoutInvoice() {
  const [searchParams, setSearchParams] = useSearchParams()
  const period = useMemo(() => getOperationalPeriod(), [])
  const selectedFrom = searchParams.get('from') || period.start
  const selectedTo = searchParams.get('to') || period.end
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function loadTrips() {
    try {
      setLoading(true)
      const data = await getTripsWithoutInvoice()
      const filtered = data.filter((trip: any) => {
        const date = String(trip.trip_date || trip.work_date || trip.registered_at || trip.created_at || '').slice(0, 10)
        return date >= selectedFrom && date <= selectedTo
      })
      setTrips(filtered)
    } catch (error) {
      console.error(error)
      toast.error('حصلت مشكلة في تحميل المشاوير')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(trip: InternalTrip) {
    const note = window.prompt('اكتب ملاحظة للموافقة (اختياري)')
    try {
      setActionLoading(trip.id)
      await approveTrip(trip.id, note || undefined)
      toast.success('تمت الموافقة على المشوار')
      await loadTrips()
    } catch (error) {
      console.error(error)
      toast.error('تعذر الموافقة على المشوار')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(trip: InternalTrip) {
    const reason = window.prompt('اكتب سبب الرفض')
    if (!reason?.trim()) {
      toast.error('سبب الرفض مطلوب')
      return
    }
    try {
      setActionLoading(trip.id)
      await rejectTrip(trip.id, reason)
      toast.success('تم رفض المشوار')
      await loadTrips()
    } catch (error) {
      console.error(error)
      toast.error('تعذر رفض المشوار')
    } finally {
      setActionLoading(null)
    }
  }

  useEffect(() => {
    void loadTrips()
  }, [selectedFrom, selectedTo])

  function applyCycle(from: string, to: string) {
    const next = new URLSearchParams(searchParams)
    next.set('from', from)
    next.set('to', to)
    setSearchParams(next, { replace: true })
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-lg font-black text-slate-700">بنحمل بيانات المشاوير...</div>
  }

  return (
    <div className="min-h-screen space-y-4 bg-[#F3F7F8] p-4" dir="rtl">
      <OperationsAdminTabs />
      <CycleSelector from={selectedFrom} to={selectedTo} onApply={applyCycle} />
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><FileQuestion size={20}/></span>
          <div><p className="text-xs font-black text-[#008E92]">التشغيل والمراجعة</p><h1 className="mt-1 text-xl font-black text-[#061827]">مشاوير بدون فاتورة</h1><p className="mt-1 text-sm font-bold text-slate-500">الحالات التي تحتاج قرارًا إداريًا لعدم وجود مرجع فاتورة مرتبط بالمشوار.</p></div>
        </div>
      </section>

      {trips.length === 0 ? (
        <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-500" />
          <h2 className="mt-4 text-xl font-black">مفيش مشاوير بدون فاتورة</h2>
          <p className="mt-2 text-slate-500">كل المشاوير عندها فاتورة مرتبطة أو اتعرضت</p>
        </div>
      ) : (
        <div className="space-y-4">
          {trips.map((trip) => (
            <div key={trip.id} className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
                      {trip.status === 'pending_approval' ? 'مستني مراجعة' : trip.status}
                    </span>
                    <span className="text-xs text-slate-500">{new Date(trip.registered_at).toLocaleString('ar-EG')}</span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText size={18} className="text-slate-400" />
                      <span className="font-semibold">{trip.trip_type === 'warehouse' ? 'المخزن' : trip.trip_type === 'branch_to_branch' ? 'بين الفروع' : trip.trip_type}</span>
                    </div>
                    
                    <p className="text-sm text-slate-600">
                      من: <span className="font-semibold">{trip.from_label || 'غير محدد'}</span>
                    </p>
                    <p className="text-sm text-slate-600">
                      إلى: <span className="font-semibold">{trip.to_label || 'غير محدد'}</span>
                    </p>
                    <p className="text-sm text-slate-600">
                      السبب: <span className="font-semibold">{trip.reason}</span>
                    </p>
                    
                    {trip.notes && (
                      <p className="text-sm text-slate-500">
                        ملاحظات: {trip.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => void handleApprove(trip)}
                    disabled={actionLoading === trip.id}
                    className="rounded-2xl bg-emerald-500 p-3 text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    <CheckCircle2 size={20} />
                  </button>
                  <button
                    onClick={() => void handleReject(trip)}
                    disabled={actionLoading === trip.id}
                    className="rounded-2xl bg-rose-500 p-3 text-white hover:bg-rose-600 disabled:opacity-50"
                  >
                    <XCircle size={20} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
