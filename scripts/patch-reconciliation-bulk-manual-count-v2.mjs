import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Bulk count v2 anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "  const [searchTerm, setSearchTerm] = useState('')",
  "  const [searchTerm, setSearchTerm] = useState('')\n  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())\n  const [bulkCounting, setBulkCounting] = useState(false)",
  'state',
)

const functions = [
  '  function toggleSelectedOrder(orderId: string) {',
  '    setSelectedOrders(previous => {',
  '      const next = new Set(previous)',
  '      next.has(orderId) ? next.delete(orderId) : next.add(orderId)',
  '      return next',
  '    })',
  '  }',
  '',
  '  function toggleAllVisibleOrders() {',
  '    const eligibleIds = filteredOrders.filter(order => !(order as any).deleted_at && !((order as any).is_countable === true)).map(order => order.id)',
  '    const allSelected = eligibleIds.length > 0 && eligibleIds.every(id => selectedOrders.has(id))',
  '    setSelectedOrders(previous => {',
  '      const next = new Set(previous)',
  '      eligibleIds.forEach(id => allSelected ? next.delete(id) : next.add(id))',
  '      return next',
  '    })',
  '  }',
  '',
  '  async function handleBulkManualMatch() {',
  '    const ids = [...selectedOrders].filter(id => {',
  '      const order = orders.find(item => item.id === id)',
  '      return order && !(order as any).deleted_at && !((order as any).is_countable === true)',
  '    })',
  "    if (!ids.length) return toast.error('حدد أوردرات غير محتسبة الأول')",
  '    setBulkCounting(true)',
  '    const failedIds: string[] = []',
  '    let approvedCount = 0',
  '    try {',
  '      for (let index = 0; index < ids.length; index += 40) {',
  '        const chunk = ids.slice(index, index + 40)',
  '        const multiplierIds = orders.filter(order => chunk.includes(order.id) && (order.order_multiplier ?? 1) >= 1.5).map(order => order.id)',
  '        const multiplierSet = new Set(multiplierIds)',
  '        const normalIds = chunk.filter(id => !multiplierSet.has(id))',
  '        const updates: any[] = []',
  "        if (normalIds.length) updates.push(supabase.from('delivery_orders').update({ bconnect_match_status:'manually_approved', is_countable:true, final_count_status:'counted_manual_approval', count_exclusion_reason:null, reconciliation_notes:'اعتماد يدوي جماعي بواسطة الإدارة', updated_at:new Date().toISOString() }).in('id', normalIds))",
  "        if (multiplierIds.length) updates.push(supabase.from('delivery_orders').update({ bconnect_match_status:'manually_approved', is_countable:true, final_count_status:'counted_multiplier_manual_approval', count_exclusion_reason:null, reconciliation_notes:'اعتماد يدوي جماعي — أوردر ×1.5 ما زال للمراجعة الإدارية', updated_at:new Date().toISOString() }).in('id', multiplierIds))",
  '        const results = await Promise.all(updates)',
  '        if (results.some(result => result.error)) failedIds.push(...chunk)',
  '        else approvedCount += chunk.length',
  '      }',
  '      setSelectedOrders(new Set(failedIds))',
  "      if (failedIds.length) toast.error('تم احتساب ' + approvedCount + ' أوردر، وتعذر احتساب ' + failedIds.length + '. المتبقي ما زال محددًا لإعادة المحاولة.')",
  "      else toast.success('تم الاحتساب اليدوي لـ ' + approvedCount + ' أوردر')",
  '      await loadAll()',
  '    } catch (error: any) {',
  "      toast.error('فشل الاحتساب اليدوي الجماعي: ' + (error?.message ?? ''))",
  '    } finally { setBulkCounting(false) }',
  '  }',
  '',
].join('\n')

replaceOnce('  async function handleMarkNotFound(orderId: string) {', functions + '  async function handleMarkNotFound(orderId: string) {', 'functions')

const toolbar = [
  '        {filteredOrders.length > 0 && (',
  '          <div className="sticky top-2 z-20 rounded-3xl border border-emerald-100 bg-white p-4 shadow-lg">',
  '            <div className="flex flex-wrap items-center gap-2">',
  '              <button type="button" onClick={toggleAllVisibleOrders} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">تحديد كل الظاهر غير المحتسب</button>',
  '              <button type="button" onClick={() => void handleBulkManualMatch()} disabled={!selectedOrders.size || bulkCounting} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{bulkCounting ? \'جاري الاحتساب...\' : \'احتساب يدوي للمحدد (\' + selectedOrders.size + \')\'}</button>',
  '              {selectedOrders.size > 0 && <button type="button" onClick={() => setSelectedOrders(new Set())} disabled={bulkCounting} className="rounded-xl border px-4 py-2 text-sm font-black">إلغاء التحديد</button>}',
  '            </div>',
  '          </div>',
  '        )}',
  '',
].join('\n')
replaceOnce('        {filteredOrders.length === 0 ? (', toolbar + '        {filteredOrders.length === 0 ? (', 'toolbar')

replaceOnce(
  '                <div key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">',
  '                <div key={order.id} className={"rounded-2xl bg-white p-4 shadow-sm transition " + (selectedOrders.has(order.id) ? "ring-2 ring-emerald-500" : "")}>' +
  '\n                  {!(order as any).deleted_at && !isCounted && (<label className="mb-3 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800"><input type="checkbox" checked={selectedOrders.has(order.id)} onChange={() => toggleSelectedOrder(order.id)} className="h-4 w-4 accent-emerald-600" />تحديد للاحتساب اليدوي</label>)}',
  'checkbox',
)

await writeFile(file, source, 'utf8')
console.log('Reconciliation bulk manual count v2 applied')
