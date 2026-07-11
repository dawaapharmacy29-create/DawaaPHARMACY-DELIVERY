import { readFile, writeFile } from 'node:fs/promises'

const file = new URL('../src/pages/admin/Reconciliation.tsx', import.meta.url)
let source = await readFile(file, 'utf8')

const importLine = "import { fetchAllRows } from '../../lib/fetchAllRows'"
if (!source.includes(importLine)) {
  const anchor = "import { supabase } from '../../lib/supabase'"
  if (!source.includes(anchor)) throw new Error('Reconciliation import anchor not found')
  source = source.replace(anchor, `${anchor}\n${importLine}`)
}

const startMarker = "      const [ordersRes, ridersRes, tripsRes, attendanceRes, actionsRes, uploadLogRes] = await Promise.allSettled(["
const endMarker = "      if (uploadLogRes.status === 'fulfilled' && !uploadLogRes.value.error) setLatestUploadLog((uploadLogRes.value.data ?? null) as ReconciliationUploadLog | null)"

const start = source.indexOf(startMarker)
const endStart = source.indexOf(endMarker, start)
if (start < 0 || endStart < 0) throw new Error('Reconciliation loading block not found')
const end = endStart + endMarker.length

const replacement = `      const [ordersRes, ridersRes, tripsRes, attendanceRes, actionsRes, uploadLogRes] = await Promise.allSettled([
        fetchAllRows<DeliveryOrder>({
          table: 'delivery_orders',
          filters: [
            { column: 'delivery_date', operator: 'gte', value: fromDate },
            { column: 'delivery_date', operator: 'lte', value: toDate },
          ],
          orderColumn: 'registered_at',
          ascending: false,
        }),
        getRiders(),
        fetchAllRows<InternalTrip>({
          table: 'internal_trips',
          filters: [
            { column: 'trip_date', operator: 'gte', value: fromDate },
            { column: 'trip_date', operator: 'lte', value: toDate },
          ],
          orderColumn: 'registered_at',
          ascending: false,
        }),
        fetchAllRows<Attendance>({
          table: 'attendance',
          filters: [
            { column: 'work_date', operator: 'gte', value: fromDate },
            { column: 'work_date', operator: 'lte', value: toDate },
          ],
          orderColumn: 'work_date',
          ascending: false,
        }),
        fetchAllRows<any>({
          table: 'rider_shift_actions',
          filters: [
            { column: 'shift_date', operator: 'gte', value: fromDate },
            { column: 'shift_date', operator: 'lte', value: toDate },
          ],
          orderColumn: 'incident_at',
          ascending: false,
        }),
        supabase
          .from('reconciliation_upload_history')
          .select('*')
          .order('uploaded_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (ordersRes.status === 'fulfilled') setOrders(ordersRes.value)
      else console.error('Failed to load all reconciliation orders', ordersRes.reason)

      if (ridersRes.status === 'fulfilled') setRiders(ridersRes.value)
      else console.error('Failed to load reconciliation riders', ridersRes.reason)

      if (tripsRes.status === 'fulfilled') setTrips(tripsRes.value)
      else console.error('Failed to load all reconciliation trips', tripsRes.reason)

      if (attendanceRes.status === 'fulfilled') setAttendanceRows(attendanceRes.value)
      else console.error('Failed to load all reconciliation attendance', attendanceRes.reason)

      if (actionsRes.status === 'fulfilled') setRiderActions(actionsRes.value)
      else console.error('Failed to load all reconciliation actions', actionsRes.reason)

      if (uploadLogRes.status === 'fulfilled' && !uploadLogRes.value.error) {
        setLatestUploadLog((uploadLogRes.value.data ?? null) as ReconciliationUploadLog | null)
      } else if (uploadLogRes.status === 'rejected') {
        console.error('Failed to load latest reconciliation upload log', uploadLogRes.reason)
      }`

source = source.slice(0, start) + replacement + source.slice(end)
await writeFile(file, source, 'utf8')
console.log('Reconciliation now uses complete paginated data loading')
