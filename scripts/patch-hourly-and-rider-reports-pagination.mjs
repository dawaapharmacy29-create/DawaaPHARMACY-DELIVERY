import { readFile, writeFile } from 'node:fs/promises'

async function patchFile(relativePath, patcher) {
  const file = new URL(`../${relativePath}`, import.meta.url)
  let source = await readFile(file, 'utf8')
  const next = patcher(source)
  if (next !== source) await writeFile(file, next, 'utf8')
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source
  if (!source.includes(before)) throw new Error(`Pagination/report patch anchor not found: ${label}`)
  return source.replace(before, after)
}

const paginationHelper = `async function fetchAllPages(buildQuery: () => any, pageSize = 1000) {
  const rows: any[] = []
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await buildQuery().range(start, start + pageSize - 1)
    if (error) throw error
    const page = data || []
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

`

await patchFile('src/pages/admin/HourlyDeliveryAnalytics.tsx', source => {
  source = replaceOnce(
    source,
    "function addDays(date: Date, days: number) {",
    paginationHelper + "function addDays(date: Date, days: number) {",
    'hourly pagination helper',
  )

  source = replaceOnce(
    source,
    "        supabase.from('delivery_orders').select('*').gte('delivery_date', from).lte('delivery_date', to).limit(50000),\n        supabase.from('delivery_orders').select('*').gte('work_date', from).lte('work_date', to).limit(50000),\n        supabase.from('delivery_order_edit_logs').select('*').gte('created_at', editFrom).lte('created_at', editTo).limit(50000),",
    "        fetchAllPages(() => supabase.from('delivery_orders').select('*').gte('delivery_date', from).lte('delivery_date', to).order('id', { ascending: true })),\n        fetchAllPages(() => supabase.from('delivery_orders').select('*').gte('work_date', from).lte('work_date', to).order('id', { ascending: true })),\n        fetchAllPages(() => supabase.from('delivery_order_edit_logs').select('*').gte('created_at', editFrom).lte('created_at', editTo).order('id', { ascending: true })),",
    'hourly full pagination queries',
  )

  source = replaceOnce(
    source,
    "      const rawOrders = [byDeliveryDate, byWorkDate].flatMap((result: any) => result.status === 'fulfilled' && !result.value.error ? (result.value.data || []) : [])\n      const rows = uniqueById(rawOrders).filter(row => inRange(pickDate(row), from, to))\n      const logRows = editLogs.status === 'fulfilled' && !(editLogs.value as any).error ? ((editLogs.value as any).data || []) : []",
    "      const rawOrders = [byDeliveryDate, byWorkDate].flatMap(result => result.status === 'fulfilled' ? (result.value as OrderRow[]) : [])\n      const rows = uniqueById(rawOrders).filter(row => inRange(pickDate(row), from, to))\n      const logRows = editLogs.status === 'fulfilled' ? (editLogs.value as OrderRow[]) : []",
    'hourly paginated result handling',
  )

  source = replaceOnce(
    source,
    "          <button onClick={loadData} disabled={loading} className=\"rounded-2xl border bg-white p-2 text-slate-600 transition hover:bg-slate-50 active:scale-95\">\n            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />\n          </button>",
    "          <div className=\"flex items-center gap-2\">\n            <button onClick={() => navigate('/admin/rider-monthly-reports')} className=\"rounded-2xl bg-[#008E92] px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-[#00777b] active:scale-95\">تقرير المناديب PDF</button>\n            <button onClick={loadData} disabled={loading} className=\"rounded-2xl border bg-white p-2 text-slate-600 transition hover:bg-slate-50 active:scale-95\">\n              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />\n            </button>\n          </div>",
    'hourly report button',
  )

  return source
})

await patchFile('src/pages/admin/RiderMonthlyReports.tsx', source => {
  source = replaceOnce(
    source,
    "function iso(date: Date) {",
    paginationHelper + "function iso(date: Date) {",
    'report pagination helper',
  )

  source = replaceOnce(
    source,
    "      supabase.from('delivery_orders').select('*').eq('rider_id', riderId).gte('work_date', from).lte('work_date', to).order('work_date', { ascending: false }),\n      supabase.from('internal_trips').select('*').eq('rider_id', riderId).gte('work_date', from).lte('work_date', to).order('work_date', { ascending: false }),\n      supabase.from('rider_adjustments').select('*').eq('rider_id', riderId).gte('cycle_start', from).lte('cycle_end', to).order('created_at', { ascending: false }),",
    "      fetchAllPages(() => supabase.from('delivery_orders').select('*').eq('rider_id', riderId).gte('work_date', from).lte('work_date', to).order('id', { ascending: true })),\n      fetchAllPages(() => supabase.from('internal_trips').select('*').eq('rider_id', riderId).gte('work_date', from).lte('work_date', to).order('id', { ascending: true })),\n      fetchAllPages(() => supabase.from('rider_adjustments').select('*').eq('rider_id', riderId).gte('cycle_start', from).lte('cycle_end', to).order('id', { ascending: true })),",
    'report full pagination queries',
  )

  source = replaceOnce(
    source,
    "    setOrders(ordersRes.status === 'fulfilled' && !ordersRes.value.error ? ((ordersRes.value.data || []) as Row[]) : [])\n    setTrips(tripsRes.status === 'fulfilled' && !tripsRes.value.error ? ((tripsRes.value.data || []) as Row[]) : [])\n    setAdjustments(adjustmentsRes.status === 'fulfilled' && !adjustmentsRes.value.error ? ((adjustmentsRes.value.data || []) as Row[]) : [])\n    if (adjustmentsRes.status === 'fulfilled' && adjustmentsRes.value.error) toast.warning('شغل Migration 0072 لتفعيل جدول الحركات')",
    "    setOrders(ordersRes.status === 'fulfilled' ? (ordersRes.value as Row[]) : [])\n    setTrips(tripsRes.status === 'fulfilled' ? (tripsRes.value as Row[]) : [])\n    setAdjustments(adjustmentsRes.status === 'fulfilled' ? (adjustmentsRes.value as Row[]) : [])\n    if (adjustmentsRes.status === 'rejected') toast.warning('تعذر تحميل الحركات أو جدول الحركات غير مفعل')",
    'report paginated result handling',
  )

  return source
})

console.log('Hourly analytics and rider monthly reports now use complete paginated loading; PDF report link is visible')
