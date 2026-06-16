import { useEffect, useState } from 'react'
import { Wifi, WifiOff, RefreshCw, AlertTriangle, Trash2 } from 'lucide-react'
import {
  flushOfflineQueue,
  offlineQueueCount,
  offlineQueueDeadCount,
  clearDeadItems,
  setupOfflineQueueAutoFlush,
} from '../lib/offlineQueue'
import { toast } from 'sonner'

export default function ConnectivitySyncBanner() {
  const [online,  setOnline]  = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [pending, setPending] = useState(() => offlineQueueCount())
  const [dead,    setDead]    = useState(() => offlineQueueDeadCount())
  const [syncing, setSyncing] = useState(false)

  function refreshCounts() {
    setPending(offlineQueueCount())
    setDead(offlineQueueDeadCount())
  }

  async function syncNow() {
    if (!navigator.onLine) { toast.error('لا يوجد اتصال بالإنترنت حالياً'); return }
    setSyncing(true)
    try {
      const res = await flushOfflineQueue()
      refreshCounts()
      if (res.synced)    toast.success(`✅ تم رفع ${res.synced} عملية محفوظة`)
      else if (!res.remaining) toast.info('لا توجد عمليات معلقة')
      if (res.dead > 0)  toast.warning(`⚠️ ${res.dead} عملية فشلت نهائيًا — تقدر تمسحها`)
    } catch (e: any) {
      toast.error(e?.message || 'فشل المزامنة')
    } finally {
      setSyncing(false)
    }
  }

  function handleClearDead() {
    clearDeadItems()
    refreshCounts()
    toast.info('تم مسح العمليات الفاشلة')
  }

  useEffect(() => {
    const onOnline  = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onChange  = () => refreshCounts()

    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('dawaa-offline-queue-change', onChange as EventListener)

    const cleanup = setupOfflineQueueAutoFlush((synced, remaining, dead) => {
      setPending(remaining)
      setDead(dead)
      if (synced) toast.success(`✅ تم رفع ${synced} عملية بعد رجوع الإنترنت`)
      if (dead > 0) toast.warning(`⚠️ ${dead} عملية فشلت نهائيًا`)
    })

    const timer = window.setInterval(refreshCounts, 5000)

    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('dawaa-offline-queue-change', onChange as EventListener)
      window.clearInterval(timer)
      cleanup()
    }
  }, [])

  // مش بيظهر لو كل حاجة تمام
  if (online && pending === 0 && dead === 0) return null

  return (
    <div dir="rtl" className="space-y-2">
      {/* Offline / Pending Banner */}
      {(!online || pending > 0) && (
        <div className={`rounded-3xl border p-3 text-sm font-black shadow-sm ${
          online ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-800'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {online ? <Wifi size={18} /> : <WifiOff size={18} />}
              <div>
                <p>{online ? 'إنترنت متصل' : 'لا يوجد إنترنت'}</p>
                <p className="text-xs font-bold opacity-80">
                  {pending > 0
                    ? `${pending} عملية محفوظة — ستُرفع تلقائيًا عند الاتصال`
                    : 'أي تسجيل سيُحفظ مؤقتًا ويُرفع تلقائيًا'}
                </p>
              </div>
            </div>
            {online && pending > 0 && (
              <button
                onClick={syncNow}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs shadow-sm disabled:opacity-50 hover:bg-amber-100 transition"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                مزامنة الآن
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dead items banner */}
      {dead > 0 && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="flex-shrink-0" />
              <div>
                <p className="font-black">{dead} عملية فشلت نهائيًا</p>
                <p className="text-xs font-bold opacity-80">فشلت بعد 5 محاولات — يمكن مسحها بأمان</p>
              </div>
            </div>
            <button
              onClick={handleClearDead}
              className="inline-flex items-center gap-1 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-red-700 shadow-sm hover:bg-red-100 transition"
            >
              <Trash2 size={13} />
              مسح
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
