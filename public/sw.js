/* ============================================================
   Dawaa Delivery Service Worker v20 — Push + Cache + Recovery
   ============================================================ */
const CACHE_NAME = 'dawaa-delivery-v20-push-2026';
const APP_SHELL = [
  '/', '/login', '/manifest.webmanifest',
  '/apple-touch-icon.png', '/pwa-icon-180.png',
  '/pwa-icon-192.png', '/pwa-icon-512.png', '/dawaa-logo.jpeg'
];

// ─── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(() => undefined))
  );
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
function isHtmlRequest(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}

function isViteAsset(req) {
  const url = new URL(req.url);
  return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Vite assets — always fresh, never cache (avoid stale module errors)
  if (isViteAsset(req)) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // HTML navigation — network first, fall back to cached shell
  if (isHtmlRequest(req)) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          caches.open(CACHE_NAME).then(c => c.put(req, res.clone()).catch(() => {}));
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(c => c || caches.match('/login') || caches.match('/'))
        )
    );
    return;
  }

  // Static assets (images, fonts, manifest) — cache first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        const url = new URL(req.url);
        if (url.origin === self.location.origin &&
            ['image', 'style', 'font'].includes(req.destination)) {
          caches.open(CACHE_NAME).then(c => c.put(req, res.clone()).catch(() => {}));
        }
        return res;
      });
    })
  );
});

// ─── Push Notifications ──────────────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'تنبيه جديد', body: event.data?.text() || '' };
  }

  const title   = data.title   || 'تنبيه من Dawaa Delivery';
  const options = {
    body:              data.body    || data.message || '',
    icon:              '/pwa-icon-192.png',
    badge:             '/pwa-maskable-192.png',
    tag:               data.tag     || 'dawaa-push',
    data:              { url: data.url || '/rider' },
    dir:               'rtl',
    lang:              'ar-EG',
    requireInteraction: data.requireInteraction === true,
    vibrate:           [200, 80, 200, 80, 200],
    actions:           data.actions || [],
    timestamp:         Date.now(),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification Click ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || '/rider';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // لو التطبيق مفتوح — بعته للصفحة الصح
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      // مغلق — افتحه
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ─── Message from App ─────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'DAWAA_CLEAR_CACHES') {
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => self.clients.matchAll({ includeUncontrolled: true }))
        .then(list => list.forEach(c => c.postMessage({ type: 'DAWAA_CACHES_CLEARED' })))
    );
    return;
  }

  // إشعار محلي من الكود (foreground/background)
  if (data.type === 'DAWAA_SHOW_NOTIFICATION') {
    const title   = data.title || 'تنبيه من Dawaa Delivery';
    const options = {
      body:              data.body || data.message || '',
      icon:              '/pwa-icon-192.png',
      badge:             '/pwa-maskable-192.png',
      tag:               data.tag || 'dawaa-notification',
      data:              { url: data.url || '/rider' },
      dir:               'rtl',
      lang:              'ar-EG',
      requireInteraction: data.requireInteraction === true,
      vibrate:           [200, 80, 200],
    };
    event.waitUntil(self.registration.showNotification(title, options));
    return;
  }

  // إشعار للأدمن من الكود
  if (data.type === 'DAWAA_ADMIN_NOTIFY') {
    const options = {
      body:  data.body || '',
      icon:  '/pwa-icon-192.png',
      badge: '/pwa-maskable-192.png',
      tag:   data.tag || 'dawaa-admin',
      data:  { url: data.url || '/admin' },
      dir:   'rtl',
    };
    event.waitUntil(self.registration.showNotification(data.title || 'تنبيه إداري', options));
  }
});
