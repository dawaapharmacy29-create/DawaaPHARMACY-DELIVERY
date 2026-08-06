/* Dawaa Delivery Service Worker - cache safe version
   الهدف: منع مشكلة Failed to fetch dynamically imported module بعد أي Deploy جديد.
*/
const CACHE_NAME = 'dawaa-delivery-v20-mobile-recovery-20260806';
const APP_SHELL = ['/', '/login', '/manifest.webmanifest', '/apple-touch-icon.png', '/pwa-icon-180.png', '/pwa-icon-192.png', '/pwa-icon-512.png', '/dawaa-logo.jpeg'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(() => undefined))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

function isAssetRequest(req) {
  const url = new URL(req.url);
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // مهم جدًا: ملفات /assets الخاصة بـ Vite/React لا نخزنها.
  // لأنها بتتغير مع كل Deploy، وتخزينها يسبب Failed to fetch dynamically imported module.
  if (isAssetRequest(req)) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // صفحات التطبيق Network-first، ولو النت قطع نرجع الصفحة الرئيسية/اللوجين فقط.
  if (isHtmlRequest(req)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy).catch(() => undefined));
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('/login') || caches.match('/')))
    );
    return;
  }

  // باقي الملفات الثابتة فقط
  event.respondWith(
    caches.match(req).then(cached => {
      return cached || fetch(req).then(res => {
        const url = new URL(req.url);
        if (url.origin === self.location.origin && ['image', 'style', 'font'].includes(req.destination)) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy).catch(() => undefined));
        }
        return res;
      });
    })
  );
});

self.addEventListener('message', event => {
  const data = event.data || {};

  if (data.type === 'DAWAA_CLEAR_CACHES') {
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.clients.matchAll({ includeUncontrolled: true }))
        .then(clients => clients.forEach(client => client.postMessage({ type: 'DAWAA_CACHES_CLEARED' })))
    );
    return;
  }

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'DAWAA_SHOW_NOTIFICATION') {
    const title = data.title || 'تنبيه من Dawaa Delivery';
    const options = {
      body: data.body || data.message || '',
      icon: '/pwa-icon-192.png',
      badge: '/pwa-maskable-192.png',
      tag: data.tag || 'dawaa-notification',
      data: { url: data.url || '/rider' },
      dir: 'rtl',
      lang: 'ar-EG',
      requireInteraction: data.requireInteraction === true,
      vibrate: [200, 80, 200]
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification?.data?.url || '/rider';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url).catch(() => undefined);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
