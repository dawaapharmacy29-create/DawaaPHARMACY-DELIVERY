import { Component, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null; retries: number }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, retries: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, _errorInfo: unknown) {
    const alreadyRecovered = new URL(window.location.href).searchParams.has('fresh')
    if (this.isStaleBundleError(error) && !alreadyRecovered) void this.recoverFreshVersion()
  }

  isStaleBundleError = (error: Error | null = this.state.error) => {
    const message = String(error?.message || '').toLowerCase()
    return message.includes('dynamically imported module') ||
      message.includes('importing a module script failed') ||
      message.includes('loading chunk') ||
      message.includes('chunkloaderror') ||
      message.includes('failed to fetch')
  }

  recoverFreshVersion = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map(registration => registration.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map(key => caches.delete(key)))
      }
    } catch {
      // Some restricted mobile browsers block cache/storage APIs. Reload still helps.
    }
    const url = new URL(window.location.href)
    url.searchParams.set('fresh', Date.now().toString())
    window.location.replace(url.toString())
  }

  handleRetry = () => {
    if (this.isStaleBundleError()) {
      void this.recoverFreshVersion()
      return
    }
    if (this.state.retries >= 2) {
      // بعد 3 محاولات — reload كامل
      window.location.reload()
      return
    }
    this.setState(s => ({ hasError: false, error: null, retries: s.retries + 1 }))
  }

  handleBackToLogin = () => { window.location.href = '/login' }

  render() {
    if (!this.state.hasError) return this.props.children

    const isNetworkError = this.state.error?.message?.toLowerCase().includes('network') ||
                           this.state.error?.message?.toLowerCase().includes('fetch') ||
                           this.state.error?.message?.toLowerCase().includes('timeout')

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8] p-4" dir="rtl">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-lg text-center space-y-4">

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-50">
            <span className="text-4xl">{isNetworkError ? '📡' : '⚠️'}</span>
          </div>

          <div>
            <h1 className="text-xl font-black text-[#061827]">
              {isNetworkError ? 'مشكلة في الاتصال' : 'حصل خطأ في الصفحة'}
            </h1>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {isNetworkError
                ? 'تحقق من الإنترنت وحاول مرة تانية'
                : 'جرّب مرة تانية أو ارجع لتسجيل الدخول'}
            </p>
          </div>

          {/* عدد المحاولات */}
          {this.state.retries > 0 && (
            <p className="text-xs font-bold text-slate-400">
              المحاولة {this.state.retries + 1} من 3
            </p>
          )}

          <div className="space-y-2">
            <button
              onClick={this.handleRetry}
              className="w-full rounded-2xl bg-[#008E92] px-4 py-3 font-black text-white hover:bg-[#05777B] active:scale-95"
            >
              {this.state.retries >= 2 ? '🔄 إعادة تحميل الصفحة' : 'إعادة المحاولة'}
            </button>
            <button
              onClick={this.handleBackToLogin}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-black text-slate-700 hover:bg-slate-50 active:scale-95"
            >
              الرجوع لتسجيل الدخول
            </button>
          </div>
        </div>
      </div>
    )
  }
}
