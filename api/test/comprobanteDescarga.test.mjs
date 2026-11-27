import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { unzipSync, zipSync } from 'fflate'
import { construirDescargaComprobantes } from '../dist/lib/comprobanteDescarga.js'
import { comprobanteFilePath, saveComprobanteFile } from '../dist/lib/comprobantes.js'

const ORDER_ID = '452b5e9e-441d-45ba-b946-26c4c3ef02d7'
const SECOND_ID = '452b5e9e-441d-45ba-b946-26c4c3ef02d8'

function invoice(overrides = {}) {
  return { orderId: ORDER_ID, tipo: 'boleta', serie: 'B001', numero: 1, status: 'aceptada', canal: 'sunat', ...overrides }
}

async function fixture(t) {
  const previous = process.env.COMPROBANTES_DIR
  process.env.COMPROBANTES_DIR = await fs.mkdtemp(path.join(tmpdir(), 'polleria-descarga-'))
  const directory = process.env.COMPROBANTES_DIR
  t.after(async () => {
    if (previous === undefined) delete process.env.COMPROBANTES_DIR
    else process.env.COMPROBANTES_DIR = previous
    await fs.rm(directory, { recursive: true, force: true })
  })
}

function statusIs(status) {
  return (error) => error.status === status
}

test('descarga PDF, XML y CDR con nombres del comprobante y conserva los tres contenidos', async (t) => {
  await fixture(t)
  const pdf = Buffer.from('%PDF-1.7\nFactura ficticia')
  const xml = Buffer.from('<Invoice>Factura ficticia</Invoice>')
  const cdr = Buffer.from(zipSync({ 'R-20100066603-03-B001-1.xml': Buffer.from('<ApplicationResponse/>') }))
  await saveComprobanteFile(ORDER_ID, 'pdf', pdf)
  await saveComprobanteFile(ORDER_ID, 'xml', xml)
  await saveComprobanteFile(ORDER_ID, 'cdr', cdr)
  await saveComprobanteFile(ORDER_ID, 'resumen', Buffer.from('Resumen privado'))
  await saveComprobanteFile(ORDER_ID, 'ticket', Buffer.from('123456789'))
  const result = await construirDescargaComprobantes([ORDER_ID], [invoice()])
  assert.equal(result.filename, 'boleta-B001-00000001.zip')
  const files = unzipSync(result.body)
  assert.deepEqual(Object.keys(files).sort(), [
    'boleta-B001-00000001/B001-00000001.pdf',
    'boleta-B001-00000001/B001-00000001.xml',
    'boleta-B001-00000001/CDR-B001-00000001.zip',
  ])
  assert.deepEqual(Buffer.from(files['boleta-B001-00000001/B001-00000001.pdf']), pdf)
  assert.deepEqual(Buffer.from(files['boleta-B001-00000001/B001-00000001.xml']), xml)
  assert.deepEqual(Buffer.from(files['boleta-B001-00000001/CDR-B001-00000001.zip']), cdr)
})

test('descarga varios comprobantes, elimina IDs repetidos y encuentra directorios GUID en mayúsculas', async (t) => {
  await fixture(t)
  const first = invoice({ orderId: ORDER_ID.toUpperCase() })
  const second = invoice({ orderId: SECOND_ID, tipo: 'factura', serie: 'F001', numero: 2 })
  await saveComprobanteFile(first.orderId, 'xml', Buffer.from('Primera boleta'))
  await saveComprobanteFile(second.orderId, 'xml', Buffer.from('Segunda factura'))
  const result = await construirDescargaComprobantes([ORDER_ID, ORDER_ID.toUpperCase(), SECOND_ID.toUpperCase()], [first, second])
  assert.equal(result.filename, 'comprobantes.zip')
  const files = unzipSync(result.body)
  assert.deepEqual(Object.keys(files), ['boleta-B001-00000001/B001-00000001.xml', 'factura-F001-00000002/F001-00000002.xml'])
  assert.equal(Buffer.from(files['boleta-B001-00000001/B001-00000001.xml']).toString(), 'Primera boleta')
  assert.equal(Buffer.from(files['factura-F001-00000002/F001-00000002.xml']).toString(), 'Segunda factura')
})

for (const status of ['pendiente', 'rechazada']) {
  test(`omite el PDF de un comprobante SUNAT ${status} aunque exista en disco`, async (t) => {
    await fixture(t)
    await saveComprobanteFile(ORDER_ID, 'pdf', Buffer.from('PDF que no debe descargarse'))
    await saveComprobanteFile(ORDER_ID, 'xml', Buffer.from('<Invoice/>'))
    const result = await construirDescargaComprobantes([ORDER_ID], [invoice({ status })])
    assert.deepEqual(Object.keys(unzipSync(result.body)), ['boleta-B001-00000001/B001-00000001.xml'])
  })
}

test('permite el PDF existente de un comprobante legado y omite archivos opcionales ausentes', async (t) => {
  await fixture(t)
  await saveComprobanteFile(ORDER_ID, 'pdf', Buffer.from('PDF legado'))
  const result = await construirDescargaComprobantes([ORDER_ID], [invoice({ canal: undefined, status: 'pendiente' })])
  assert.deepEqual(Object.keys(unzipSync(result.body)), ['boleta-B001-00000001/B001-00000001.pdf'])
})

test('rechaza IDs inválidos o rutas y requiere una selección no vacía', async () => {
  for (const ids of [undefined, ORDER_ID, [], ['../../etc/passwd'], [ORDER_ID, null], [' ' + ORDER_ID]]) {
    await assert.rejects(construirDescargaComprobantes(ids, [invoice()]), statusIs(400))
  }
})

test('requiere que todos los IDs seleccionados correspondan a comprobantes guardados', async (t) => {
  await fixture(t)
  await saveComprobanteFile(ORDER_ID, 'xml', Buffer.from('<Invoice/>'))
  await assert.rejects(construirDescargaComprobantes([ORDER_ID, SECOND_ID], [invoice()]), statusIs(404))
})

test('rechaza metadatos del servidor que permitirían rutas o nombres inválidos en el ZIP', async () => {
  for (const invalid of [
    { serie: '../../etc/passwd' }, { serie: 'B001/../../' }, { tipo: '../../factura' },
    { tipo: 'factura', serie: 'B001' }, { numero: -1 }, { numero: 1.5 }, { numero: 100_000_000 }, { numero: '1' },
  ]) {
    await assert.rejects(construirDescargaComprobantes([ORDER_ID], [invoice(invalid)]), statusIs(400))
  }
})

test('devuelve 404 si no hay archivos descargables y no incluye un PDF SUNAT pendiente por sí solo', async (t) => {
  await fixture(t)
  await assert.rejects(construirDescargaComprobantes([ORDER_ID], [invoice()]), statusIs(404))
  await saveComprobanteFile(ORDER_ID, 'pdf', Buffer.from('PDF pendiente'))
  await assert.rejects(construirDescargaComprobantes([ORDER_ID], [invoice({ status: 'pendiente' })]), statusIs(404))
})

test('rechaza más de 200 comprobantes y cuenta una sola vez los IDs duplicados', async (t) => {
  await fixture(t)
  const ids = Array.from({ length: 201 }, (_, index) => `452b5e9e-441d-45ba-b946-${index.toString(16).padStart(12, '0')}`)
  await assert.rejects(construirDescargaComprobantes(ids, []), statusIs(413))
  await saveComprobanteFile(ORDER_ID, 'xml', Buffer.from('<Invoice/>'))
  const result = await construirDescargaComprobantes(Array(201).fill(ORDER_ID), [invoice()])
  assert.equal(Object.keys(unzipSync(result.body)).length, 1)
})

test('rechaza un archivo de más de 64 MiB antes de leerlo', async (t) => {
  await fixture(t)
  await saveComprobanteFile(ORDER_ID, 'xml', Buffer.alloc(0))
  await fs.truncate(comprobanteFilePath(ORDER_ID, 'xml'), 64 * 1024 * 1024 + 1)
  await assert.rejects(construirDescargaComprobantes([ORDER_ID], [invoice()]), statusIs(413))
})

test('el límite de 64 MiB se aplica a la suma de archivos y no devuelve un ZIP parcial', async (t) => {
  await fixture(t)
  await saveComprobanteFile(ORDER_ID, 'pdf', Buffer.alloc(0))
  await saveComprobanteFile(ORDER_ID, 'xml', Buffer.alloc(0))
  await fs.truncate(comprobanteFilePath(ORDER_ID, 'pdf'), 33 * 1024 * 1024)
  await fs.truncate(comprobanteFilePath(ORDER_ID, 'xml'), 33 * 1024 * 1024)
  await assert.rejects(construirDescargaComprobantes([ORDER_ID], [invoice()]), statusIs(413))
})

test('no omite errores del sistema de archivos distintos de archivo ausente', async (t) => {
  await fixture(t)
  await fs.mkdir(comprobanteFilePath(ORDER_ID, 'xml'), { recursive: true })
  await assert.rejects(construirDescargaComprobantes([ORDER_ID], [invoice()]), (error) => error.code === 'EISDIR')
})

test('no sobrescribe archivos si dos comprobantes tienen la misma serie y numeración', async () => {
  await assert.rejects(construirDescargaComprobantes([ORDER_ID, SECOND_ID], [invoice(), invoice({ orderId: SECOND_ID })]), statusIs(409))
})
