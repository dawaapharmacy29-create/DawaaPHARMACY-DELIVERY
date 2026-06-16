// ربط حساب الدليفري بجهاز واحد موثّق
// Device ID لا يحتوي على بيانات شخصية، وهو رمز عشوائي محفوظ على نفس المتصفح/الموبايل.

const DEVICE_ID_KEY = 'dawaa_device_id_v1'
const DEVICE_LABEL_KEY = 'dawaa_device_label_v1'

function randomId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

export function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = randomId()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

export function getDeviceLabel() {
  let label = localStorage.getItem(DEVICE_LABEL_KEY)
  if (!label) {
    const platform = navigator.platform || 'Unknown platform'
    const ua = navigator.userAgent || 'Unknown browser'
    label = `${platform} | ${ua.slice(0, 120)}`
    localStorage.setItem(DEVICE_LABEL_KEY, label)
  }
  return label
}

export function clearCurrentDeviceBinding() {
  localStorage.removeItem(DEVICE_ID_KEY)
  localStorage.removeItem(DEVICE_LABEL_KEY)
}
