// ربط حساب الدليفري بجهاز واحد موثّق
// Device ID لا يحتوي على بيانات شخصية، وهو رمز عشوائي محفوظ على نفس المتصفح/الموبايل.

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
  const stored = safeGet(DEVICE_LABEL_KEY)
  if (stored) {
    memoryDeviceLabel = stored
    return stored
  }

  if (!memoryDeviceLabel) {
    const platform = navigator.platform || 'Unknown platform'
    const ua = navigator.userAgent || 'Unknown browser'
    memoryDeviceLabel = `${platform} | ${ua.slice(0, 120)}`
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
