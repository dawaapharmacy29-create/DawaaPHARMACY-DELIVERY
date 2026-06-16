import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, XCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { DeliveryOrder, Rider } from '../../lib/types'
import { getTodayOrders, getRiders, approveDuplicateInvoice, rejectDuplicateInvoice } from '../../lib/delivery'
import { formatTime } from '../../lib/helpers'

export default function DuplicateInvoices() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    try {
      setLoading(true)
      const [ordersData, ridersData] = await Promise.allSettled([
        getTodayOrders(),
        getRiders()
      ])
      
      if (ordersData.status === 'fulfilled') {
        const duplicateOrders = ordersData.value.filter(o => o.is_duplicate_invoice)
        setOrders(duplicateOrders)
      }
      if (ridersData.status === 'fulfilled') {
        setRiders(ridersData.value)
      }
    } catch (error) {
      console.error(error)
      toast.error('فشل تحميل بيانات الفواتير المكررة')
    } finally {
      setLoading(false)
    }
  }

  const riderMap = new Map(riders.map(r => [r.id, r]))
  const filteredOrders = orders.filter(order => {
    const matchesFilter = filter === 'all' || order.duplicate_review_status === filter
    const matchesSearch = !searchTerm || 
      order.invoice_number.includes(searchTerm) ||
      order.customer_name_snapshot?.includes(searchTerm) ||
      (riderMap.get(order.rider_id)?.name || '').includes(searchTerm)
    return matchesFilter && matchesSearch
  })

  async function handleApprove(orderId: string) {
    try {
      await approveDuplicateInvoice(orderId)
      toast.success('تم اعتماد الفاتورة المكررة')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('فشل اعتماد الفاتورة')
    }
  }

  async function handleReject(orderId: string) {
    const reason = window.prompt('اكتب سبب الرفض')
    if (!reason?.trim()) {
      toast.error('سبب الرفض مطلوب')
      return
    }
    try {
      await rejectDuplicateInvoice(orderId, reason)
      toast.success('تم رفض الفاتورة المكررة')
      await loadAll()
    } catch (error) {
      console.error(error)
      toast.error('فشل رفض الفاتورة')
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#F3F7F8] p-8 text-center text-lg font-bold">جاري التحميل...</div>
  }

  return (
    <div className="min-h-screen bg-[#F3F7F8] pb-12">
      <header className="bg-gradient-to-l from-[#061827] to-[#008E92] p-4 text-white">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin')} className="rounded-full bg-white/20 p-2 hover:bg-white/30">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-black">إدارة الفواتير المكررة</h1>
            <p className="text-sm text-white/80">مراجعة واعتماد الفواتير المتكررة</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`rounded-full px-4 py-2 text-sm font-black ${
                filter === 'all' ? 'bg-[#008E92] text-white' : 'bg-white text-slate-700'
              }`}
            >
              الكل ({orders.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`rounded-full px-4 py-2 text-sm font-black ${
                filter === 'pending' ? 'bg-amber-500 text-white' : 'bg-white text-slate-700'
              }`}
            >
              قيد المراجعة ({orders.filter(o => o.duplicate_review_status === 'pending').length})
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`rounded-full px-4 py-2 text-sm font-black ${
                filter === 'approved' ? 'bg-emerald-500 text-white' : 'bg-white text-slate-700'
              }`}
            >
              معتمدة ({orders.filter(o => o.duplicate_review_status === 'approved').length})
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`rounded-full px-4 py-2 text-sm font-black ${
                filter === 'rejected' ? 'bg-rose-500 text-white' : 'bg-white text-slate-700'
              }`}
            >
              مرفوضة ({orders.filter(o => o.duplicate_review_status === 'rejected').length})
            </button>
          </div>
          
          <div className="relative">
            <Search className="absolute right-3 top-3 text-slate-400" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث برقم الفاتورة أو اسم العميل أو الدليفري"
              className="dawaa-input pr-10"
            />
          </div>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="rounded-3xl border border-dashed p-8 text-center font-bold text-slate-500">
            {orders.length === 0 ? 'مفيش فواتير مكررة النهارده' : 'مفيش نتائج مطابقة للبحث'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order) => {
              const rider = riderMap.get(order.rider_id)
              return (
                <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-black text-lg">فاتورة {order.invoice_number}</span>
                        <span className={`rounded-full px-2 py-1 text-xs font-black ${
                          order.duplicate_review_status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                          order.duplicate_review_status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {order.duplicate_review_status === 'approved' ? 'معتمدة' :
                           order.duplicate_review_status === 'rejected' ? 'مرفوضة' :
                           'قيد المراجعة'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-slate-500">الدليفري</p>
                          <p className="font-bold">{rider?.name || 'غير محدد'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">العميل</p>
                          <p className="font-bold">{order.customer_name_snapshot || 'غير محدد'}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">تاريخ التسجيل</p>
                          <p className="font-bold">{formatTime(order.registered_at)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500">السبب</p>
                          <p className="font-bold">{order.duplicate_reason || 'غير محدد'}</p>
                        </div>
                      </div>
                      
                      {order.duplicate_note && (
                        <div className="mt-2 rounded-lg bg-slate-50 p-2 text-sm">
                          <p className="text-slate-500">ملاحظة التكرار</p>
                          <p className="font-bold">{order.duplicate_note}</p>
                        </div>
                      )}
                    </div>
                    
                    {order.duplicate_review_status === 'pending' && (
                      <div className="flex gap-2 sm:flex-col">
                        <button
                          onClick={() => handleApprove(order.id)}
                          className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 font-black text-white hover:bg-emerald-600"
                        >
                          <CheckCircle2 size={18} />
                          اعتماد
                        </button>
                        <button
                          onClick={() => handleReject(order.id)}
                          className="flex items-center gap-2 rounded-xl bg-rose-100 px-4 py-2 font-black text-rose-700 hover:bg-rose-200"
                        >
                          <XCircle size={18} />
                          رفض
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
