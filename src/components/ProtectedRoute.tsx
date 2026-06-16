import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'
import { getUserProfile, restoreRiderSession } from '../lib/auth'
import { canAccessPage, isManagerRole, type PageKey } from '../lib/permissions'

function managerHome(role?: string | null) {
  return role === 'branch_manager' ? '/admin/branch' : '/admin'
}

function AccessDenied() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8] p-4" dir="rtl">
      <div className="max-w-md rounded-3xl bg-white p-6 text-center shadow-sm">
        <h1 className="text-xl font-black text-[#061827]">ليس لديك صلاحية لهذه الصفحة</h1>
        <p className="mt-2 text-sm font-bold text-slate-500">
          يمكنك الرجوع للصفحة الرئيسية أو التواصل مع المدير العام لتعديل الصلاحيات.
        </p>
      </div>
    </div>
  )
}

export default function ProtectedRoute({ children, pageKey }: { children: React.ReactNode; pageKey?: PageKey }) {
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [redirectTo, setRedirectTo] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const location = useLocation()

  useEffect(() => {
    let cancelled = false

    function finish(ok: boolean, redirect: string | null = null, accessDenied = false) {
      if (!cancelled) {
        setAllowed(ok)
        setRedirectTo(redirect)
        setDenied(accessDenied)
        setLoading(false)
      }
    }

    async function checkAccess() {
      const path = location.pathname
      const isRiderRoute = path.startsWith('/rider')
      const isAdminRoute = path.startsWith('/admin')
      const s = restoreRiderSession()

      const hasLocalAccount = !!(s?.account_id || s?.rider_id)
      const hasRealRider = !!s?.rider_id
      const role = s?.role || 'rider'
      const manager = isManagerRole(role)

      if (hasLocalAccount) {
        if (manager && isRiderRoute) {
          finish(false, managerHome(role))
          return
        }

        if (!manager && isAdminRoute) {
          finish(false, '/rider')
          return
        }

        if (manager && isAdminRoute) {
          if (!canAccessPage(role, pageKey)) {
            finish(false, null, true)
            return
          }
          finish(true)
          return
        }

        if (isRiderRoute) {
          finish(hasRealRider && canAccessPage(role, 'rider'))
          return
        }

        finish(true)
        return
      }

      if (isAdminRoute) {
        const { data } = await supabase.auth.getSession()
        const user = data.session?.user
        if (!user) {
          finish(false, '/login')
          return
        }
        const profile = await getUserProfile(user.id)
        if (!profile || profile.status !== 'active') {
          finish(false, '/login')
          return
        }
        if (!canAccessPage(profile.role, pageKey)) {
          finish(false, null, true)
          return
        }
        finish(true)
        return
      }

      finish(false, '/login')
    }

    void checkAccess()
    return () => { cancelled = true }
  }, [location.pathname, pageKey])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F3F7F8]" dir="rtl">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#008E92] border-t-transparent mx-auto" />
          <p className="mt-3 font-bold text-slate-500">جاري فحص الجلسة...</p>
        </div>
      </div>
    )
  }

  if (!allowed) {
    if (denied) return <AccessDenied />
    return <Navigate to={redirectTo || '/login'} replace state={{ from: location }} />
  }

  return <>{children}</>
}
