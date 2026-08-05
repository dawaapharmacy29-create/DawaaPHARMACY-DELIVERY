import { readFile, writeFile } from 'node:fs/promises'

const loginFile = new URL('../src/pages/Login.tsx', import.meta.url)
const authFile = new URL('../src/lib/auth.ts', import.meta.url)
const protectedRouteFile = new URL('../src/components/ProtectedRoute.tsx', import.meta.url)
const deviceBindingFile = new URL('../src/lib/deviceBinding.ts', import.meta.url)
const safeStorageFile = new URL('../src/lib/safeStorage.ts', import.meta.url)

let login = await readFile(loginFile, 'utf8')
let auth = await readFile(authFile, 'utf8')
let protectedRoute = await readFile(protectedRouteFile, 'utf8')
let deviceBinding = await readFile(deviceBindingFile, 'utf8')

const normalizedHelpers = `function normalizeUsername(value: string) {
  const trimmed = value
    .trim()
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
  return /[\u0600-\u06FF]/.test(trimmed) ? trimmed : trimmed.toUpperCase()
}

function normalizePin(value: string) {
  return value
    .trim()
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
}`

if (!login.includes(".replace(/[٠-٩]/g")) {
  const helperPattern = /function normalizeUsername\(value: string\) \{[\s\S]*?\n\}\s*\n\s*function normalizePin\(value: string\) \{[\s\S]*?\n\}/
  if (!helperPattern.test(login)) throw new Error('Rider login recovery anchor not found: normalization helpers')
  login = login.replace(helperPattern, normalizedHelpers)
}

const staleSessionBlock = `    await supabase.auth.signOut().catch(() => undefined)
    clearRiderSession()

    const result = await loginWithPin(riderUsername, pin)`

if (!login.includes('await supabase.auth.signOut().catch')) {
  const loginCall = '    const result = await loginWithPin(riderUsername, pin)'
  if (!login.includes(loginCall)) throw new Error('Rider login recovery anchor not found: rider login call')
  login = login.replace(loginCall, staleSessionBlock)
}

login = login.replace(
  /\s*\/\/ لو المشكلة في الـ device، نوضح الخطوة التالية\s*if \(result\?\.error === 'device_not_approved'\) \{[\s\S]*?localStorage\.removeItem\('dawaa_device_label_v1'\)\s*\}/,
  ''
)

const unsafeValidationCatch = `  } catch {
    if (navigator.onLine) {
      clearRiderSession()
      return null
    }
    return local
  }`

const safeValidationCatch = `  } catch {
    return local
  }`

if (auth.includes(unsafeValidationCatch)) auth = auth.replace(unsafeValidationCatch, safeValidationCatch)

if (!protectedRoute.includes('const validated = await Promise.race([validation, timeout])')) {
  const sessionPattern = /(?<indent>\s*)if \(isRiderRoute && s\?\.session_token\) \{\s*s = await validateStoredRiderSession\(\)\s*if \(!s\) \{\s*finish\(false, '\/rider-login'\)\s*return\s*\}\s*\}/
  const match = protectedRoute.match(sessionPattern)
  if (match) {
    const indent = match.groups?.indent || '      '
    const inner = indent + '  '
    const deeper = inner + '  '
    const timeoutBlock = `${indent}if (isRiderRoute && s?.session_token) {
${inner}const validation = validateStoredRiderSession()
${inner}const timeout = new Promise<null>(resolve => window.setTimeout(() => resolve(null), 8000))
${inner}const validated = await Promise.race([validation, timeout])
${inner}if (!validated) {
${deeper}finish(false, '/rider-login')
${deeper}return
${inner}}
${inner}s = validated
${indent}}`
    protectedRoute = protectedRoute.replace(sessionPattern, timeoutBlock)
  }
}

const safeStorageSource = `const memory = new Map<string, string>()

function browserStorage(): Storage | null {
  try {
    const storage = window.localStorage
    const probe = '__dawaa_storage_probe__'
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    try {
      const storage = window.sessionStorage
      const probe = '__dawaa_session_probe__'
      storage.setItem(probe, '1')
      storage.removeItem(probe)
      return storage
    } catch {
      return null
    }
  }
}

export const safeStorage = {
  getItem(key: string): string | null {
    const storage = browserStorage()
    if (storage) {
      try { return storage.getItem(key) } catch { /* fallback */ }
    }
    return memory.get(key) ?? null
  },
  setItem(key: string, value: string): void {
    memory.set(key, value)
    const storage = browserStorage()
    if (storage) {
      try { storage.setItem(key, value) } catch { /* memory already saved */ }
    }
  },
  removeItem(key: string): void {
    memory.delete(key)
    const storage = browserStorage()
    if (storage) {
      try { storage.removeItem(key) } catch { /* ignore */ }
    }
  },
}
`
await writeFile(safeStorageFile, safeStorageSource, 'utf8')

function addSafeStorageImport(source, importLine) {
  if (source.includes("from './safeStorage'") || source.includes("from '../lib/safeStorage'")) return source
  const firstImportEnd = source.indexOf('\n')
  return source.slice(0, firstImportEnd + 1) + importLine + '\n' + source.slice(firstImportEnd + 1)
}

auth = addSafeStorageImport(auth, "import { safeStorage } from './safeStorage'")
auth = auth.replace(/\blocalStorage\./g, 'safeStorage.')

deviceBinding = addSafeStorageImport(deviceBinding, "import { safeStorage } from './safeStorage'")
deviceBinding = deviceBinding.replace(/\blocalStorage\./g, 'safeStorage.')

login = addSafeStorageImport(login, "import { safeStorage } from '../lib/safeStorage'")
login = login.replace(/\blocalStorage\./g, 'safeStorage.')

await writeFile(loginFile, login, 'utf8')
await writeFile(authFile, auth, 'utf8')
await writeFile(protectedRouteFile, protectedRoute, 'utf8')
await writeFile(deviceBindingFile, deviceBinding, 'utf8')
console.log('Rider login recovery and blocked-storage fallback applied')
