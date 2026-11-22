import assert from 'node:assert/strict'
import test from 'node:test'

let moduleId = 0

test('solo envía con una sesión WORKING y no marca desconexiones como pendientes', async (t) => {
  const originalFetch = globalThis.fetch
  const originalEnv = { ...process.env }
  process.env.WSPGO_BASE_URL = 'https://whatsapp.test.invalid'
  process.env.WSPGO_API_KEY = 'fixture'
  process.env.WSPGO_SESSION = 'fixture'
  try {
    for (const state of ['STOPPED', 'STARTING', 'SCAN_QR_CODE', 'FAILED', '404', 'network']) {
      await t.test(state, async () => {
        const calls = []
        globalThis.fetch = async (url) => {
          calls.push(String(url))
          assert.match(String(url), /\/api\/sessions\/fixture$/)
          // Supera el plazo breve de envío para comprobar que la verificación no se convierte en pendiente.
          await new Promise((resolve) => setTimeout(resolve, 8))
          if (state === 'network') throw new Error('Gateway no disponible')
          return { ok: state !== '404', json: async () => ({ status: state }) }
        }
        const wsp = await import(`../dist/lib/wspgo.js?case=${moduleId++}`)
        await assert.rejects(wsp.sendWhatsAppSoon('999999999', 'prueba', 1), /WhatsApp no conectado/)
        await assert.rejects(wsp.sendWhatsAppText('999999999', 'prueba'), /WhatsApp no conectado/)
        assert.equal(calls.length, 1)
      })
    }
    await t.test('WORKING permite enviar y propaga errores reales del proveedor', async () => {
      const calls = []
      let rejectSend = false
      globalThis.fetch = async (url, options) => {
        calls.push({ url: String(url), options })
        if (String(url).includes('/api/sessions/')) return { ok: true, json: async () => ({ status: 'WORKING' }) }
        return { ok: !rejectSend, text: async () => 'Fallo de envío de prueba' }
      }
      const wsp = await import(`../dist/lib/wspgo.js?case=${moduleId++}`)
      assert.deepEqual(await wsp.sendWhatsAppSoon('999999999', 'prueba'), { ok: true, pending: false })
      const sends = calls.filter((x) => x.url.endsWith('/api/sendText'))
      assert.equal(sends.length, 1)
      assert.deepEqual(JSON.parse(sends[0].options.body), { session: 'fixture', chatId: '51999999999@c.us', text: 'prueba' })
      rejectSend = true
      await assert.rejects(wsp.sendWhatsAppText('999999999', 'prueba'), /Fallo de envío de prueba/)
    })
  } finally {
    globalThis.fetch = originalFetch
    for (const key of ['WSPGO_BASE_URL', 'WSPGO_API_KEY', 'WSPGO_SESSION']) {
      if (originalEnv[key] === undefined) delete process.env[key]
      else process.env[key] = originalEnv[key]
    }
  }
})
