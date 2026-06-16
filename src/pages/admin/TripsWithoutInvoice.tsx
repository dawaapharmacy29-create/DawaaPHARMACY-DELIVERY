import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { InternalTrip } from '../../lib/types'
import { getTripsWithoutInvoice, approveTrip, rejectTrip } from '../../lib/delivery'

export default function TripsWithoutInvoice() {
  const navigate = useNavigate()
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  async function loadTrips() {
    try {
      setLoading(true)
      const data = await getTripsWithoutInvoice()
      setTrips(data)
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
  }, [])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-lg font-black text-slate-700">بنحمل بيانات المشاوير...</div>
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8] p-4">
      <header className="mb-6 flex items-center gap-4">
        <button onClick={() => navigate('/admin')} className="rounded-2xl bg-white p-3 hover:bg-slate-100">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="text-2xl font-black">مشاوير بدون فاتورة</h1>
          <p className="text-sm text-slate-500">المشاوير اللي محتاجة مراجعة عشان مفيش فاتورة مرتبطة بيها</p>
        </div>
      </header>

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
