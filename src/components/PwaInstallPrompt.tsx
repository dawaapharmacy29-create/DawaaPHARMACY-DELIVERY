import { useEffect, useMemo, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const isIos = useMemo(() => typeof window !== 'undefined' && isIosDevice(), [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isStandaloneMode()) return
    if (localStorage.getItem('dawaa_pwa_install_dismissed') === 'yes') return

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setShow(true)
    }

    const timer = window.setTimeout(() => setShow(true), 1200)
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    const onInstalled = () => {
      setShow(false)
      localStorage.setItem('dawaa_pwa_installed', 'yes')
    }
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!show || dismissed || isStandaloneMode()) return null

  const dismiss = () => {
    setDismissed(true)
    localStorage.setItem('dawaa_pwa_install_dismissed', 'yes')
  }

  const install = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice.catch(() => null)
      if (choice?.outcome === 'accepted') setShow(false)
      return
    }
    setShow(true)
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-[9999] mx-auto max-w-xl rounded-[28px] border border-teal-100 bg-white p-4 text-right shadow-2xl" dir="rtl">
      <div className="flex items-start gap-3">
        <img src="/logo.png" alt="Dawaa" className="h-12 w-12 rounded-2xl object-contain shadow-sm" />
        <div className="min-w-0 flex-1">
          <p className="font-black text-[#061827]">حمّل تطبيق Dawaa Delivery على التليفون</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            هيظهر كأيقونة على الشاشة الرئيسية للدليفري، ويدعم التنبيهات داخل التطبيق.
          </p>

          {isIos && (
            <p className="mt-2 rounded-2xl bg-amber-50 p-2 text-xs font-black text-amber-800">
              على iPhone: اضغط مشاركة Share ثم Add to Home Screen / إضافة إلى الشاشة الرئيسية.
            </p>
          )}

          {!deferredPrompt && !isIos && (
            <p className="mt-2 rounded-2xl bg-slate-50 p-2 text-xs font-bold text-slate-500">
              لو زر التحميل لم يظهر، افتح القائمة ⋮ في Chrome ثم اختار Install app / إضافة إلى الشاشة الرئيسية.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            {!isIos && (
              <button
                type="button"
                onClick={install}
                className="flex-1 rounded-2xl bg-[#008E92] px-4 py-3 text-sm font-black text-white"
              >
                تحميل التطبيق 📲
              </button>
            )}

            <button
              type="button"
              onClick={dismiss}
              className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-600"
            >
              لاحقًا
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
