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

export function localIso(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0)
}

export function cycleForDate(date = new Date()): DeliveryCycleRange {
  const start = date.getDate() >= 26
    ? new Date(date.getFullYear(), date.getMonth(), 26, 12)
    : new Date(date.getFullYear(), date.getMonth() - 1, 26, 12)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25, 12)
  return cycleFromStart(start, date)
}

export function cycleFromStart(startDate: Date, now = new Date()): DeliveryCycleRange {
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), 26, 12)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25, 12)
  const startIso = localIso(start)
  const endIso = localIso(end)
  const current = cycleForDateUnsafe(now)
  const isCurrent = current.start === startIso
  const cycleMonth = end.getMonth()
  const cycleYear = end.getFullYear()
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
  const start = date.getDate() >= 26
    ? new Date(date.getFullYear(), date.getMonth(), 26, 12)
    : new Date(date.getFullYear(), date.getMonth() - 1, 26, 12)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 25, 12)
  return { start: localIso(start), end: localIso(end) }
}

export function shiftCycle(cycle: DeliveryCycleRange, months: number): DeliveryCycleRange {
  const base = parseIsoDate(cycle.start)
  return cycleFromStart(new Date(base.getFullYear(), base.getMonth() + months, 26, 12))
}

export function getDeliveryCycleOptions(count = 18, now = new Date()) {
  const current = cycleForDate(now)
  return Array.from({ length: count }, (_, index) => shiftCycle(current, -index)).map((cycle, index) => ({
    ...cycle,
    label: index === 0 ? `الدورة الحالية — ${cycle.label.replace('دورة ', '')}` : index === 1 ? `الدورة السابقة — ${cycle.label.replace('دورة ', '')}` : cycle.label,
  }))
}

export function todayRange(now = new Date()) {
  const value = localIso(now)
  return { start: value, end: value }
}

export function currentWeekRange(now = new Date()) {
  const day = now.getDay()
  const start = new Date(now)
  start.setDate(now.getDate() - day)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start: localIso(start), end: localIso(end) }
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
