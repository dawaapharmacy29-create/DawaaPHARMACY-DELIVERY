import { useEffect } from 'react'

export default function CacheRecovery() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg = String(event?.message || event?.error?.message || '')
      if (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('error loading dynamically imported module')
      ) {
        event.preventDefault()
        void recover()
      }
    }

    const onUnhandled = (event: PromiseRejectionEvent) => {
      const msg = String(event?.reason?.message || event?.reason || '')
      if (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('error loading dynamically imported module')
      ) {
        event.preventDefault()
        void recover()
      }
    }

    async function recover() {
      if (new URL(window.location.href).searchParams.has('fresh')) return
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations()
          await Promise.all(regs.map(reg => reg.unregister()))
        }

        if ('caches' in window) {
          const keys = await caches.keys()
          await Promise.all(keys.map(k => caches.delete(k)))
        }
      } catch {
        // ignore
      }

      const url = new URL(window.location.href)
      url.searchParams.set('fresh', Date.now().toString())
      window.location.replace(url.toString())
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandled)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandled)
    }
  }, [])

  return null
}
