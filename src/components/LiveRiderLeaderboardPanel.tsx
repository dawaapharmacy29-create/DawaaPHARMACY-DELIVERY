import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import LiveRiderLeaderboard from './LiveRiderLeaderboard'
import { fetchAllRows } from '../lib/fetchAllRows'
import { getOperationalPeriod } from '../lib/helpers'
import { supabase } from '../lib/supabase'
import type { DeliveryOrder, InternalTrip, Rider } from '../lib/types'

export default function LiveRiderLeaderboardPanel() {
  const navigate = useNavigate()
  const period = useMemo(() => getOperationalPeriod(), [])
  const [orders, setOrders] = useState<DeliveryOrder[]>([])
  const [trips, setTrips] = useState<InternalTrip[]>([])
  const [riders, setRiders] = useState<Rider[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      setError(null)
      try {
        const [loadedOrders, loadedTrips, ridersRes] = await Promise.all([
          fetchAllRows<DeliveryOrder>({
            table: 'delivery_orders',
            filters: [
              { column: 'delivery_date', operator: 'gte', value: period.start },
              { column: 'delivery_date', operator: 'lte', value: period.end },
            ],
            orderColumn: 'registered_at',
            ascending: false,
          }),
          fetchAllRows<InternalTrip>({
            table: 'internal_trips',
            filters: [
              { column: 'trip_date', operator: 'gte', value: period.start },
              { column: 'trip_date', operator: 'lte', value: period.end },
            ],
            orderColumn: 'registered_at',
            ascending: false,
          }),
          supabase.from('riders').select('*').eq('status', 'active').order('name'),
        ])

        if (!active) return
        if (ridersRes.error) throw ridersRes.error
        setOrders(loadedOrders)
        setTrips(loadedTrips)
        setRiders((ridersRes.data || []) as Rider[])
      } catch (cause: any) {
        if (!active) return
        setError(cause?.message || 'تعذر تحميل حالة المناديب الآن')
      }
    }

    void load()
    return () => { active = false }
  }, [period.end, period.start])

  if (error) {
    return <section className="rounded-[2rem] border border-rose-100 bg-white p-5 text-center text-sm font-black text-rose-700 shadow-sm">{error}</section>
  }

  return <LiveRiderLeaderboard orders={orders} trips={trips} riders={riders} onOpen={(id) => navigate(`/admin/riders/${id}/performance`)} />
}
