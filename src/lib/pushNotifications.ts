/**
 * pushNotifications.ts
 * نظام إشعارات Web Push الكامل — تعمل حتى لما التطبيق مغلق
 *
 * كيف يشتغل:
 * 1. المستخدم يوافق على الإشعارات (requestPermission)
 * 2. التطبيق يسجّل subscription مع Service Worker
 * 3. الـ subscription تتحفظ في Supabase (جدول push_subscriptions)
 * 4. أي Supabase Edge Function / RPC تقدر تبعت push للـ endpoint
 */

import { supabase } from './supabase'

// ─── VAPID public key (يتحكم فيها الـ Service Worker) ────────────────────────
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// ─── Permission ───────────────────────────────────────────────────────────────

export type PushPermissionStatus = 'granted' | 'denied' | 'unsupported' | 'default'

export function getPushPermissionStatus(): PushPermissionStatus {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported'
  return Notification.permission as PushPermissionStatus
}

export async function requestPushPermission(): Promise<PushPermissionStatus> {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  const result = await Notification.requestPermission()
  return result as PushPermissionStatus
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export async function subscribeToPush(
  riderId: string | null,
  role: string
): Promise<PushSubscription | null> {
  try {
    if (!VAPID_PUBLIC_KEY) {
      // بدون VAPID key — نستخدم الإشعارات المحلية فقط
      return null
    }
    const sw = await navigator.serviceWorker.ready
    const existing = await sw.pushManager.getSubscription()
    if (existing) {
      await _savePushSubscription(existing, riderId, role)
      return existing
    }
    const subscription = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
    await _savePushSubscription(subscription, riderId, role)
    return subscription
  } catch {
    return null
  }
}

export async function unsubscribeFromPush(riderId: string | null): Promise<void> {
  try {
    const sw = await navigator.serviceWorker.ready
    const sub = await sw.pushManager.getSubscription()
    if (sub) {
      await sub.unsubscribe()
    }
    if (riderId) {
      await supabase.from('push_subscriptions').delete().eq('rider_id', riderId)
    }
  } catch {
    // silent
  }
}

async function _savePushSubscription(
  sub: PushSubscription,
  riderId: string | null,
  role: string
): Promise<void> {
  const json = sub.toJSON()
  await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh: (json.keys as any)?.p256dh ?? null,
      auth_key: (json.keys as any)?.auth ?? null,
      rider_id: riderId,
      role,
      user_agent: navigator.userAgent.slice(0, 255),
      last_seen: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  )
}

// ─── Local notifications (instant — via SW message) ──────────────────────────
// يشتغل لما التطبيق مفتوح أو في الـ background (مش مغلق كليًا)

export async function showLocalNotification(options: {
  title: string
  body: string
  tag?: string
  url?: string
  requireInteraction?: boolean
}): Promise<void> {
  // Try via Service Worker (works in background)
  if ('serviceWorker' in navigator) {
    const sw = await navigator.serviceWorker.ready.catch(() => null)
    if (sw?.active) {
      sw.active.postMessage({
        type: 'DAWAA_SHOW_NOTIFICATION',
        title: options.title,
        body: options.body,
        tag: options.tag ?? 'dawaa-notification',
        url: options.url ?? '/',
        requireInteraction: options.requireInteraction ?? false,
      })
      return
    }
  }
  // Fallback: Notification API direct
  if (Notification.permission === 'granted') {
    new Notification(options.title, {
      body: options.body,
      icon: '/pwa-icon-192.png',
      tag: options.tag,
      dir: 'rtl',
    })
  }
}

// ─── Auto-setup for riders ────────────────────────────────────────────────────

/** يُستدعى عند دخول الدليفري — يطلب الإذن ويسجّل الـ subscription تلقائيًا */
export async function setupRiderPushNotifications(riderId: string): Promise<void> {
  if (getPushPermissionStatus() === 'unsupported') return
  if (getPushPermissionStatus() !== 'granted') {
    const result = await requestPushPermission()
    if (result !== 'granted') return
  }
  await subscribeToPush(riderId, 'rider')
}
