import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { getApiToken, handleApiAuthError, setApiToken } from '../src/lib/apiSession.ts'

let events

beforeEach(() => {
  const values = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  })
  const target = new EventTarget()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  events = []
  for (const type of ['polleria-auth', 'polleria-session-expired', 'polleria-session-replaced']) {
    target.addEventListener(type, (event) => events.push({ type, ...event.detail }))
  }
})

test('un token inválido cierra la sesión actual y avisa una sola vez ante respuestas simultáneas', () => {
  setApiToken('token-vencido')
  events.length = 0
  handleApiAuthError(401, 'token-vencido', 'staff', { code: 'BAD_TOKEN', error: 'Token inválido' })
  handleApiAuthError(401, 'token-vencido', 'staff', { code: 'BAD_TOKEN' })
  assert.equal(getApiToken(), null)
  assert.deepEqual(events.map(({ type }) => type), ['polleria-auth', 'polleria-session-expired'])
  assert.equal(events[0].token, false)
  assert.match(events[1].message, /Vuelve a iniciar sesión/)
})

test('un 401 tardío de una sesión anterior conserva la sesión nueva', () => {
  setApiToken('token-nuevo')
  events.length = 0
  for (const code of ['BAD_TOKEN', 'SESSION_REPLACED']) {
    handleApiAuthError(401, 'token-anterior', 'staff', { code })
  }
  assert.equal(getApiToken(), 'token-nuevo')
  assert.deepEqual(events, [])
})

test('los errores públicos, de permisos, de credenciales y del servidor no cierran la sesión', () => {
  setApiToken('token-actual')
  events.length = 0
  handleApiAuthError(401, null, 'staff', { error: 'Credenciales inválidas' })
  handleApiAuthError(403, 'token-actual', 'staff', { error: 'Sin permiso' })
  handleApiAuthError(500, 'token-actual', 'staff', { error: 'Servidor no disponible' })
  assert.equal(getApiToken(), 'token-actual')
  assert.deepEqual(events, [])
})

test('la sesión reemplazada conserva su aviso y no elimina las sesiones de otras cuentas', () => {
  setApiToken('staff-token', 'staff')
  setApiToken('driver-token', 'driver')
  setApiToken('customer-token', 'customer')
  events.length = 0
  handleApiAuthError(401, 'staff-token', 'staff', { code: 'SESSION_REPLACED', error: 'Sesión cerrada en otro dispositivo' })
  assert.equal(getApiToken('staff'), null)
  assert.equal(getApiToken('driver'), 'driver-token')
  assert.equal(getApiToken('customer'), 'customer-token')
  assert.deepEqual(events.map(({ type }) => type), ['polleria-auth', 'polleria-session-replaced'])
})

test('el token heredado se retira al invalidar la sesión de personal', () => {
  localStorage.setItem('polleria-api-token', 'token-heredado')
  handleApiAuthError(401, 'token-heredado', 'staff', { code: 'BAD_TOKEN' })
  assert.equal(getApiToken(), null)
  assert.equal(localStorage.getItem('polleria-api-token'), null)
  assert.equal(localStorage.getItem('polleria-token-staff'), null)
})
