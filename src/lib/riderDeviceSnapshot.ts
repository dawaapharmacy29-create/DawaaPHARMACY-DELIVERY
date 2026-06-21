// رصد حالة الجهاز: بطارية، اتصال، GPS
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
          { timeout: 3000, maximumAge: 30000, enableHighAccuracy: false },
        )
      })
    }
  } catch {
    gpsAccuracy = null
  }

  return { batteryPercent, batterySupported, isCharging, online, gpsAccuracy }
}
