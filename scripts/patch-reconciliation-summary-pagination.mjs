import { readFile, writeFile } from 'node:fs/promises'

async function patchSummary() {
  const file = new URL('../src/components/ReconciliationCycleSummary.tsx', import.meta.url)
  let source = await readFile(file, 'utf8')

  const helperAnchor = "const n = (value: unknown) => Number(value || 0)"
  const helper = `const n = (value: unknown) => Number(value || 0)

async function loadAllCycleOrders(from: string, to: string) {
  const pageSize = 1000
  const all: any[] = []
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('delivery_orders')
      .select('id,status,is_countable,final_count_status,bconnect_match_status,is_duplicate_invoice,deleted_at')
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .range(start, start + pageSize - 1)
    if (error) throw error
    const rows = data || []
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return all
}`
  if (!source.includes(helper)) {
    if (!source.includes(helperAnchor)) throw new Error('summary helper anchor not found')
    source = source.replace(helperAnchor, helper)
  }

  const oldPromise = `const [{ data: progressData, error: progressError }, { data: orderData, error: orderError }] = await Promise.all([
        supabase
          .from('delivery_reconciliation_cycle_progress')
          .select('*')
          .eq('period_start', from)
          .eq('period_end', to)
          .maybeSingle(),
        supabase
          .from('delivery_orders')
          .select('id,status,is_countable,final_count_status,bconnect_match_status,is_duplicate_invoice,deleted_at')
          .gte('delivery_date', from)
          .lte('delivery_date', to),
      ])
      if (progressError) throw progressError
      if (orderError) throw orderError
      const active = (orderData || []).filter((row: any) => !row.deleted_at)`
  const newPromise = `const [{ data: progressData, error: progressError }, orderData] = await Promise.all([
        supabase
          .from('delivery_reconciliation_cycle_progress')
          .select('*')
          .eq('period_start', from)
          .eq('period_end', to)
          .maybeSingle(),
        loadAllCycleOrders(from, to),
      ])
      if (progressError) throw progressError
      const active = orderData.filter((row: any) => !row.deleted_at)`
  if (!source.includes(newPromise)) {
    if (!source.includes(oldPromise)) throw new Error('summary Promise anchor not found')
    source = source.replace(oldPromise, newPromise)
  }

  await writeFile(file, source, 'utf8')
}

async function patchPeriodLabel() {
  const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
  let source = await readFile(file, 'utf8')
  const before = '<p className="text-sm text-white/80">الدورة الحالية: {period.start} إلى {period.end} — الفاشل لا يحتسب، والتكرار يحتاج مراجعة</p>'
  const after = '<p className="text-sm text-white/80">الفترة المختارة: {selectedFrom} إلى {selectedTo} — الفاشل لا يحتسب، والتكرار يحتاج مراجعة</p>'
  if (!source.includes(after)) {
    if (!source.includes(before)) throw new Error('period header anchor not found')
    source = source.replace(before, after)
  }
  await writeFile(file, source, 'utf8')
}

await patchSummary()
await patchPeriodLabel()
console.log('Reconciliation summary now loads every order page and shows the selected period')
