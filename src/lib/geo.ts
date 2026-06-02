export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
  needsReview: boolean;
  reason: string | null;
}

const GPS_ACCURACY_THRESHOLD = 100; // meters
const TIMEOUT_MS = 10000;

export function getCurrentPositionWithTimeout(): Promise<GeoPosition> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 0, lng: 0, accuracy: 9999, needsReview: true, reason: 'GPS غير مدعوم في هذا الجهاز' });
      return;
    }

    const timer = window.setTimeout(() => {
      resolve({ lat: 0, lng: 0, accuracy: 9999, needsReview: true, reason: 'انتهت مهلة الحصول على الموقع' });
    }, TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        const { latitude, longitude, accuracy } = pos.coords;
        const needsReview = accuracy > GPS_ACCURACY_THRESHOLD;
        resolve({
          lat: latitude,
          lng: longitude,
          accuracy,
          needsReview,
          reason: needsReview ? `دقة GPS منخفضة (${Math.round(accuracy)} متر)` : null,
        });
      },
      (err) => {
        window.clearTimeout(timer);
        resolve({ lat: 0, lng: 0, accuracy: 9999, needsReview: true, reason: `تعذر الحصول على الموقع: ${err.message}` });
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 }
    );
  });
}
