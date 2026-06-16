/**
 * useRecentCustomers — تاريخ العملاء السابقين
 * يخزن آخر 10 عملاء زارهم المندوب في localStorage
 * ويتيح إعادة الاستخدام بضغطة واحدة
 */

import { useCallback, useEffect, useState } from 'react'

export interface RecentCustomer {
  id: string | null
  code: string
  name: string
  phone: string
  address: string
  lastUsed: number
}

const STORAGE_KEY = 'dawaa_recent_customers'
const MAX_RECENT = 10

function loadFromStorage(riderId: string): RecentCustomer[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${riderId}`)
    if (!raw) return []
    return JSON.parse(raw) as RecentCustomer[]
  } catch {
    return []
  }
}

function saveToStorage(riderId: string, customers: RecentCustomer[]) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${riderId}`, JSON.stringify(customers))
  } catch {}
}

export function useRecentCustomers(riderId: string | null) {
  const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([])

  useEffect(() => {
    if (!riderId) return
    setRecentCustomers(loadFromStorage(riderId))
  }, [riderId])

  const addRecentCustomer = useCallback(
    (customer: Omit<RecentCustomer, 'lastUsed'>) => {
      if (!riderId || !customer.name) return
      setRecentCustomers((prev) => {
        const filtered = prev.filter(
          (c) => !(c.code === customer.code && c.name === customer.name && c.phone === customer.phone)
        )
        const updated = [{ ...customer, lastUsed: Date.now() }, ...filtered].slice(0, MAX_RECENT)
        saveToStorage(riderId, updated)
        return updated
      })
    },
    [riderId]
  )

  const clearRecentCustomers = useCallback(() => {
    if (!riderId) return
    localStorage.removeItem(`${STORAGE_KEY}_${riderId}`)
    setRecentCustomers([])
  }, [riderId])

  return { recentCustomers, addRecentCustomer, clearRecentCustomers }
}
