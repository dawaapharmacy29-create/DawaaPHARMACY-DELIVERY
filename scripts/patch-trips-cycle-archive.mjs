import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/TripsEnhanced.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

function replaceOnce(before, after, label) {
  if (source.includes(after)) return
  if (!source.includes(before)) throw new Error(`Trips patch anchor not found: ${label}`)
  source = source.replace(before, after)
}

replaceOnce(
  "import { useNavigate } from 'react-router-dom'",
  "import { useNavigate, useSearchParams } from 'react-router-dom'",
  'search params import',
)
replaceOnce(
  "import type { InternalTrip, Rider } from '../../lib/types'",
  "import type { InternalTrip, Rider } from '../../lib/types'\nimport CycleSelector from '../../components/CycleSelector'",
  'cycle selector import',
)
replaceOnce(
  "type TripRow = InternalTrip & { rider_name?: string | null; branch_name?: string | null; proof_image_url?: string | null; proof_captured_at?: string | null; created_at?: string | null }",
  "type TripRow = InternalTrip & { rider_name?: string | null; branch_name?: string | null; proof_image_url?: string | null; proof_captured_at?: string | null; created_at?: string | null; proof_archive_status?: string | null; proof_archive_drive_url?: string | null; proof_archive_requested_at?: string | null }",
  'archive fields type',
)
replaceOnce(
  "  const navigate = useNavigate()\n  const period = useMemo(() => getOperationalPeriod(), [])",
  "  const navigate = useNavigate()\n  const [searchParams, setSearchParams] = useSearchParams()\n  const period = useMemo(() => getOperationalPeriod(), [])\n  const selectedFrom = searchParams.get('from') || period.start\n  const selectedTo = searchParams.get('to') || period.end",
  'selected period state',
)
replaceOnce(
  "  async function load() {\n    setLoading(true)\n    try {\n      const [{data,error}, riderRows] = await Promise.all([\n        supabase.from('internal_trip_daily_audit').select('*').gte('trip_date',period.start).lte('trip_date',period.end).order('registered_at',{ascending:false}).limit(2000),\n        getRiders(),\n      ])\n      if (error) throw error\n      setTrips((data || []) as TripRow[])\n      setRiders(riderRows)",
  `  async function loadAllTrips() {
    const pageSize = 1000
    const rows: TripRow[] = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('internal_trip_daily_audit')
        .select('*')
        .gte('trip_date', selectedFrom)
        .lte('trip_date', selectedTo)
        .order('registered_at', { ascending: false })
        .range(from, from + pageSize - 1)
      if (error) throw error
      const page = (data || []) as TripRow[]
      rows.push(...page)
      if (page.length < pageSize) break
    }
    return rows
  }

  async function load() {
    setLoading(true)
    try {
      const [tripRows, riderRows] = await Promise.all([loadAllTrips(), getRiders()])
      setTrips(tripRows)
      setRiders([...riderRows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar')))`,
  'paginated period load',
)
replaceOnce(
  "  useEffect(() => { void load() }, [])",
  "  useEffect(() => { void load() }, [selectedFrom, selectedTo])\n\n  function handleCycleApply(from: string, to: string) {\n    const next = new URLSearchParams(searchParams)\n    next.set('from', from)\n    next.set('to', to)\n    setSearchParams(next)\n    setSelected(new Set())\n  }",
  'cycle reload',
)
replaceOnce(
  "    const patch:Record<string,unknown>=status==='approved'?{status:'approved',review_status:'approved',approved_at:new Date().toISOString(),rejection_reason:null,needs_review:false,review_reason:null}",
  "    const patch:Record<string,unknown>=status==='approved'?{status:'approved',review_status:'approved',approved_at:new Date().toISOString(),rejection_reason:null,needs_review:false,review_reason:null,proof_archive_status:proofUrl(trip)?'queued':null,proof_archive_requested_at:proofUrl(trip)?new Date().toISOString():null}",
  'single approval archive queue',
)
replaceOnce(
  "const {error}=await supabase.from('internal_trips').update({status:'approved',review_status:'approved',approved_at:new Date().toISOString(),rejection_reason:null,needs_review:false,review_reason:null}).in('id',ids);",
  "const {error}=await supabase.from('internal_trips').update({status:'approved',review_status:'approved',approved_at:new Date().toISOString(),rejection_reason:null,needs_review:false,review_reason:null,proof_archive_status:'queued',proof_archive_requested_at:new Date().toISOString()}).in('id',ids);",
  'bulk approval archive queue',
)
replaceOnce(
  "    <main className=\"mx-auto max-w-7xl space-y-4 p-4\">\n      <section className=\"grid gap-3 sm:grid-cols-2 lg:grid-cols-6\">",
  "    <main className=\"mx-auto max-w-7xl space-y-4 p-4\">\n      <CycleSelector from={selectedFrom} to={selectedTo} onApply={handleCycleApply} />\n      <div className=\"rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-black text-teal-800\">الدورة المعروضة: {selectedFrom} إلى {selectedTo} · كل المناديب: {englishNumber(riders.length)} · المناديب أصحاب مشاوير: {englishNumber(new Set(trips.map(t=>t.rider_id).filter(Boolean)).size)}</div>\n      <section className=\"grid gap-3 sm:grid-cols-2 lg:grid-cols-6\">",
  'cycle selector UI',
)
replaceOnce(
  "<option value=\"all\">كل الدليفري</option>{riders.filter(r=>trips.some(t=>t.rider_id===r.id)).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}",
  "<option value=\"all\">كل الدليفري ({riders.length})</option>{riders.map(r=><option key={r.id} value={r.id}>{r.name}{trips.some(t=>t.rider_id===r.id)?'':' — بدون مشاوير في الدورة'}</option>)}",
  'all riders dropdown',
)
replaceOnce(
  "{proofUrl(t)?<span className=\"rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700\">صورة كاميرا</span>:<span className=\"rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700\">بدون صورة</span>}",
  "{proofUrl(t)?<span className=\"rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700\">صورة كاميرا</span>:t.proof_archive_drive_url?<span className=\"rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-700\">مؤرشفة على Drive</span>:<span className=\"rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700\">بدون صورة</span>}",
  'archive badge',
)
replaceOnce(
  "{proofUrl(details)?<a href={proofUrl(details)} target=\"_blank\" rel=\"noreferrer\" className=\"block\"><img src={proofUrl(details)} className=\"max-h-[560px] w-full rounded-2xl object-contain\" alt=\"صورة إثبات المشوار\"/></a>:<p className=\"rounded-xl bg-rose-50 p-4 font-bold text-rose-700\">لا توجد صورة لهذا المشوار</p>}",
  "{proofUrl(details)?<a href={proofUrl(details)} target=\"_blank\" rel=\"noreferrer\" className=\"block\"><img src={proofUrl(details)} className=\"max-h-[560px] w-full rounded-2xl object-contain\" alt=\"صورة إثبات المشوار\"/></a>:details.proof_archive_drive_url?<a href={details.proof_archive_drive_url} target=\"_blank\" rel=\"noreferrer\" className=\"block rounded-xl bg-sky-50 p-4 text-center font-black text-sky-700\">فتح الصورة المؤرشفة على Google Drive</a>:<p className=\"rounded-xl bg-rose-50 p-4 font-bold text-rose-700\">لا توجد صورة لهذا المشوار</p>}",
  'archive drive link',
)

await writeFile(file, source, 'utf8')
console.log('Trips page now supports cycle selection, all riders, and safe archive queueing')
