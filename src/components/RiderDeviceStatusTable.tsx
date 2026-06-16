import { BatteryCharging, BatteryLow, RefreshCw, Wifi, WifiOff } from 'lucide-react'

export type RiderDeviceStatusRow = {
  id?: string
  rider_id: string
  rider_name?: string | null
  branch_name?: string | null
  battery_percent?: number | null
  is_charging?: boolean | null
  battery_supported?: boolean | null
  online?: boolean | null
  warning_level?: string | null
  last_seen_at?: string | null
  last_sync_at?: string | null
  device_user_agent?: string | null
}

function ageText(value?: string | null) {
  if (!value) return '—'
  const diff = Date.now() - new Date(value).getTime()
  const min = Math.max(0, Math.round(diff / 60000))
  if (min < 1) return 'الآن'
  if (min < 60) return `منذ ${min} دقيقة`
  return `منذ ${Math.round(min / 60)} ساعة`
}

function batteryTone(row: RiderDeviceStatusRow) {
  if (!row.battery_supported) return 'bg-slate-100 text-slate-500'
  if (row.is_charging) return 'bg-emerald-100 text-emerald-700'
  const p = Number(row.battery_percent ?? 100)
  if (p <= 10) return 'bg-rose-100 text-rose-700'
  if (p <= 20) return 'bg-amber-100 text-amber-700'
  return 'bg-emerald-100 text-emerald-700'
}

export default function RiderDeviceStatusTable({
  rows,
  loading,
  onRefresh,
  onNotify,
  title = 'حالة أجهزة الدليفري',
}: {
  rows: RiderDeviceStatusRow[]
  loading?: boolean
  onRefresh?: () => void
  onNotify?: (row: RiderDeviceStatusRow) => void
  title?: string
}) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm" dir="rtl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-black text-[#061827]">{title}</h2>
          <p className="text-xs font-bold text-slate-500">البطارية · حالة الشاحن · آخر ظهور · حالة الاتصال</p>
        </div>
        {onRefresh && (
          <button onClick={onRefresh} className="rounded-2xl bg-slate-100 p-2 text-slate-600">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-black text-slate-400">
          لا توجد قراءات بطارية حتى الآن. ستظهر بعد دخول الدليفري للتطبيق من الموبايل.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-right text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-slate-500">
                <th className="p-3">الدليفري</th>
                <th className="p-3">البطارية</th>
                <th className="p-3">الشاحن</th>
                <th className="p-3">الاتصال</th>
                <th className="p-3">آخر ظهور</th>
                <th className="p-3">الحالة</th>{onNotify && <th className="p-3">تنبيه</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const percent = row.battery_supported ? `${row.battery_percent ?? '—'}%` : 'غير مدعوم'
                const warning =
                  !row.battery_supported ? 'الجهاز لا يدعم قراءة البطارية' :
                  row.warning_level === 'critical' ? 'خطر — اشحن فورًا' :
                  row.warning_level === 'low' ? 'تنبيه — بطارية منخفضة' :
                  'آمن'
                return (
                  <tr key={row.rider_id} className="border-b last:border-0">
                    <td className="p-3">
                      <p className="font-black text-[#061827]">{row.rider_name || '—'}</p>
                      <p className="text-xs font-bold text-slate-400">{row.branch_name || '—'}</p>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${batteryTone(row)}`}>
                        {Number(row.battery_percent ?? 100) <= 20 && !row.is_charging ? <BatteryLow size={14}/> : <BatteryCharging size={14}/>}
                        {percent}
                      </span>
                    </td>
                    <td className="p-3 font-bold">{row.battery_supported ? (row.is_charging ? 'متصل بالشاحن' : 'غير متصل بالشاحن') : 'غير مدعوم'}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${row.online ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {row.online ? <Wifi size={14}/> : <WifiOff size={14}/>}
                        {row.online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="p-3 text-xs font-bold text-slate-500">{ageText(row.last_seen_at)}</td>
                    <td className="p-3 text-xs font-black text-slate-600">{warning}</td>
                    {onNotify && (
                      <td className="p-3">
                        <button onClick={() => onNotify(row)} className="rounded-xl bg-[#008E92] px-3 py-2 text-xs font-black text-white">
                          إرسال تنبيه
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
