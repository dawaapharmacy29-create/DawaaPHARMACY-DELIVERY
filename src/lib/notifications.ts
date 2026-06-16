import { supabase } from './supabase'
import { toast } from 'sonner'
import { showLocalNotification } from './pushNotifications'
import type { RiderDeviceStatusRow } from '../components/RiderDeviceStatusTable'

/**
 * Send a battery warning notification to a rider (Supabase DB + local push).
 * Shared between AdminDashboard and BranchManagerDashboard.
 */
export async function sendBatteryNotification(row: RiderDeviceStatusRow): Promise<void> {
  try {
    const message = row.battery_supported
      ? `تنبيه من الإدارة: بطارية جهازك الآن ${row.battery_percent ?? 'غير معروف'}%${
          row.is_charging ? ' والجهاز على الشاحن' : ' والجهاز ليس على الشاحن'
        }. برجاء الحفاظ على شحن الجهاز أثناء الشيفت.`
      : 'تنبيه من الإدارة: برجاء التأكد من شحن الهاتف وفتح التطبيق أثناء الشيفت.'

    const { error } = await supabase.rpc('create_rider_notification', {
      p_rider_id:        row.rider_id,
      p_title:           'تنبيه مهم بخصوص شحن الهاتف',
      p_message:         message,
      p_notification_type: 'battery_warning',
      p_severity:        row.warning_level === 'critical' ? 'danger' : 'warning',
      p_reference_table: 'rider_device_status',
      p_reference_id:    row.id ?? null,
      p_metadata: {
        battery_percent: row.battery_percent,
        is_charging:     row.is_charging,
        online:          row.online,
        source:          'admin_dashboard',
      },
    })
    if (error) throw error
    toast.success(`✅ تم إرسال التنبيه إلى ${row.rider_name || 'الدليفري'}`)
  } catch (e: any) {
    toast.error(e?.message || 'فشل إرسال التنبيه')
  }
}

/**
 * Send an urgent admin notification to all open browser tabs via SW.
 * Works when the admin app is in the foreground or background (not fully closed).
 */
export async function sendAdminBroadcast(options: {
  title: string
  body: string
  url?: string
  tag?: string
}): Promise<void> {
  await showLocalNotification({
    title: options.title,
    body: options.body,
    tag: options.tag ?? 'dawaa-admin',
    url: options.url ?? '/admin',
  })
}

/**
 * Notify all riders subscribed to push (stored in push_subscriptions table).
 * Requires a Supabase Edge Function "send-push" to be deployed with the VAPID private key.
 * Falls back to local notification if Edge Function is unavailable.
 */
export async function notifyRider(options: {
  riderId: string
  title: string
  body: string
  url?: string
  notificationType?: string
}): Promise<void> {
  // 1. Save to DB so it shows in NotificationBell
  await supabase.rpc('create_rider_notification', {
    p_rider_id:          options.riderId,
    p_title:             options.title,
    p_message:           options.body,
    p_notification_type: options.notificationType ?? 'general',
    p_severity:          'info',
    p_reference_table:   null,
    p_reference_id:      null,
    p_metadata:          {},
  }).then(({ error }) => { if (error) throw error })

  // 2. Try Edge Function for background push delivery
  const { error } = await supabase.functions.invoke('send-push', {
    body: {
      rider_id: options.riderId,
      title:    options.title,
      body:     options.body,
      url:      options.url ?? '/rider',
    },
  })

  if (error) {
    // Edge Function not deployed yet — fall back gracefully
    await showLocalNotification({
      title: options.title,
      body:  options.body,
      url:   options.url ?? '/rider',
    })
  }
}
