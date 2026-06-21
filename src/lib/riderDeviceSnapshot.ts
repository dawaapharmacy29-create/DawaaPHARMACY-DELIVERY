export type RiderDeviceSnapshot = {
  batteryPercent: number | null
  batteryLevel: number | null
  batterySupported: boolean
  isCharging: boolean | null
  online: boolean
  gpsAccuracy: number | null
}

type BatteryManagerLike = EventTarget & {
  level: number
  charging: boolean
}

declare global {
  interface Navigator {
    getBattery?: () => Promise<BatteryManagerLike>
  }
}

export function emptyRiderDeviceSnapshot(): RiderDeviceSnapshot {
  return {
    batteryPercent: null,
    batteryLevel: null,
    batterySupported: false,
    isCharging: null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    gpsAccuracy: null,
  }
}

export async function readRiderDeviceSnapshot(gpsAccuracy?: number | null): Promise<RiderDeviceSnapshot> {
  const snapshot = emptyRiderDeviceSnapshot()
  snapshot.gpsAccuracy = typeof gpsAccuracy === 'number' ? Math.round(gpsAccuracy) : gpsAccuracy ?? null

  try {
    snapshot.online = typeof navigator !== 'undefined' ? navigator.onLine : true
  } catch {
    snapshot.online = true
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.getBattery === 'function') {
      const battery = await navigator.getBattery()
      const level = typeof battery.level === 'number' ? battery.level : null
      snapshot.batterySupported = true
      snapshot.batteryLevel = level
      snapshot.batteryPercent = level === null ? null : Math.round(level * 100)
      snapshot.isCharging = typeof battery.charging === 'boolean' ? battery.charging : null
    }
  } catch {
    snapshot.batterySupported = false
  }

  return snapshot
}

export function riderDeviceAuditPatch(snapshot: RiderDeviceSnapshot) {
  return {
    client_battery_percent: snapshot.batteryPercent,
    client_battery_level: snapshot.batteryLevel,
    client_battery_supported: snapshot.batterySupported,
    client_is_charging: snapshot.isCharging,
    client_online: snapshot.online,
    client_gps_accuracy_m: snapshot.gpsAccuracy,
    client_device_captured_at: new Date().toISOString(),
  }
}
