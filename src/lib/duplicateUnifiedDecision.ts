export type DuplicateChoice = 'first' | 'second' | 'both' | 'none'

export interface DuplicateDecisionInput {
  token: string | null
  firstOrderId: string
  secondOrderId: string
  choice: DuplicateChoice
  rejectionReason: string
  managerNote: string
}

/** Transactional gateway, deliberately not enabled in the UI until the
 * production RPC and financial-counting contract pass integration tests. */
export async function submitUnifiedDuplicateDecision(
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  input: DuplicateDecisionInput,
) {
  if (!input.firstOrderId || !input.secondOrderId || input.firstOrderId === input.secondOrderId) {
    throw new Error('اختيار تسجيلين مختلفين مطلوب')
  }
  if (input.choice === 'both') {
    throw new Error('اعتماد الزيارتين متوقف لحين التحقق من منع احتساب قيمة الفاتورة مرتين')
  }
  if (!input.rejectionReason.trim()) throw new Error('سبب الرفض مطلوب')
  const { data, error } = await rpc('review_duplicate_invoice_pair_v1', {
    p_token: input.token,
    p_first_order_id: input.firstOrderId,
    p_second_order_id: input.secondOrderId,
    p_choice: input.choice,
    p_rejection_reason: input.rejectionReason.trim(),
    p_manager_note: input.managerNote.trim() || null,
  })
  if (error) throw new Error(error.message || 'تعذر حفظ قرار الفاتورة')
  if (!data || typeof data !== 'object') throw new Error('لم تؤكد قاعدة البيانات تنفيذ القرار')
  const result = data as Record<string, unknown>
  if (!['approved', 'rejected'].includes(String(result.first_status)) ||
      !['approved', 'rejected'].includes(String(result.second_status))) {
    throw new Error('استجابة الحفظ غير مكتملة')
  }
  return result
}
