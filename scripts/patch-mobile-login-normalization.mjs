import { readFile, writeFile } from 'node:fs/promises'

const authFile = new URL('../src/lib/auth.ts', import.meta.url)
const loginFile = new URL('../src/pages/Login.tsx', import.meta.url)
let auth = await readFile(authFile, 'utf8')
let login = await readFile(loginFile, 'utf8')

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source
  if (!source.includes(before)) throw new Error(`Login patch anchor not found: ${label}`)
  return source.replace(before, after)
}

auth = replaceOnce(
  auth,
  "export function resolveAdminLogin(input: string): string | null {\n  const raw = input.trim()\n  const lower = raw.toLowerCase()\n  if (raw.includes('@')) return raw.toLowerCase()\n  return ADMIN_LOGIN_ALIASES[raw] || ADMIN_LOGIN_ALIASES[lower] || null\n}",
  `function normalizeAdminAlias(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\.\/_\\-]/g, '')
    .replace(/\s+/g, '')
}

export function resolveAdminLogin(input: string): string | null {
  const raw = input.trim()
  const lower = raw.toLowerCase()
  if (raw.includes('@')) return raw.toLowerCase()
  const direct = ADMIN_LOGIN_ALIASES[raw] || ADMIN_LOGIN_ALIASES[lower]
  if (direct) return direct
  const normalized = normalizeAdminAlias(raw)
  const managerAliases = new Set(['drmoaz','دمعاذ','معاذ','دكتورمعاذ','المديرالعام','مديرعام'])
  return managerAliases.has(normalized) ? \`dr.moaz@${'${ADMIN_EMAIL_DOMAIN}'}\` : null
}`,
  'robust admin alias resolver',
)

login = replaceOnce(
  login,
  "      if (looksLikeAdmin) {\n        // لو الاسم أدمن معروف مثل د معاذ أو dr.moaz، ندخله Supabase Auth حتى لو الباسورد أرقام.\n        await handleAdminLogin()\n      } else if (shouldTryPinFirst) {",
  `      if (looksLikeAdmin) {
        // aliases الإدارة تُعامل كإدارة على كل الأجهزة حتى لو كلمة السر أرقام.
        await handleAdminLogin()
      } else if (shouldTryPinFirst) {`,
  'admin numeric password routing',
)

login = replaceOnce(
  login,
  "      } else {\n        // باقي الحالات = rider username/password-like fallback\n        await handleRiderLogin()\n      }",
  `      } else {
        // باقي الحالات = rider username/PIN fallback.
        await handleRiderLogin()
      }`,
  'login fallback comment',
)

await writeFile(authFile, auth, 'utf8')
await writeFile(loginFile, login, 'utf8')
console.log('Mobile login now normalizes Arabic/admin aliases consistently across devices')
