export type DeliveryCycleStatus = 'open' | 'under_review' | 'approved' | 'archived' | 'locked'

export type DeliveryCycleRange = {
  key: string
  label: string
  start: string
  end: string
  status?: DeliveryCycleStatus
  isCurrent?: boolean
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function pad(value: number) {
  return String(value).padStart(2, '0')
}

/** Business calendar is always Africa/Cairo, independent of device/hosting timezone. */
export function cairoDateParts(date: Date = new Date()) {
  const values = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => Number(values.find(value => value.type === type)?.value)
  return { year: part('year'), month: part('month'), day: part('day') }
}

export function cairoIsoDate(date: Date = new Date()) {
  const { year, month, day } = cairoDateParts(date)
  return `${year}-${pad(month)}-${pad(day)}`
}

function isoFromParts(year: number, monthIndex: number, day: number) {
  const date = new Date(Date.UTC(year, monthIndex, day))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function localIso(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0, 0))
}

export function cycleForDate(date = new Date()): DeliveryCycleRange {
  const { year, month, day } = cairoDateParts(date)
  const start = new Date(Date.UTC(year, month - (day >= 26 ? 1 : 2), 26, 12))
  return cycleFromStart(start, date)
}

export function cycleFromStart(startDate: Date, now = new Date()): DeliveryCycleRange {
  const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 26, 12))
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 25, 12))
  const startIso = isoFromParts(start.getUTCFullYear(), start.getUTCMonth(), 26)
  const endIso = isoFromParts(start.getUTCFullYear(), start.getUTCMonth() + 1, 25)
  const current = cycleForDateUnsafe(now)
  const isCurrent = current.start === startIso
  const cycleMonth = end.getUTCMonth()
  const cycleYear = end.getUTCFullYear()
  return {
    key: `${startIso}_${endIso}`,
    label: `دورة ${ARABIC_MONTHS[cycleMonth]} ${cycleYear}`,
    start: startIso,
    end: endIso,
    status: isCurrent ? 'open' : 'under_review',
    isCurrent,
  }
}

function cycleForDateUnsafe(date: Date) {
  const { year, month, day } = cairoDateParts(date)
  const startMonth = month - (day >= 26 ? 1 : 2)
  return { start: isoFromParts(year, startMonth, 26), end: isoFromParts(year, startMonth + 1, 25) }
}

export function shiftCycle(cycle: DeliveryCycleRange, months: number): DeliveryCycleRange {
  const base = parseIsoDate(cycle.start)
  return cycleFromStart(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 26, 12)))
}

export function getDeliveryCycleOptions(count = 18, now = new Date()) {
  const current = cycleForDate(now)
  return Array.from({ length: count }, (_, index) => shiftCycle(current, -index)).map((cycle, index) => ({
    ...cycle,
    label: index === 0 ? `الدورة الحالية — ${cycle.label.replace('دورة ', '')}` : index === 1 ? `الدورة السابقة — ${cycle.label.replace('دورة ', '')}` : cycle.label,
  }))
}

export function todayRange(now = new Date()) {
  const value = cairoIsoDate(now)
  return { start: value, end: value }
}

export function currentWeekRange(now = new Date()) {
  const { year, month, day } = cairoDateParts(now)
  const anchor = new Date(Date.UTC(year, month - 1, day))
  const start = new Date(anchor)
  start.setUTCDate(anchor.getUTCDate() - anchor.getUTCDay())
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export function lastCyclesRange(count: number, now = new Date()) {
  const current = cycleForDate(now)
  const first = shiftCycle(current, -(Math.max(1, count) - 1))
  return { start: first.start, end: current.end }
}

export const CYCLE_STATUS_LABELS: Record<DeliveryCycleStatus, string> = {
  open: 'مفتوحة',
  under_review: 'تحت المراجعة',
  approved: 'معتمدة',
  archived: 'مؤرشفة',
  locked: 'مقفلة نهائيًا',
}
