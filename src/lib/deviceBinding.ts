// ربط حساب الدليفري بجهاز واحد موثّق
// Device ID لا يحتوي على بيانات شخصية، وهو رمز عشوائي محفوظ على نفس المتصفح/الموبايل.
// نحتفظ به في أكثر من مخزن متاح حتى لا يتغير بسبب قيود Android/WebView أو تنظيف مخزن واحد.

const DEVICE_ID_KEY = 'dawaa_device_id_v1'
const DEVICE_LABEL_KEY = 'dawaa_device_label_v1'
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 3

let memoryDeviceId = ''
let memoryDeviceLabel = ''

function randomId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function safeLocalGet(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Restricted Android WebView/browser.
  }
}

function safeLocalRemove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore storage restrictions.
  }
}

function safeSessionGet(key: string) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Ignore restricted session storage.
  }
}

function safeSessionRemove(key: string) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Ignore restricted session storage.
  }
}

function safeCookieGet(key: string) {
  try {
    const prefix = `${encodeURIComponent(key)}=`
    const part = document.cookie.split('; ').find((entry) => entry.startsWith(prefix))
    return part ? decodeURIComponent(part.slice(prefix.length)) : null
  } catch {
    return null
  }
}

function safeCookieSet(key: string, value: string) {
  try {
    document.cookie = `${encodeURIComponent(key)}=${encodeURIComponent(value)}; Max-Age=${DEVICE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax; Secure`
  } catch {
    // Cookies may be unavailable in some embedded contexts.
  }
}

function safeCookieRemove(key: string) {
  try {
    document.cookie = `${encodeURIComponent(key)}=; Max-Age=0; Path=/; SameSite=Lax; Secure`
  } catch {
    // Ignore cookie restrictions.
  }
}

function persistEverywhere(key: string, value: string) {
  safeLocalSet(key, value)
  safeSessionSet(key, value)
  safeCookieSet(key, value)
}

function stableHash(input: string) {
  // FNV-1a style deterministic non-cryptographic hash; diagnostic hint only.
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizedUserAgent() {
  const ua = navigator.userAgent || 'Unknown browser'
  return ua
    .replace(/(Chrome|CriOS)\/[\d.]+/gi, '$1/*')
    .replace(/(Version)\/[\d.]+/gi, '$1/*')
    .replace(/(EdgA?|OPR|Firefox)\/[\d.]+/gi, '$1/*')
}

function stableDeviceFingerprint() {
  const nav = navigator as Navigator & {
    deviceMemory?: number
    hardwareConcurrency?: number
    maxTouchPoints?: number
  }

  const width = typeof screen !== 'undefined' ? Math.min(screen.width || 0, screen.height || 0) : 0
  const height = typeof screen !== 'undefined' ? Math.max(screen.width || 0, screen.height || 0) : 0
  const colorDepth = typeof screen !== 'undefined' ? screen.colorDepth || 0 : 0

  const parts = [
    navigator.platform || 'unknown-platform',
    normalizedUserAgent(),
    `${width}x${height}x${colorDepth}`,
    String(nav.hardwareConcurrency || 0),
    String(nav.deviceMemory || 0),
    String(nav.maxTouchPoints || 0),
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown-tz',
  ]

  return stableHash(parts.join('|'))
}

export function getOrCreateDeviceId() {
  // Prefer the durable stores. If one store survives an Android/WebView issue,
  // repopulate all the others with the same approved ID.
  const stored =
    safeLocalGet(DEVICE_ID_KEY) ||
    safeCookieGet(DEVICE_ID_KEY) ||
    safeSessionGet(DEVICE_ID_KEY) ||
    memoryDeviceId

  if (stored) {
    memoryDeviceId = stored
    persistEverywhere(DEVICE_ID_KEY, stored)
    return stored
  }

  memoryDeviceId = randomId()
  persistEverywhere(DEVICE_ID_KEY, memoryDeviceId)
  return memoryDeviceId
}

export function getDeviceLabel() {
  const platform = navigator.platform || 'Unknown platform'
  const ua = navigator.userAgent || 'Unknown browser'
  const fpMarker = `[dawaa-fp:${stableDeviceFingerprint()}]`
  const stored =
    safeLocalGet(DEVICE_LABEL_KEY) ||
    safeCookieGet(DEVICE_LABEL_KEY) ||
    safeSessionGet(DEVICE_LABEL_KEY)

  if (stored) {
    const upgraded = stored.includes('[dawaa-fp:') ? stored : `${stored} ${fpMarker}`
    memoryDeviceLabel = upgraded
    persistEverywhere(DEVICE_LABEL_KEY, upgraded)
    return upgraded
  }

  if (!memoryDeviceLabel || !memoryDeviceLabel.includes('[dawaa-fp:')) {
    memoryDeviceLabel = `${platform} | ${ua.slice(0, 120)} ${fpMarker}`
  }
  persistEverywhere(DEVICE_LABEL_KEY, memoryDeviceLabel)
  return memoryDeviceLabel
}

export function clearCurrentDeviceBinding() {
  memoryDeviceId = ''
  memoryDeviceLabel = ''
  safeLocalRemove(DEVICE_ID_KEY)
  safeLocalRemove(DEVICE_LABEL_KEY)
  safeSessionRemove(DEVICE_ID_KEY)
  safeSessionRemove(DEVICE_LABEL_KEY)
  safeCookieRemove(DEVICE_ID_KEY)
  safeCookieRemove(DEVICE_LABEL_KEY)
}
