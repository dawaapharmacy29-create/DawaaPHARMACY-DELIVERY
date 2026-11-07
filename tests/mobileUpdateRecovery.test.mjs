import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const html = readFileSync(new URL('../public/update.html', import.meta.url), 'utf8')
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1]

function setup(fetchResponse) {
  let click
  const calls = []
  const button = { disabled: false, addEventListener: (_, handler) => { click = handler } }
  const status = { textContent: '' }
  const storage = { session: 'existing-rider-session' }
  const cache = {
    keys: async () => ['dawaa-delivery-v20-mobile-recovery-20260806', 'unrelated-app-cache'],
    delete: async key => { calls.push(['delete-cache', key]); return true },
  }
  runInNewContext(script, {
    document: { getElementById: id => id === 'update' ? button : status },
    Date,
    Promise,
    fetch: async (url, options) => { calls.push(['fetch', url, options.cache]); return fetchResponse() },
    location: { origin: 'https://delivery.example', replace: url => calls.push(['navigate', url]) },
    navigator: { serviceWorker: { getRegistrations: async () => [
      { scope: 'https://delivery.example/', unregister: async () => calls.push(['unregister', 'delivery']) },
      { scope: 'https://delivery.example/other/', unregister: async () => calls.push(['unregister', 'other']) },
    ] } },
    window: { caches: cache },
    caches: cache,
    localStorage: storage,
  })
  return { click: () => click(), button, status, calls, storage }
}

test('mobile recovery refreshes delivery assets while preserving login and unrelated caches', async () => {
  const page = setup(() => ({ ok: true }))
  await page.click()
  assert.equal(page.calls[0][0], 'fetch')
  assert.equal(page.calls[0][2], 'no-store')
  assert.deepEqual(page.calls.filter(call => call[0] === 'unregister'), [['unregister', 'delivery']])
  assert.deepEqual(page.calls.filter(call => call[0] === 'delete-cache'), [['delete-cache', 'dawaa-delivery-v20-mobile-recovery-20260806']])
  assert.match(page.calls.at(-1)[1], /^\/rider\?fresh=\d+$/)
  assert.equal(page.storage.session, 'existing-rider-session')
})

test('an unavailable update leaves caches intact and allows retry', async () => {
  const page = setup(() => ({ ok: false }))
  await page.click()
  assert.equal(page.button.disabled, false)
  assert.equal(page.calls.length, 1)
  assert.match(page.status.textContent, /تحقق من الإنترنت/)
})

test('a second tap cannot submit another recovery while one is running', async () => {
  let complete
  const page = setup(() => new Promise(resolve => { complete = resolve }))
  const first = page.click()
  await page.click()
  assert.equal(page.calls.length, 1)
  complete({ ok: true })
  await first
  assert.equal(page.calls.filter(call => call[0] === 'navigate').length, 1)
})
