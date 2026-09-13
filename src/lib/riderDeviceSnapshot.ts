// رصد حالة الجهاز: بطارية، اتصال، GPS تشخيصي سريع فقط.
// ملاحظة: GPS الحرج للحضور/التسليم/تسجيل الأوردر له مسار مستقل عالي الدقة،
// لذلك لا نسمح لقراءة التشخيص هنا أن تؤخر فتح شاشة المندوب.
export type RiderDeviceSnapshot = {
  batteryPercent: number | null
  batterySupported: boolean
  isCharging: boolean | null
  online: boolean
  gpsAccuracy: number | null
}

export async function readRiderDeviceSnapshot(): Promise<RiderDeviceSnapshot> {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true

  let batteryPercent: number | null = null
  let batterySupported = false
  let isCharging: boolean | null = null

  try {
    if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
      const battery = await (navigator as any).getBattery()
      batterySupported = true
      batteryPercent = Math.round((battery.level ?? 0) * 100)
      isCharging = battery.charging ?? null
    }
  } catch {
    batterySupported = false
  }

  let gpsAccuracy: number | null = null
  try {
    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            gpsAccuracy = Math.round(pos.coords.accuracy)
            resolve()
          },
          () => resolve(),
          {
            // Prefer a recent cached fix and never hold the dashboard for seconds.
            // Operational actions request their own fresh high-accuracy GPS separately.
            timeout: 450,
            maximumAge: 120000,
            enableHighAccuracy: false,
          },
        )
      })
    }
  } catch {
    gpsAccuracy = null
  }

  return { batteryPercent, batterySupported, isCharging, online, gpsAccuracy }
}
