/**
 * useRealtimeSync — Supabase Realtime Hook (v2)
 * يحدث البيانات تلقائياً عند أي تغيير في قاعدة البيانات.
 * - لا يطبع بيانات حساسة في console.
 * - يعيد الاتصال تلقائياً لو انقطع.
 */

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from './supabase'

interface RealtimeSyncOptions {
  riderId?: string | null
  onOrderChange?: (payload?: any) => void
  onTripChange?: (payload?: any) => void
  onAttendanceChange?: () => void
  onNotificationChange?: () => void
  enabled?: boolean
}

export function useRealtimeSync({
  riderId,
  onOrderChange,
  onTripChange,
  onAttendanceChange,
  onNotificationChange,
  enabled = true,
}: RealtimeSyncOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCount = useRef(0)

  const connect = useCallback(() => {
    if (!enabled || !riderId) return

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase
      .channel(`rider-realtime-${riderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', filter: `rider_id=eq.${riderId}` },
        (payload) => onOrderChange?.(payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_trips', filter: `rider_id=eq.${riderId}` },
        (payload) => onTripChange?.(payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `rider_id=eq.${riderId}` },
        () => onAttendanceChange?.())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rider_notifications' },
        () => onNotificationChange?.())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          retryCount.current = 0 // reset on success
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
          const delay = Math.min(2000 * Math.pow(2, retryCount.current), 30000)
          retryCount.current++
          retryRef.current = setTimeout(connect, delay)
        }
      })

    channelRef.current = channel
  }, [enabled, riderId, onOrderChange, onTripChange, onAttendanceChange, onNotificationChange])

  useEffect(() => {
    connect()
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [connect])
}

/**
 * Hook للأدمن — يراقب كل التغييرات في الفرع
 */
export function useAdminRealtimeSync({
  branchId,
  onOrderChange,
  onTripChange,
  onAttendanceChange,
  enabled = true,
}: {
  branchId?: string | null
  onOrderChange?: () => void
  onTripChange?: () => void
  onAttendanceChange?: () => void
  enabled?: boolean
}) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCount = useRef(0)

  const connect = useCallback(() => {
    if (!enabled) return

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const filterOrders = branchId ? `branch_id=eq.${branchId}` : undefined
    const filterTrips  = branchId ? `branch_id=eq.${branchId}` : undefined

    const channel = supabase
      .channel(`admin-realtime-${branchId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders', ...(filterOrders ? { filter: filterOrders } : {}) },
        () => onOrderChange?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_trips', ...(filterTrips ? { filter: filterTrips } : {}) },
        () => onTripChange?.())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' },
        () => onAttendanceChange?.())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          retryCount.current = 0
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          const delay = Math.min(2000 * Math.pow(2, retryCount.current), 30000)
          retryCount.current++
          retryRef.current = setTimeout(connect, delay)
        }
      })

    channelRef.current = channel
  }, [enabled, branchId, onOrderChange, onTripChange, onAttendanceChange])

  useEffect(() => {
    connect()
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [connect])
}
