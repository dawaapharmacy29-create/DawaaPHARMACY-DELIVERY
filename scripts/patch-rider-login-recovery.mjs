import { readFile, writeFile } from 'node:fs/promises'

const loginFile = new URL('../src/pages/Login.tsx', import.meta.url)
const protectedRouteFile = new URL('../src/components/ProtectedRoute.tsx', import.meta.url)

let login = await readFile(loginFile, 'utf8')
let protectedRoute = await readFile(protectedRouteFile, 'utf8')

const normalizedHelpers = `function normalizeUsername(value: string) {
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
}`

// السكربتات السابقة قد تغيّر تعليق أو تنسيق الدالتين؛ نستبدل جسمهما بالـ regex بدل anchor حرفي.
if (!login.includes(".replace(/[٠-٩]/g")) {
  const helperPattern = /function normalizeUsername\(value: string\) \{[\s\S]*?\n\}\s*\n\s*function normalizePin\(value: string\) \{[\s\S]*?\n\}/
  if (!helperPattern.test(login)) {
    throw new Error('Rider login recovery anchor not found: normalization helpers')
  }
  login = login.replace(helperPattern, normalizedHelpers)
}

const staleSessionBlock = `    // ننهي أي جلسة Auth قديمة قبل دخول الدليفري حتى لا تتداخل صلاحياتها مع RPC.
    await supabase.auth.signOut().catch(() => undefined)
    clearRiderSession()

    const result = await loginWithPin(riderUsername, pin)`

if (!login.includes(staleSessionBlock)) {
  const loginCall = '    const result = await loginWithPin(riderUsername, pin)'
  if (!login.includes(loginCall)) {
    throw new Error('Rider login recovery anchor not found: rider login call')
  }
  login = login.replace(loginCall, staleSessionBlock)
}

const timeoutBlock = `       if (isRiderRoute && s?.session_token) {
          // لا نترك شاشة "جاري استعادة الجلسة" معلقة لو الشبكة أو RPC تأخر.
          const validation = validateStoredRiderSession()
          const timeout = new Promise<null>(resolve => window.setTimeout(() => resolve(null), 8000))
          const validated = await Promise.race([validation, timeout])
          if (!validated) {
            finish(false, '/rider-login')
            return
          }
          s = validated
        }`

if (!protectedRoute.includes('const validated = await Promise.race([validation, timeout])')) {
  const sessionPattern = /       if \(isRiderRoute && s\?\.session_token\) \{\s*s = await validateStoredRiderSession\(\)\s*if \(!s\) \{\s*finish\(false, '\/rider-login'\)\s*return\s*\}\s*\}/
  if (!sessionPattern.test(protectedRoute)) {
    throw new Error('Rider login recovery anchor not found: session validation')
  }
  protectedRoute = protectedRoute.replace(sessionPattern, timeoutBlock)
}

await writeFile(loginFile, login, 'utf8')
await writeFile(protectedRouteFile, protectedRoute, 'utf8')
console.log('Rider login recovery and Arabic PIN normalization applied')
