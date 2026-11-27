import assert from 'node:assert/strict'
import test from 'node:test'
import {
  combinarComprobante,
  ejecutarLoteSecuencial,
  normalizarPedidoId,
  pedidosSinComprobante,
} from '../src/lib/facturacionBatch.ts'

const PEDIDO = '452B5E9E-441D-45BA-B946-26C4C3EF02D7'

function comprobante(overrides = {}) {
  return { orderId: PEDIDO, serie: 'B001', numero: 4, status: 'pendiente', ...overrides }
}

test('normaliza el GUID y excluye pedidos emitidos aunque SQL use mayúsculas', () => {
  assert.equal(normalizarPedidoId(` ${PEDIDO} `), PEDIDO.toLowerCase())
  const orders = [
    { id: PEDIDO, paid: true, status: 'entregado' },
    { id: 'otro', paid: true, status: 'listo' },
  ]
  for (const status of ['pendiente', 'aceptada', 'rechazada']) {
    assert.deepEqual(pedidosSinComprobante(orders, [comprobante({ orderId: PEDIDO.toLowerCase(), status })]), [orders[1]])
  }
})

test('solo propone pedidos pagados y vigentes', () => {
  const orders = [
    { id: 'sin-pagar', paid: false, status: 'entregado' },
    ...['cancelado', 'CANCELADA', 'eliminado', 'ELIMINADA', 'anulado', 'ANULADA'].map((status) => ({ id: status, paid: true, status })),
    { id: 'vigente', paid: true, status: 'entregado' },
  ]
  assert.deepEqual(pedidosSinComprobante(orders, []), [orders.at(-1)])
})

for (const status of ['aceptada', 'rechazada']) {
  test(`una respuesta HTTP pendiente no degrada la confirmación ${status} recibida en tiempo real`, () => {
    const final = comprobante({ orderId: PEDIDO.toLowerCase(), status, mensaje: 'Resultado de SUNAT' })
    assert.deepEqual(combinarComprobante([final], comprobante()), [final])
    assert.deepEqual(combinarComprobante([final], comprobante({ status: 'enviada' })), [final])
  })
}

test('fusiona IDs equivalentes sin duplicarlos y conserva los otros pedidos', () => {
  const otro = comprobante({ orderId: 'otro', numero: 8 })
  const confirmado = comprobante({ orderId: PEDIDO.toLowerCase(), status: 'aceptada' })
  const result = combinarComprobante([comprobante(), otro, comprobante({ orderId: PEDIDO.toLowerCase() })], confirmado)
  assert.deepEqual(result, [confirmado, otro])
  assert.deepEqual(combinarComprobante([otro], confirmado), [confirmado, otro])
})

test('la protección de respuestas antiguas se limita al mismo comprobante', () => {
  const anterior = comprobante({ status: 'aceptada' })
  const nuevo = comprobante({ numero: 5 })
  assert.deepEqual(combinarComprobante([anterior], nuevo), [nuevo])
})

test('el lote espera cada emisión, continúa tras el fallo y conserva el orden seleccionado', async () => {
  const operaciones = []
  let enCurso = 0
  let maximoEnCurso = 0
  const fallo = new Error('SUNAT no disponible para el segundo pedido')
  await ejecutarLoteSecuencial(['primero', 'segundo', 'tercero'], async (item, index) => {
    enCurso++
    maximoEnCurso = Math.max(maximoEnCurso, enCurso)
    operaciones.push(`inicio:${index}:${item}`)
    await new Promise((resolve) => setTimeout(resolve, 5))
    enCurso--
    operaciones.push(`fin:${index}:${item}`)
    if (item === 'segundo') throw fallo
  }, (item, error, index) => {
    assert.equal(error, fallo)
    operaciones.push(`error:${index}:${item}`)
  })
  assert.equal(maximoEnCurso, 1)
  assert.equal(enCurso, 0)
  assert.deepEqual(operaciones, [
    'inicio:0:primero', 'fin:0:primero',
    'inicio:1:segundo', 'fin:1:segundo', 'error:1:segundo',
    'inicio:2:tercero', 'fin:2:tercero',
  ])
})

test('un lote vacío no emite ni reporta errores', async () => {
  await ejecutarLoteSecuencial([], async () => assert.fail('No debe emitir'), () => assert.fail('No debe fallar'))
})
