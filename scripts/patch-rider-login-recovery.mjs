import { readFile, writeFile } from 'node:fs/promises'

const loginFile = new URL('../src/pages/Login.tsx', import.meta.url)
const protectedRouteFile = new URL('../src/components/ProtectedRoute.tsx', import.meta.url)

let login = await readFile(loginFile, 'utf8')
let protectedRoute = await readFile(protectedRouteFile, 'utf8')

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source
  if (!source.includes(before)) throw new Error(`Rider login recovery anchor not found: ${label}`)
  return source.replace(before, after)
}

login = replaceOnce(
  login,
  `function normalizeUsername(value: string) {
  const trimmed = value.trim()
  // الأسماء العربية كما هي — اللاتينية → uppercase
  return /[\u0600-\u06FF]/.test(trimmed) ? trimmed : trimmed.toUpperCase()
}

function normalizePin(value: string) {
  return value.trim()
}`,
  `function normalizeUsername(value: string) {
  const trimmed = value
    .trim()
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
  // الأسماء العربية كما هي — اللاتينية → uppercase
  return /[\u0600-\u06FF]/.test(trimmed) ? trimmed : trimmed.toUpperCase()
}

function normalizePin(value: string) {
  return value
    .trim()
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
}`,
  'Arabic PIN and username normalization',
)

login = replaceOnce(
  login,
  `    const result = await loginWithPin(riderUsername, pin)

    if (!result?.success || (!result.rider_id && !result.account_id)) {`,
  `    // ننهي أي جلسة Auth قديمة قبل دخول الدليفري حتى لا تتداخل صلاحياتها مع RPC.
    await supabase.auth.signOut().catch(() => undefined)
    clearRiderSession()

    const result = await loginWithPin(riderUsername, pin)

    if (!result?.success || (!result.rider_id && !result.account_id)) {`,
  'clear stale sessions before rider login',
)

protectedRoute = replaceOnce(
  protectedRoute,
  `       if (isRiderRoute && s?.session_token) {
         s = await validateStoredRiderSession()
         if (!s) {
           finish(false, '/rider-login')
           return
         }
       }`,
  `       if (isRiderRoute && s?.session_token) {
         // لا نترك شاشة "جاري استعادة الجلسة" معلقة لو الشبكة أو RPC تأخر.
         const validation = validateStoredRiderSession()
         const timeout = new Promise<null>(resolve => window.setTimeout(() => resolve(null), 8000))
         const validated = await Promise.race([validation, timeout])
         if (!validated) {
           finish(false, '/rider-login')
           return
         }
         s = validated
       }`,
  'session validation timeout',
)

await writeFile(loginFile, login, 'utf8')
await writeFile(protectedRouteFile, protectedRoute, 'utf8')
console.log('Rider login recovery and Arabic PIN normalization applied')
