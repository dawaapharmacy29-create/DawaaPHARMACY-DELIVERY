/** Manager-authorized, sequential chunk writes. A failed chunk leaves the
 * batch unfinalized; completed historical snapshots remain readable. */
export async function writeReconciliationBatchChunks(
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ error: any }>,
  params: { token: string | null; batchId: string; kind: 'invoice' | 'result'; rows: unknown[] },
) {
  if (!params.batchId || !params.rows.length) throw new Error('invalid_reconciliation_batch')
  const chunkSize = 25
  for (let offset = 0; offset < params.rows.length; offset += chunkSize) {
    const chunk = params.rows.slice(offset, offset + chunkSize)
    const { error } = await rpc('write_delivery_reconciliation_chunk_v1', {
      p_token: params.token,
      p_batch_id: params.batchId,
      p_kind: params.kind,
      p_rows: chunk,
    })
    if (error) throw error
  }
}

export async function finalizeReconciliationBatch(
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }>,
  params: { token: string | null; batchId: string; expectedResults: number },
) {
  if (!params.batchId || params.expectedResults < 1) throw new Error('invalid_reconciliation_result_count')
  const { data, error } = await rpc('finish_delivery_reconciliation_batch_v1', {
    p_token: params.token,
    p_batch_id: params.batchId,
    p_expected_results: params.expectedResults,
  })
  if (error) throw error
  if (Number(data) !== params.expectedResults) throw new Error('reconciliation_completion_unconfirmed')
}
