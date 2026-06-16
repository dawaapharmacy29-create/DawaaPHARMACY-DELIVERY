
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

type Props = {
  riderId?: string | null
  riderName?: string | null
  branchId?: string | null
  branchName?: string | null
}

type BatteryManagerLike = EventTarget & {
  level: number
  charging: boolean
  chargingTime?: number
  dischargingTime?: number
}

type DeviceSnapshot = {
  battery_level: number | null
  battery_percent: number | null
  is_charging: boolean | null
  battery_supported: boolean
  online: boolean
  warning_level: 'safe' | 'low' | 'critical' | 'unsupported'
}

declare global {
  interface Navigator {
    getBattery?: () => Promise<BatteryManagerLike>
  }
}

function getWarningLevel(percent: number | null, supported: boolean, isCharging: boolean | null): DeviceSnapshot['warning_level'] {
  if (!supported) return 'unsupported'
  if (percent === null) return 'unsupported'
  if (isCharging) return 'safe'
  if (percent <= 10) return 'critical'
  if (percent <= 20) return 'low'
  return 'safe'
}

export default function RiderDeviceMonitor({ riderId, riderName, branchId, branchName }: Props) {
  const [snapshot, setSnapshot] = useState<DeviceSnapshot>({
    battery_level: null,
    battery_percent: null,
    is_charging: null,
    battery_supported: false,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    warning_level: 'unsupported',
  })

  const batteryRef = useRef<BatteryManagerLike | null>(null)
  const lastSentRef = useRef(0)
  const lastWarningRef = useRef('')

  async function saveDeviceStatus(next: DeviceSnapshot, reason = 'heartbeat') {
    if (!riderId) return
    const now = Date.now()
    const shouldThrottle = reason === 'heartbeat' && now - lastSentRef.current < 55_000
    if (shouldThrottle) return
    lastSentRef.current = now

    try {
      await supabase.from('rider_device_status').upsert({
        rider_id: riderId,
        rider_name: riderName || null,
        branch_id: branchId || null,
        branch_name: branchName || null,
        battery_level: next.battery_level,
        battery_percent: next.battery_percent,
        is_charging: next.is_charging,
        battery_supported: next.battery_supported,
        online: next.online,
        last_seen_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        device_user_agent: navigator.userAgent || null,
        platform: navigator.platform || null,
        warning_level: next.warning_level,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'rider_id' })
    } catch (error) {
      // لا نوقف الدليفري لو تحديث حالة الجهاز فشل
      console.warn('device status sync failed', error)
    }
  }

  function maybeWarn(next: DeviceSnapshot) {
    if (!next.battery_supported || next.battery_percent === null) return
    if (next.is_charging) return

    const key = `${next.warning_level}-${next.battery_percent}`
    if (lastWarningRef.current === key) return

    if (next.warning_level === 'critical') {
      lastWarningRef.current = key
      toast.error(`⚠️ البطارية ${next.battery_percent}% فقط. وصل الشاحن فورًا حتى لا تتوقف عن التسجيل.`, { duration: 10000 })
    } else if (next.warning_level === 'low') {
      lastWarningRef.current = key
      toast.warning(`تنبيه مهم: البطارية منخفضة (${next.battery_percent}%). برجاء توصيل الشاحن.`, { duration: 8000 })
    }
  }

  async function readAndSync(reason = 'heartbeat') {
    let supported = false
    let level: number | null = null
    let percent: number | null = null
    let charging: boolean | null = null

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
        supported = true
        const battery = await navigator.getBattery()
        batteryRef.current = battery
        level = typeof battery.level === 'number' ? battery.level : null
        percent = level !== null ? Math.round(level * 100) : null
        charging = typeof battery.charging === 'boolean' ? battery.charging : null
      }
    } catch {
      supported = false
    }

    const next: DeviceSnapshot = {
      battery_level: level,
      battery_percent: percent,
      is_charging: charging,
      battery_supported: supported,
      online: navigator.onLine,
      warning_level: getWarningLevel(percent, supported, charging),
    }

    setSnapshot(next)
    maybeWarn(next)
    await saveDeviceStatus(next, reason)
  }

  useEffect(() => {
    if (!riderId) return

    void readAndSync('mount')

    const batteryHandler = () => void readAndSync('battery_change')
    const onlineHandler = () => void readAndSync('online_change')
    const interval = window.setInterval(() => void readAndSync('heartbeat'), 60_000)

    window.addEventListener('online', onlineHandler)
    window.addEventListener('offline', onlineHandler)

    let cleanupBattery: (() => void) | null = null
    // Immediately invoked async function expression to handle battery API cleanup
    (async () => {
      try {
        if (typeof navigator.getBattery === 'function') {
          const battery = await navigator.getBattery()
          batteryRef.current = battery
          battery.addEventListener('levelchange', batteryHandler)
          battery.addEventListener('chargingchange', batteryHandler)
          cleanupBattery = () => {
            battery.removeEventListener('levelchange', batteryHandler)
            battery.removeEventListener('chargingchange', batteryHandler)
          }
        }
      } catch (e) {
        // Optionally log error for battery API access
        console.error("Failed to access battery API:", e);
      }
    })();

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('online', onlineHandler)
      window.removeEventListener('offline', onlineHandler)
      cleanupBattery?.()
      const offlineSnapshot: DeviceSnapshot = {
        ...snapshot,
        online: false,
      }
      void saveDeviceStatus(offlineSnapshot, 'unmount')
    }
  }, [riderId, riderName, branchId, branchName, snapshot])

  const percentText = snapshot.battery_supported && snapshot.battery_percent !== null ? `${snapshot.battery_percent}%` : 'غير مدعوم'
  const tone =
    snapshot.warning_level === 'critical' ? 'border-rose-200 bg-rose-50 text-rose-700' :
    snapshot.warning_level === 'low' ? 'border-amber-200 bg-amber-50 text-amber-700' :
    snapshot.warning_level === 'unsupported' ? 'border-slate-200 bg-slate-50 text-slate-500' :
    'border-emerald-200 bg-emerald-50 text-emerald-700'

  return (
    <section className={`rounded-[26px] border p-3 text-sm font-black shadow-sm ${tone}`} dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p>حالة جهازك أثناء الشيفت</p>
          <p className="mt-1 text-xs opacity-80">
            البطارية: {percentText} · {snapshot.is_charging ? 'على الشاحن' : 'ليس على الشاحن'} · {snapshot.online ? 'Online' : 'Offline'}
          </p>
        </div>
        {snapshot.warning_level === 'critical' ? <span className="rounded-full bg-white px-3 py-1 text-xs">خطر</span> :
         snapshot.warning_level === 'low' ? <span className="rounded-full bg-white px-3 py-1 text-xs">تنبيه</span> :
         snapshot.warning_level === 'unsupported' ? <span className="rounded-full bg-white px-3 py-1 text-xs">غير مدعوم</span> :
         <span className="rounded-full bg-white px-3 py-1 text-xs">آمن</span>}
      </div>
    </section>
  )
}
