import type { GeoPoint } from '@/types/delivery';

export function calculateDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const earthRadius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinGeofence(
  point: { lat: number; lng: number },
  center: { lat: number; lng: number },
  radiusMeters: number
) {
  return calculateDistanceMeters(point, center) <= radiusMeters;
}

export function getCurrentPositionWithTimeout(timeoutMs = 10000): Promise<GeoPoint> {
  if (!navigator.geolocation) {
    return Promise.resolve({
      lat: null,
      lng: null,
      accuracy: null,
      needsReview: true,
      reason: 'GPS غير متاح على الجهاز',
    });
  }

  return new Promise(resolve => {
    const timer = window.setTimeout(() => {
      resolve({
        lat: null,
        lng: null,
        accuracy: null,
        needsReview: true,
        reason: 'انتهت مهلة GPS',
      });
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      position => {
        window.clearTimeout(timer);
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          needsReview: false,
          reason: null,
        });
      },
      error => {
        window.clearTimeout(timer);
        resolve({
          lat: null,
          lng: null,
          accuracy: null,
          needsReview: true,
          reason: error.message || 'تم رفض GPS أو فشل تحديد الموقع',
        });
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs }
    );
  });
}
