import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/TripsEnhanced.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const before = "  async function bulkApprove(){const ids=[...selected].filter(id=>trips.find(t=>t.id===id)?.status==='pending_approval');if(!ids.length)return toast.error('اختر مشاوير مستنية اعتماد');const previous=trips.filter(t=>ids.includes(t.id));setTrips(rows=>rows.map(t=>ids.includes(t.id)?{...t,status:'approved',review_status:'approved',approved_at:new Date().toISOString(),rejection_reason:null,needs_review:false}:t));const {error}=await supabase.from('internal_trips').update({status:'approved',review_status:'approved',approved_at:new Date().toISOString(),rejection_reason:null,needs_review:false,review_reason:null,proof_archive_status:'queued',proof_archive_requested_at:new Date().toISOString()}).in('id',ids);if(error){const oldMap=new Map(previous.map(t=>[t.id,t]));setTrips(rows=>rows.map(t=>oldMap.get(t.id)||t));toast.error('فشل اعتماد المجموعة وتمت إعادة الحالات السابقة')}else{setSelected(new Set());toast.success(`تم اعتماد ${englishNumber(ids.length)} مشوار`)}}"

const after = `  async function bulkApprove() {
    const ids = [...selected].filter(id => trips.find(t => t.id === id)?.status === 'pending_approval')
    if (!ids.length) return toast.error('اختر مشاوير مستنية اعتماد')

    const chunkSize = 40
    const approvedIds: string[] = []
    const failedIds: string[] = []
    const approvedAt = new Date().toISOString()
    setBusy(new Set(ids))

    try {
      for (let index = 0; index < ids.length; index += chunkSize) {
        const chunk = ids.slice(index, index + chunkSize)
        const { error } = await supabase
          .from('internal_trips')
          .update({
            status: 'approved',
            review_status: 'approved',
            approved_at: approvedAt,
            rejection_reason: null,
            needs_review: false,
            review_reason: null,
          })
          .in('id', chunk)

        if (error) {
          failedIds.push(...ids.slice(index))
          console.error('Bulk trip approval failed', { error, chunkStart: index, chunkSize: chunk.length })
          break
        }

        approvedIds.push(...chunk)
        const approvedSet = new Set(chunk)
        setTrips(rows => rows.map(t => approvedSet.has(t.id) ? {
          ...t,
          status: 'approved',
          review_status: 'approved',
          approved_at: approvedAt,
          rejection_reason: null,
          needs_review: false,
          review_reason: null,
          proof_archive_status: proofUrl(t) ? 'queued' : t.proof_archive_status,
          proof_archive_requested_at: proofUrl(t) ? approvedAt : t.proof_archive_requested_at,
        } : t))
      }

      if (failedIds.length) {
        setSelected(new Set(failedIds))
        toast.error(
          approvedIds.length
            ? \`تم اعتماد \${englishNumber(approvedIds.length)} مشوار، وتعذر اعتماد \${englishNumber(failedIds.length)}. المشاوير المتبقية ما زالت محددة لإعادة المحاولة.\`
            : 'تعذر اعتماد المشاوير. لم يتم تغيير الحالات، وحافظنا على الاختيار لإعادة المحاولة.',
          { duration: 9000 },
        )
      } else {
        setSelected(new Set())
        toast.success(\`تم اعتماد \${englishNumber(approvedIds.length)} مشوار\`)
      }
    } finally {
      setBusy(new Set())
    }
  }`

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error('Trips bulk approval anchor not found')
  source = source.replace(before, after)
}

await writeFile(file, source, 'utf8')
console.log('Large trip approvals are now written safely in small chunks with partial-progress recovery')
await import('./patch-trip-rejection-reasons.mjs')
