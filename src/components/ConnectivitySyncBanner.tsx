import { useEffect, useState } from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { flushOfflineQueue, offlineQueueCount, setupOfflineQueueAutoFlush } from '../lib/offlineQueue'
import { toast } from 'sonner'

export default function ConnectivitySyncBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [pending, setPending] = useState(offlineQueueCount())
  const [syncing, setSyncing] = useState(false)

  async function syncNow() {
    if (!navigator.onLine) {
      toast.error('لا يوجد اتصال بالإنترنت حالياً')
      return
    }
    setSyncing(true)
    try {
      const res = await flushOfflineQueue()
      setPending(res.remaining)
      if (res.synced) toast.success(`تم رفع ${res.synced} عملية محفوظة`)
      else toast.info('لا توجد عمليات معلقة')
    } catch (e: any) {
      toast.error(e?.message || 'فشل المزامنة')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    const onChange = () => setPending(offlineQueueCount())

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('dawaa-offline-queue-change', onChange as EventListener)

    const cleanup = setupOfflineQueueAutoFlush((synced, remaining) => {
      setPending(remaining)
      if (synced) toast.success(`تم رفع ${synced} عملية بعد رجوع الإنترنت`)
    })

    const timer = window.setInterval(() => setPending(offlineQueueCount()), 5000)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('dawaa-offline-queue-change', onChange as EventListener)
      window.clearInterval(timer)
      cleanup()
    }
  }, [])

  if (online && pending === 0) return null

  return (
    <div dir="rtl" className={`rounded-3xl border p-3 text-sm font-black shadow-sm ${
      online ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-800'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {online ? <Wifi size={18} /> : <WifiOff size={18} />}
          <div>
            <p>{online ? 'الإنترنت متصل' : 'الإنترنت غير متصل'}</p>
            <p className="text-xs opacity-80">
              {pending > 0
                ? `يوجد ${pending} عملية محفوظة وستُرفع تلقائيًا عند الاتصال.`
                : 'أي تسجيل أثناء انقطاع الإنترنت سيتم حفظه مؤقتًا.'}
            </p>
          </div>
        </div>
        <button onClick={syncNow} disabled={!online || syncing}
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          مزامنة الآن
        </button>
      </div>
    </div>
  )
}
