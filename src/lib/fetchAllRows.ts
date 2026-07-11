import { supabase } from './supabase'

export type QueryFilter = {
  column: string
  operator: 'eq' | 'gte' | 'gt' | 'lte' | 'lt' | 'is'
  value: unknown
}

type FetchAllRowsOptions = {
  table: string
  select?: string
  filters?: QueryFilter[]
  orderColumn?: string
  ascending?: boolean
  pageSize?: number
  maxPages?: number
}

/**
 * Loads every row matching a query instead of silently stopping at Supabase's
 * project/API row limit (commonly 1,000 rows).
 *
 * Keep the ordering stable so offset pagination cannot duplicate or skip rows.
 */
export async function fetchAllRows<T = Record<string, unknown>>({
  table,
  select = '*',
  filters = [],
  orderColumn = 'created_at',
  ascending = true,
  pageSize = 1000,
  maxPages = 100,
}: FetchAllRowsOptions): Promise<T[]> {
  const rows: T[] = []

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize
    const to = from + pageSize - 1

    let query: any = supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending })

    // id is the deterministic tie-breaker for rows sharing the same timestamp/date.
    if (orderColumn !== 'id') query = query.order('id', { ascending: true })

    for (const filter of filters) {
      if (filter.operator === 'eq') query = query.eq(filter.column, filter.value)
      else if (filter.operator === 'gte') query = query.gte(filter.column, filter.value)
      else if (filter.operator === 'gt') query = query.gt(filter.column, filter.value)
      else if (filter.operator === 'lte') query = query.lte(filter.column, filter.value)
      else if (filter.operator === 'lt') query = query.lt(filter.column, filter.value)
      else query = query.is(filter.column, filter.value)
    }

    const { data, error } = await query.range(from, to)
    if (error) throw error

    const pageRows = (data ?? []) as T[]
    rows.push(...pageRows)

    if (pageRows.length < pageSize) return rows
  }

  throw new Error(`تجاوز تحميل ${table} الحد الآمن للصفحات. راجع نطاق التاريخ أو حجم البيانات.`)
}
