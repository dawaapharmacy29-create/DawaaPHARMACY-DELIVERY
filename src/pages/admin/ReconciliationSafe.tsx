import Reconciliation from './Reconciliation'
import { supabase } from '../../lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function findBatchId(value: unknown): string | null {
  if (typeof value === 'string') return UUID_RE.test(value) ? value : null
  if (!value || typeof value !== 'object') return null

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBatchId(item)
      if (found) return found
    }
    return null
  }

  const row = value as Record<string, unknown>
  for (const key of ['batch_id', 'id', 'save_monthly_invoice_import_batch']) {
    const direct = row[key]
    if (typeof direct === 'string' && UUID_RE.test(direct)) return direct
  }

  for (const nested of Object.values(row)) {
    const found = findBatchId(nested)
    if (found) return found
  }
  return null
}

const client = supabase as any
if (!client.__reconciliationBatchRpcPatched) {
  const originalRpc = client.rpc.bind(client)
  client.rpc = async (functionName: string, args?: unknown, options?: unknown) => {
    const result = await originalRpc(functionName, args, options)
    if (functionName !== 'save_monthly_invoice_import_batch' || result?.error) return result

    const batchId = findBatchId(result?.data)
    if (batchId) return { ...result, data: batchId }

    return {
      ...result,
      data: null,
      error: {
        code: 'INVALID_BATCH_ID',
        message: 'تعذر تحديد رقم دفعة المطابقة بعد حفظ الملف',
        details: 'الدالة save_monthly_invoice_import_batch لم تُرجع UUID صالحًا للدفعة.',
        hint: 'راجع نوع القيمة المرجعة من الدالة في Supabase.',
      },
    }
  }
  client.__reconciliationBatchRpcPatched = true
}

export default Reconciliation
