import fs from 'node:fs'

// Repairs cycle filtering and keeps every rider adjustment visible in the current cycle.
const file = 'src/pages/admin/PenaltyIncentiveManagement.tsx'
let source = fs.readFileSync(file, 'utf8')

const replaceOnce = (from, to, label) => {
  if (!source.includes(from)) {
    if (source.includes(to)) return
    throw new Error(`Missing patch target: ${label}`)
  }
  source = source.replace(from, to)
}

replaceOnce(
  "const formatMoney = (val: number) => `${num(val).toFixed(2)} ج.م`\n",
  "const formatMoney = (val: number) => `${num(val).toFixed(2)} ج.م`\nconst localIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`\n\nfunction getCompensationCycle(reference = new Date()) {\n  const year = reference.getFullYear()\n  const month = reference.getMonth()\n  const startsThisMonth = reference.getDate() >= 26\n  const start = new Date(year, startsThisMonth ? month : month - 1, 26)\n  const end = new Date(year, startsThisMonth ? month + 1 : month, 25)\n  return { start: localIsoDate(start), end: localIsoDate(end) }\n}\n",
  'cycle helper',
)

const oldCycleBlock = `      const cycleStart = new Date()\n      cycleStart.setDate(cycleStart.getDate() >= 26 ? 26 : 26 - 30)\n      const cycleEnd = new Date(cycleStart)\n      cycleEnd.setMonth(cycleEnd.getMonth() + 1)\n      cycleEnd.setDate(25)\n\n      const cycleStartStr = cycleStart.toISOString().slice(0, 10)\n      const cycleEndStr = cycleEnd.toISOString().slice(0, 10)`
const newCycleBlock = `      const { start: cycleStartStr, end: cycleEndStr } = getCompensationCycle()`
while (source.includes(oldCycleBlock)) source = source.replace(oldCycleBlock, newCycleBlock)
if (!source.includes(newCycleBlock)) throw new Error('Cycle calculation patch failed')

replaceOnce("        .limit(50)", "        .limit(500)", 'record limit')
replaceOnce('آخر 50 سجلًا من الدورة الحالية', 'كل سجلات الدورة الحالية (حتى 500 سجل)', 'records subtitle')
source = source.replaceAll(
  'formatMoney(Math.abs(record.final_amount))',
  'formatMoney(Math.abs(Number(record.final_amount ?? record.amount ?? 0)))',
)

if (!source.includes('.limit(500)')) throw new Error('Record limit patch failed')
if (source.includes('26 - 30')) throw new Error('Legacy cycle calculation still exists')
if (source.includes('Math.abs(record.final_amount)')) throw new Error('Unsafe final_amount rendering still exists')

fs.writeFileSync(file, source)
console.log('Patched rider adjustments history and cycle handling')
