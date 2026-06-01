// ============================================
// DAWAA PHARMACY OS — Service Worker
// ============================================
const CACHE_NAME = 'dawaa-os-v7';
const OFFLINE_URL = '/';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// تثبيت الـ Service Worker وتخزين الملفات
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        return cache.add('/index.html');
      });
    })
  );
  self.skipWaiting();
});

// تفعيل وحذف الكاش القديم
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// استراتيجية: Network First (يجرب الإنترنت أول، لو فشل يرجع الكاش)
self.addEventListener('fetch', event => {
  // تجاهل Supabase requests (لازم تيجي من الإنترنت دايماً)
  if (event.request.url.includes('supabase.co')) return;
  if (event.request.url.includes('cdn.jsdelivr.net')) return;
  if (event.request.url.includes('cdnjs.cloudflare.com')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // خزّن نسخة في الكاش
        if (response && response.status === 200 && response.type === 'basic') {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return response;
      })
      .catch(() => {
        // لو مافيش إنترنت، رجّع من الكاش
        return caches.match(event.request).then(cached => {
          return cached || caches.match('/index.html');
        });
      })
  );
});

// استقبال رسائل من التطبيق
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
