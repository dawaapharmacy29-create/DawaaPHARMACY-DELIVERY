import fs from 'node:fs'

const file = 'src/pages/admin/PenaltyIncentiveManagement.tsx'
let source = fs.readFileSync(file, 'utf8')

const helperAnchor = "const formatMoney = (val: number) => `${num(val).toFixed(2)} ج.م`"
const helperCode = `${helperAnchor}\nconst localIsoDate = (date: Date) => \`${'${date.getFullYear()}'}-${'${String(date.getMonth() + 1).padStart(2, \'0\')}'}-${'${String(date.getDate()).padStart(2, \'0\')}'}\`\n\nfunction getCompensationCycle(reference = new Date()) {\n  const year = reference.getFullYear()\n  const month = reference.getMonth()\n  const startsThisMonth = reference.getDate() >= 26\n  const start = new Date(year, startsThisMonth ? month : month - 1, 26)\n  const end = new Date(year, startsThisMonth ? month + 1 : month, 25)\n  return { start: localIsoDate(start), end: localIsoDate(end) }\n}`

if (!source.includes('function getCompensationCycle(') && source.includes(helperAnchor)) {
  source = source.replace(helperAnchor, helperCode)
}

source = source.replace(
  /      const cycleStart = new Date\(\)\n      cycleStart\.setDate\(cycleStart\.getDate\(\) >= 26 \? 26 : 26 - 30\)\n      const cycleEnd = new Date\(cycleStart\)\n      cycleEnd\.setMonth\(cycleEnd\.getMonth\(\) \+ 1\)\n      cycleEnd\.setDate\(25\)\n\n      const cycleStartStr = cycleStart\.toISOString\(\)\.slice\(0, 10\)\n      const cycleEndStr = cycleEnd\.toISOString\(\)\.slice\(0, 10\)/g,
  '      const { start: cycleStartStr, end: cycleEndStr } = getCompensationCycle()',
)

source = source.replaceAll('.limit(50)', '.limit(500)')
source = source.replaceAll('آخر 50 سجلًا من الدورة الحالية', 'كل سجلات الدورة الحالية (حتى 500 سجل)')
source = source.replaceAll(
  'formatMoney(Math.abs(record.final_amount))',
  'formatMoney(Math.abs(Number(record.final_amount ?? record.amount ?? 0)))',
)

fs.writeFileSync(file, source)
console.log('Rider adjustments history patch completed')
