/**
 * useGeofence — GPS Hook للدليفري
 * يتتبع موقع المندوب ويكتشف لما يدخل أو يخرج من نطاق الصيدلية
 * يستخدم كمساعد وليس حكم — الخصومات تظل بموافقة بشرية
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface GeofenceConfig {
  /** إحداثيات مركز الصيدلية */
  latitude: number
  longitude: number
  /** نطاق الدخول بالمتر (افتراضي 150م لتغطية دقة GPS) */
  radiusMeters?: number
}

export interface GeoLocation {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

export type GeofenceStatus = 'unknown' | 'inside' | 'outside' | 'unavailable'

export interface OrderTimer {
  orderId: string
  startedAt: number
  /** وقت التسليم (لما يرجع للصيدلية) */
  completedAt?: number
  durationMinutes?: number
  departureLocation?: GeoLocation
  returnLocation?: GeoLocation
}

/** حساب المسافة بين نقطتين بالمتر (Haversine) */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function useGeofence(config: GeofenceConfig | null) {
  const radius = config?.radiusMeters ?? 150
  const [currentLocation, setCurrentLocation] = useState<GeoLocation | null>(null)
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceStatus>('unknown')
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [activeTimer, setActiveTimer] = useState<OrderTimer | null>(null)
  const [completedTimers, setCompletedTimers] = useState<OrderTimer[]>([])
  const watchIdRef = useRef<number | null>(null)
  const prevStatusRef = useRef<GeofenceStatus>('unknown')
  const onEnterRef = useRef<((loc: GeoLocation) => void) | null>(null)
  const onExitRef = useRef<((loc: GeoLocation) => void) | null>(null)

  const updateLocation = useCallback(
    (pos: GeolocationPosition) => {
      const loc: GeoLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      }
      setCurrentLocation(loc)
      setGpsError(null)

      if (!config) return

      const dist = haversineMeters(config.latitude, config.longitude, loc.lat, loc.lng)
      const newStatus: GeofenceStatus = dist <= radius ? 'inside' : 'outside'

      setGeofenceStatus(newStatus)

      // تغيير الحالة
      if (prevStatusRef.current !== newStatus) {
        if (newStatus === 'outside' && prevStatusRef.current === 'inside') {
          // خرج من الصيدلية — ابدأ التايمر
          onExitRef.current?.(loc)
        } else if (newStatus === 'inside' && prevStatusRef.current === 'outside') {
          // رجع للصيدلية — أوقف التايمر
          onEnterRef.current?.(loc)
        }
        prevStatusRef.current = newStatus
      }
    },
    [config, radius]
  )

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeofenceStatus('unavailable')
      setGpsError('الجهاز لا يدعم GPS')
      return
    }

    if (!config) return

    // GPS watch - استخدم دقة عالية بس مع timeout معقول
    watchIdRef.current = navigator.geolocation.watchPosition(
      updateLocation,
      (err) => {
        setGpsError(
          err.code === 1
            ? 'الرجاء السماح بالوصول للموقع من إعدادات المتصفح'
            : err.code === 2
            ? 'تعذر تحديد الموقع، تأكد من تفعيل GPS'
            : 'انتهت مهلة تحديد الموقع'
        )
        setGeofenceStatus('unavailable')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,   // 10 ثواني cache
        timeout: 20000,      // 20 ثانية timeout
      }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [config, updateLocation])

  /** ابدأ تايمر أوردر لما يخرج */
  const startOrderTimer = useCallback((orderId: string, loc: GeoLocation) => {
    setActiveTimer({ orderId, startedAt: Date.now(), departureLocation: loc })
  }, [])

  /** أوقف التايمر لما يرجع */
  const stopOrderTimer = useCallback((returnLoc: GeoLocation) => {
    setActiveTimer((prev) => {
      if (!prev) return null
      const completedAt = Date.now()
      const durationMinutes = Math.round((completedAt - prev.startedAt) / 60000)
      const completed: OrderTimer = {
        ...prev,
        completedAt,
        durationMinutes,
        returnLocation: returnLoc,
      }
      setCompletedTimers((prevList) => [completed, ...prevList].slice(0, 20))
      return null
    })
  }, [])

  /** التايمر الحالي - وقت منذ الخروج */
  const elapsedMinutes = activeTimer
    ? Math.round((Date.now() - activeTimer.startedAt) / 60000)
    : 0

  return {
    currentLocation,
    geofenceStatus,
    gpsError,
    activeTimer,
    completedTimers,
    elapsedMinutes,
    startOrderTimer,
    stopOrderTimer,
    onEnterRef,
    onExitRef,
  }
}
