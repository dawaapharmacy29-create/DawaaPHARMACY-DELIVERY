/**
 * Supabase Edge Function: daily-report
 * بيولد تقرير يومي بصيغة JSON جاهزة للتحويل لـ PDF
 * يتشغل تلقائياً كل يوم أو بطلب مباشر من الأدمن
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const targetDate: string = body.date ?? new Date().toISOString().slice(0, 10)

    // ── جلب البيانات ───────────────────────────────────────────────────────
    const [ordersRes, tripsRes, attendanceRes, ridersRes] = await Promise.all([
      supabase.from('delivery_orders').select('*').eq('delivery_date', targetDate),
      supabase.from('internal_trips').select('*').eq('trip_date', targetDate),
      supabase.from('attendance').select('*').eq('work_date', targetDate),
      supabase.from('riders').select('id, name, branch_id, branch_name, status').eq('status', 'active'),
    ])

    const orders = (ordersRes.data ?? []) as any[]
    const trips = (tripsRes.data ?? []) as any[]
    const attendance = (attendanceRes.data ?? []) as any[]
    const riders = (ridersRes.data ?? []) as any[]

    // ── حساب الإحصائيات ────────────────────────────────────────────────────
    const delivered = orders.filter(o => o.status === 'delivered').length
    const failed = orders.filter(o => o.status === 'failed').length
    const pending = orders.filter(o => o.status === 'registered' || o.status === 'needs_review').length
    const duplicates = orders.filter(o => o.is_duplicate_invoice).length
    const multiplier = orders.filter(o => (o.order_multiplier ?? 1) >= 1.5).length

    // إحصائيات لكل مندوب
    const riderStats = riders.map(rider => {
      const rOrders = orders.filter(o => o.rider_id === rider.id)
      const rTrips = trips.filter(t => t.rider_id === rider.id)
      const att = attendance.find(a => a.rider_id === rider.id)
      const checkedIn = !!att?.check_in_at
      const checkedOut = !!att?.check_out_at
      const workMinutes = att?.total_minutes ?? 0

      return {
        rider_id: rider.id,
        rider_name: rider.name,
        branch: rider.branch_name ?? 'غير محدد',
        checked_in: checkedIn,
        checked_out: checkedOut,
        work_hours: workMinutes > 0 ? `${Math.floor(workMinutes / 60)}:${String(workMinutes % 60).padStart(2, '0')}` : '—',
        orders_total: rOrders.length,
        orders_delivered: rOrders.filter(o => o.status === 'delivered').length,
        orders_failed: rOrders.filter(o => o.status === 'failed').length,
        orders_pending: rOrders.filter(o => o.status === 'registered').length,
        orders_duplicate: rOrders.filter(o => o.is_duplicate_invoice).length,
        orders_multiplier: rOrders.filter(o => (o.order_multiplier ?? 1) >= 1.5).length,
        trips_total: rTrips.length,
        trips_approved: rTrips.filter(t => t.status === 'approved').length,
        trips_pending: rTrips.filter(t => t.status === 'pending_approval').length,
      }
    }).filter(r => r.orders_total > 0 || r.checked_in)

    // مندوبون غائبون
    const absentRiders = riders.filter(r => !attendance.find(a => a.rider_id === r.id))

    // فروع
    const branchSet = new Set<string>(riders.map(r => r.branch_name ?? 'غير محدد').filter(Boolean))
    const branchSummary = [...branchSet].map(bName => {
      const brOrders = orders.filter(o => (o.branch_name ?? '') === bName)
      return {
        branch: bName,
        orders: brOrders.length,
        delivered: brOrders.filter(o => o.status === 'delivered').length,
        failed: brOrders.filter(o => o.status === 'failed').length,
        riders_active: riderStats.filter(r => r.branch === bName).length,
      }
    })

    const report = {
      generated_at: new Date().toISOString(),
      date: targetDate,
      summary: {
        orders_total: orders.length,
        orders_delivered: delivered,
        orders_failed: failed,
        orders_pending: pending,
        orders_duplicate: duplicates,
        orders_multiplier: multiplier,
        delivery_rate: orders.length > 0 ? Math.round((delivered / orders.length) * 100) : 0,
        trips_total: trips.length,
        trips_approved: trips.filter(t => t.status === 'approved').length,
        riders_present: attendance.filter(a => a.check_in_at).length,
        riders_absent: absentRiders.length,
      },
      rider_stats: riderStats,
      branch_summary: branchSummary,
      absent_riders: absentRiders.map(r => ({ id: r.id, name: r.name, branch: r.branch_name })),
    }

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
