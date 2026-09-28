import { useCallback, useEffect, useState } from 'react'
import { getCurrentSession, getUserProfile, restoreRiderSession } from '../lib/auth'
import { canAccessPage, type PageKey } from '../lib/permissions'

export function useAdminAccess() {
  const [role, setRole] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      const local = restoreRiderSession()
      if (local?.role && local.role !== 'rider') {
        if (!alive) return
        setRole(local.role)
        setReady(true)
        return
      }

      const session = await getCurrentSession()
      const profile = session?.user?.id ? await getUserProfile(session.user.id) : null
      if (!alive) return
      setRole(profile?.role || null)
      setReady(true)
    })()

    return () => { alive = false }
  }, [])

  const canAccess = useCallback((pageKey: PageKey) => ready && canAccessPage(role, pageKey), [ready, role])

  return { role, ready, canAccess }
}
