import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { setupGlobalErrorLogger } from './lib/errorLogger'

// ─── Global error logger (silent in production) ───────────────────────────────
setupGlobalErrorLogger()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// ─── Service Worker registration + update detection ───────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js')

      // لو في نسخة جديدة من الـ SW — أبلّغ المستخدم
      registration.addEventListener('updatefound', () => {
        const newSW = registration.installing
        if (!newSW) return

        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            // إرسال SKIP_WAITING للـ SW الجديد عشان يتفعّل فورًا
            newSW.postMessage({ type: 'SKIP_WAITING' })
          }
        })
      })

      // لو الـ SW اتغير — reload الصفحة عشان نستخدم النسخة الجديدة
      let refreshing = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      })

    } catch (err) {
      console.warn('[PWA] Service worker registration failed:', err)
    }
  })
}
