// ربط حساب الدليفري بجهاز واحد موثّق
// Device ID لا يحتوي على بيانات شخصية، وهو رمز عشوائي محفوظ على نفس المتصفح/الموبايل.
// نضيف بصمة جهاز مستقرة غير حساسة داخل الـ label حتى نقدر نتعرف على نفس الموبايل
// لو المتصفح مسح localStorage وولّد Device ID جديد.

const DEVICE_ID_KEY = 'dawaa_device_id_v1'
const DEVICE_LABEL_KEY = 'dawaa_device_label_v1'

let memoryDeviceId = ''
let memoryDeviceLabel = ''

function randomId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function safeGet(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Restricted Android WebView/browser: keep the value in memory for this tab.
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore storage restrictions.
  }
}

function stableHash(input: string) {
  // FNV-1a style deterministic non-cryptographic hash; used only as a stable device hint.
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizedUserAgent() {
  const ua = navigator.userAgent || 'Unknown browser'
  // Browser version updates must not make the same phone look like a new device.
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
  const stored = safeGet(DEVICE_ID_KEY)
  if (stored) {
    memoryDeviceId = stored
    return stored
  }

  if (!memoryDeviceId) memoryDeviceId = randomId()
  safeSet(DEVICE_ID_KEY, memoryDeviceId)
  return memoryDeviceId
}

export function getDeviceLabel() {
  const platform = navigator.platform || 'Unknown platform'
  const ua = navigator.userAgent || 'Unknown browser'
  const fpMarker = `[dawaa-fp:${stableDeviceFingerprint()}]`
  const stored = safeGet(DEVICE_LABEL_KEY)

  // Old stored labels did not include a stable fingerprint. Upgrade them in place so
  // an already-approved device learns its stable marker on the next successful login.
  if (stored) {
    const upgraded = stored.includes('[dawaa-fp:') ? stored : `${stored} ${fpMarker}`
    memoryDeviceLabel = upgraded
    if (upgraded !== stored) safeSet(DEVICE_LABEL_KEY, upgraded)
    return upgraded
  }

  if (!memoryDeviceLabel || !memoryDeviceLabel.includes('[dawaa-fp:')) {
    memoryDeviceLabel = `${platform} | ${ua.slice(0, 120)} ${fpMarker}`
  }
  safeSet(DEVICE_LABEL_KEY, memoryDeviceLabel)
  return memoryDeviceLabel
}

export function clearCurrentDeviceBinding() {
  memoryDeviceId = ''
  memoryDeviceLabel = ''
  safeRemove(DEVICE_ID_KEY)
  safeRemove(DEVICE_LABEL_KEY)
}
