import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Incremental reconciliation anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "type FilterKey = 'all' | 'counted' | 'pending' | 'not_found' | 'failed' | 'duplicate' | 'multiplier' | 'deleted'",
  "type FilterKey = 'all' | 'counted' | 'pending' | 'not_found' | 'failed' | 'duplicate' | 'multiplier' | 'customer_mismatch' | 'deleted'",
  'filter type',
)

replaceOnce(
  "  bconnectWithoutRider: number\n}",
  "  bconnectWithoutRider: number\n  customerNameMismatches: number\n}",
  'report mismatch field',
)

replaceOnce(
  "function normalizeOrderInvoice(order: DeliveryOrder): string {\n  return normalizeInvoice((order as any).invoice_number || (order as any).invoice_no)\n}",
  `function normalizeOrderInvoice(order: DeliveryOrder): string {
  return normalizeInvoice((order as any).invoice_number || (order as any).invoice_no)
}

function customerNamesDiffer(appName: unknown, systemName: unknown): boolean {
  const app = normalizeArabicText(appName)
  const system = normalizeArabicText(systemName)
  if (!app || !system) return false
  if (app === system || app.includes(system) || system.includes(app)) return false
  return true
}

function systemInvoiceKey(invoice: unknown, branch: unknown): string {
  return \`${'${normalizeInvoice(invoice)}'}::${'${normalizeBranchName(branch)}'}\`
}`,
  'name comparison helpers',
)

replaceOnce(
  "    const invoice = normalizeInvoice(first(row, INVOICE_KEYS))\n    if (!invoice || seen.has(invoice)) continue\n    seen.add(invoice)",
  "    const invoice = normalizeInvoice(first(row, INVOICE_KEYS))\n    const branchName = first(row, BRANCH_KEYS)\n    const dedupeKey = systemInvoiceKey(invoice, branchName)\n    if (!invoice || seen.has(dedupeKey)) continue\n    seen.add(dedupeKey)",
  'file dedupe key',
)
replaceOnce("      branch_name: first(row, BRANCH_KEYS),", "      branch_name: branchName,", 'parsed branch reuse')

replaceOnce(
  "    if (incoming && ['all','counted','pending','not_found','failed','duplicate','multiplier','deleted'].includes(incoming)) setFilter(incoming)",
  "    if (incoming && ['all','counted','pending','not_found','failed','duplicate','multiplier','customer_mismatch','deleted'].includes(incoming)) setFilter(incoming)",
  'filter whitelist',
)

replaceOnce(
  "      (filter === 'multiplier' && isMultiplier && !isDeleted) ||\n      (filter === 'deleted' && isDeleted)",
  "      (filter === 'multiplier' && isMultiplier && !isDeleted) ||\n      (filter === 'customer_mismatch' && String((order as any).bconnect_match_status) === 'matched_customer_name_mismatch' && !isDeleted) ||\n      (filter === 'deleted' && isDeleted)",
  'mismatch filter',
)

replaceOnce("      const bconnect = parseBConnectRows(rows)", "      const uploadedInvoices = parseBConnectRows(rows)", 'uploaded rows variable')
replaceOnce("      if (!bconnect.length) {", "      if (!uploadedInvoices.length) {", 'empty upload check')
replaceOnce("      console.info('Reconciliation import sample invoices', bconnect.slice(0, 10).map(r => r.invoice_number))", "      console.info('Reconciliation import sample invoices', uploadedInvoices.slice(0, 10).map(r => r.invoice_number))", 'sample log')
replaceOnce("        p_period_start: period.start,\n        p_period_end: period.end,", "        p_period_start: selectedFrom,\n        p_period_end: selectedTo,", 'selected cycle batch')
replaceOnce("        p_delivery_rows: bconnect.length", "        p_delivery_rows: uploadedInvoices.length", 'uploaded row count')
replaceOnce("      if (batchId && bconnect.length) {", "      if (batchId && uploadedInvoices.length) {", 'insert condition')
replaceOnce("          bconnect.map(row => ({", "          uploadedInvoices.map(row => ({", 'insert current upload')
replaceOnce("             period_start: period.start,\n             period_end: period.end,", "             period_start: selectedFrom,\n             period_end: selectedTo,", 'invoice cycle values')
replaceOnce(
  "        const { error: invoiceInsertError } = await supabase.from('monthly_system_invoices').insert(",
  "        const { error: invoiceInsertError } = await supabase.from('monthly_system_invoices').upsert(",
  'invoice upsert',
)
replaceOnce(
  "          }))\n        )\n        if (invoiceInsertError) throw invoiceInsertError\n      }\n\n      const bconnectMap = new Map(bconnect.map(row => [row.invoice_number, row])) // رقم الفاتورة هو العلامة المميزة الأساسية",
  `          })),
          { onConflict: 'period_start,period_end,normalized_branch_name,invoice_number' }
        )
        if (invoiceInsertError) throw invoiceInsertError
      }

      const { data: accumulatedRows, error: accumulatedError } = await supabase
        .from('monthly_system_invoices')
        .select('*')
        .eq('period_start', selectedFrom)
        .eq('period_end', selectedTo)
      if (accumulatedError) throw accumulatedError

      const bconnect: BConnectRow[] = (accumulatedRows || []).map((row: any) => ({
        invoice_number: normalizeInvoice(row.invoice_number),
        invoice_type: row.invoice_type || '',
        branch_name: row.branch_name || '',
        customer_code: row.customer_code || '',
        customer_name: row.customer_name || '',
        phone: row.customer_phone || '',
        address: row.delivery_address || '',
        invoice_date: row.invoice_date_text || '',
        invoice_amount: Number(row.net_total ?? row.gross_total ?? 0),
        gross_total: Number(row.gross_total || 0),
        net_total: Number(row.net_total || 0),
        system_user: row.system_user_name || '',
        close_time: row.close_time_text || '',
        raw: row.raw_json || row,
      }))

      const exactSystemMap = new Map(bconnect.map(row => [systemInvoiceKey(row.invoice_number, row.branch_name), row]))
      const candidatesByInvoice = new Map<string, BConnectRow[]>()
      bconnect.forEach(row => {
        const list = candidatesByInvoice.get(row.invoice_number) || []
        list.push(row)
        candidatesByInvoice.set(row.invoice_number, list)
      })
      const findSystemMatch = (order: DeliveryOrder) => {
        const invoice = normalizeOrderInvoice(order)
        if (!invoice) return null
        const branch = (order as any).branch_name || ''
        const exact = exactSystemMap.get(systemInvoiceKey(invoice, branch))
        if (exact) return exact
        const candidates = candidatesByInvoice.get(invoice) || []
        return candidates.length === 1 ? candidates[0] : null
      }`,
  'load accumulated cycle invoices',
)

replaceOnce("         .gte('delivery_date', period.start)\n         .lte('delivery_date', period.end)", "         .gte('delivery_date', selectedFrom)\n         .lte('delivery_date', selectedTo)", 'selected order cycle')
replaceOnce("      let multiplierReview = 0", "      let multiplierReview = 0\n      let customerNameMismatches = 0", 'mismatch counter')
replaceOnce("        const match = inv ? bconnectMap.get(inv) : null", "        const match = findSystemMatch(order)\n        const nameMismatch = Boolean(match && customerNamesDiffer((order as any).customer_name || order.customer_name_snapshot, match.customer_name))", 'system match selection')
replaceOnce(
  "          reconciliationStatus = 'matched'\n          differenceReason = ''\n          counted++",
  "          reconciliationStatus = nameMismatch ? 'matched_customer_name_mismatch' : 'matched'\n          differenceReason = nameMismatch ? 'رقم الفاتورة مطابق لكن اسم العميل مختلف ويحتاج مراجعة' : ''\n          if (nameMismatch) customerNameMismatches++\n          counted++",
  'mismatch status',
)
replaceOnce(
  "            bconnect_match_status: 'matched',\n            matched_at: new Date().toISOString(),\n            matched_amount: match.invoice_amount,\n            is_countable: true,\n            final_count_status: isMultiplier ? 'counted_multiplier_pending_value_review' : 'counted',\n            count_exclusion_reason: null,\n            reconciliation_notes: isMultiplier ? 'مطابقة ومحتاجة مراجعة قيمة ×1.5' : 'مطابقة مع ملف السيستم وتحتسب',",
  "            bconnect_match_status: nameMismatch ? 'matched_customer_name_mismatch' : 'matched',\n            matched_at: new Date().toISOString(),\n            matched_amount: match.invoice_amount,\n            is_countable: true,\n            final_count_status: isMultiplier ? 'counted_multiplier_pending_value_review' : (nameMismatch ? 'counted_customer_name_review' : 'counted'),\n            count_exclusion_reason: null,\n            reconciliation_notes: nameMismatch ? `الفاتورة تحتسب لأن الرقم مطابق، مع اختلاف اسم العميل: التطبيق (${(order as any).customer_name || order.customer_name_snapshot || '—'}) / السيستم (${match.customer_name || '—'})` : (isMultiplier ? 'مطابقة ومحتاجة مراجعة قيمة ×1.5' : 'مطابقة مع ملف السيستم وتحتسب'),",
  'countable mismatch patch',
)
replaceOnce("           period_start: period.start,\n           period_end: period.end,", "           period_start: selectedFrom,\n           period_end: selectedTo,", 'result cycle')
replaceOnce("          needs_review: !Boolean((patch as any).is_countable),", "          needs_review: nameMismatch || !Boolean((patch as any).is_countable),", 'mismatch review flag')
replaceOnce(
  "      if (batchId && resultRows.length) {\n        const { error: resultInsertError } = await supabase.from('monthly_invoice_reconciliation_results').insert(resultRows)",
  "      if (batchId && resultRows.length) {\n        const { error: clearResultsError } = await supabase.from('monthly_invoice_reconciliation_results').delete().eq('period_start', selectedFrom).eq('period_end', selectedTo)\n        if (clearResultsError) throw clearResultsError\n        const { error: resultInsertError } = await supabase.from('monthly_invoice_reconciliation_results').insert(resultRows)",
  'replace cycle snapshot results',
)
replaceOnce("          p_period_start: period.start,\n          p_period_end: period.end", "          p_period_start: selectedFrom,\n          p_period_end: selectedTo", 'archive selected cycle')
replaceOnce("           period_start: period.start,\n           period_end: period.end,\n           match_date: period.end,", "           period_start: selectedFrom,\n           period_end: selectedTo,\n           match_date: selectedTo,", 'upload log cycle')
replaceOnce("           notes: `B-Connect: ${bconnect.length} | Rider orders: ${currentOrders.length} | Failed excluded: ${failedExcluded} | 1.5 review: ${multiplierReview}`,", "           notes: `الملف الحالي: ${uploadedInvoices.length} | إجمالي فواتير الدورة بعد الدمج: ${bconnect.length} | Rider orders: ${currentOrders.length} | اختلاف اسم العميل: ${customerNameMismatches} | Failed excluded: ${failedExcluded} | 1.5 review: ${multiplierReview}`,", 'cumulative log notes')
replaceOnce("         customerNameMismatches: number\n}", "         customerNameMismatches: number\n}", 'noop')
replaceOnce("        bconnectWithoutRider: bconnectOnly.length,\n      })", "        bconnectWithoutRider: bconnectOnly.length,\n        customerNameMismatches,\n      })", 'report mismatch value')
replaceOnce("      toast.success('تمت المطابقة وحفظ أرشيف الشهر لكل دليفري')", "      toast.success(`تم دمج ${uploadedInvoices.length} فاتورة مع الدورة. الإجمالي التراكمي الآن ${bconnect.length} فاتورة، والمطابقة أُعيدت على كل الدورة.`)", 'success message')

await writeFile(file, source, 'utf8')
console.log('Reconciliation now accumulates all uploaded files per selected cycle and flags customer-name differences')
