import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import forge from 'node-forge'
import nodemailer from 'nodemailer'
import { zipSync, unzipSync } from 'fflate'
import { sql } from '../dist/db.js'
import { saveCertificado } from '../dist/lib/certificado.js'
import { comprobanteFilePath, saveComprobanteFile } from '../dist/lib/comprobantes.js'
import { destinatarioComprobante } from '../dist/lib/comprobanteCorreo.js'
import { emitirComprobante, procesarCorreosComprobantes, reintentarSunat } from '../dist/lib/emision.js'
import { getFacturaCdr, getFacturaEstado, parseXml, sendBill } from '../dist/lib/sunat.js'

const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/'
const SERVICE = 'http://service.sunat.gob.pe'
const CONSULT = 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService'
const BILL = 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService'
const ORDER_ID = '452b5e9e-441d-45ba-b946-26c4c3ef02d7'
const RUC = '20100066603'
const AUTH = { ruc: RUC, usuario: 'FICTICIO', clave: 'clave-ficticia' }

function envelope(content, status = 200) {
  return new Response(`<soap:Envelope xmlns:soap="${SOAP}" xmlns:ser="${SERVICE}">
    <soap:Body>${content}</soap:Body></soap:Envelope>`, { status })
}

function fault140() {
  return envelope('<soap:Fault><faultcode>soap:Client.0140</faultcode><faultstring>Existe un Documento igual en Proceso. Vuelva intentarlo en 15 minutos.</faultstring></soap:Fault>', 500)
}

function cdrZip(name, reference, code = '0') {
  const xml = `<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
    xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    <cac:DocumentResponse><cac:Response><cbc:ReferenceID>${reference}</cbc:ReferenceID>
      <cbc:ResponseCode>${code}</cbc:ResponseCode><cbc:Description>Constancia ficticia</cbc:Description>
    </cac:Response></cac:DocumentResponse></ApplicationResponse>`
  return Buffer.from(zipSync({ [`R-${name}.xml`]: Buffer.from(xml) }))
}

function consultResponse(content, code = '0001') {
  return envelope(`<ser:getStatusCdrResponse><statusCdr><statusCode>${code}</statusCode>
    <statusMessage>Estado ficticio del comprobante</statusMessage>
    ${content ? `<content>${content.toString('base64')}</content>` : ''}
    </statusCdr></ser:getStatusCdrResponse>`)
}

function summaryResponse(content, code = '0') {
  return envelope(`<ser:getStatusResponse><status><statusCode>${code}</statusCode>
    ${content ? `<content>${content.toString('base64')}</content>` : ''}
    </status></ser:getStatusResponse>`)
}

function estadoResponse(code) {
  return envelope(`<ser:getStatusResponse><status><statusCode>${code}</statusCode>
    <statusMessage>Estado ficticio confirmado</statusMessage></status></ser:getStatusResponse>`)
}

function invoice(tipo = 'factura', overrides = {}) {
  return {
    orderId: ORDER_ID, tipo, serie: tipo === 'factura' ? 'F001' : 'B001', numero: 1,
    status: 'pendiente', fechaEmision: '2026-11-23T23:00:00.000Z',
    canal: 'sunat', rucEmisor: RUC,
    ...(tipo === 'boleta' ? { resumen: { nombre: `${RUC}-RC-20261123-1` } } : {}),
    ...overrides,
  }
}

function nameFor(value) {
  return value.resumen?.nombre || `${value.rucEmisor}-01-${value.serie}-${value.numero}`
}

function referenceFor(value) {
  return value.resumen ? value.resumen.nombre.slice(12) : `${value.serie}-${value.numero}`
}

function assertConsult(url, options, value = invoice(), action = 'getStatusCdr') {
  assert.equal(url, CONSULT)
  assert.equal(options.headers.SOAPAction, `urn:${action}`)
  assert.equal(options.redirect, 'error')
  const xml = parseXml(options.body)
  assert.equal(xml.getElementsByTagNameNS(SERVICE, action).length, 1)
  for (const [tag, expected] of Object.entries({
    rucComprobante: RUC, tipoComprobante: '01', serieComprobante: value.serie,
    numeroComprobante: String(value.numero),
  })) assert.equal(xml.getElementsByTagName(tag).item(0)?.textContent, expected)
  assert.equal(xml.getElementsByTagName('contentFile').length, 0)
  return xml
}

function certificate(password) {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 60_000)
  cert.validity.notAfter = new Date(Date.now() + 60_000)
  cert.setSubject([{ name: 'commonName', value: 'Pendientes SUNAT ficticios' }])
  cert.setIssuer(cert.subject.attributes)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const pkcs12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, password, { algorithm: 'aes256' })
  return Buffer.from(forge.asn1.toDer(pkcs12).getBytes(), 'binary')
}

async function fixture(t, invoices = [invoice()], correoPedido) {
  const dir = await mkdtemp(join(tmpdir(), 'polleria-pendientes-'))
  const previous = { CERTIFICADO_DIR: process.env.CERTIFICADO_DIR, COMPROBANTES_DIR: process.env.COMPROBANTES_DIR }
  process.env.CERTIFICADO_DIR = join(dir, 'certificado')
  process.env.COMPROBANTES_DIR = join(dir, 'comprobantes')
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await rm(dir, { recursive: true, force: true })
  })
  const storage = new Map([
    ['sunat', { ...AUTH, razonSocial: 'EMISOR FICTICIO', direccionFiscal: 'LIMA, PERÚ', establecimiento: '0000', serieboleta: 'B001', seriefactura: 'F001' }],
    ['invoices', structuredClone(invoices)],
  ])
  t.mock.method(sql.ConnectionPool.prototype, 'connect', async () => ({ connected: true, request: () => new sql.Request() }))
  for (const method of ['begin', 'commit', 'rollback']) t.mock.method(sql.Transaction.prototype, method, async () => {})
  t.mock.method(sql.Request.prototype, 'query', async function (query) {
    if (query.includes('sp_getapplock')) return { recordset: [{ Result: 0 }] }
    if (query.includes('SELECT ConfigValue')) {
      const value = storage.get(this.parameters.key.value)
      return { recordset: value === undefined ? [] : [{ ConfigValue: JSON.stringify(value) }] }
    }
    if (query.includes('MERGE dbo.AppConfig')) {
      storage.set(this.parameters.key.value, JSON.parse(this.parameters.value.value))
      return { recordset: [] }
    }
    if (query.includes('o.DocEmail')) return { recordset: correoPedido ? [correoPedido] : [] }
    if (query.includes('FROM dbo.Orders')) return { recordset: [{ Paid: true, Status: 'entregado', Total: 20, DocTipo: 'factura' }] }
    if (query.includes('FROM dbo.Settings')) return { recordset: [{ IgvRate: 0.18 }] }
    assert.fail('Consulta SQL inesperada: ' + query)
  })
  const calls = []
  let respond = () => assert.fail('Solicitud de red inesperada')
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return respond(url, options)
  })
  return { storage, calls, respond: (handler) => { respond = handler } }
}

function configurarSmtpFicticio(t, enviar) {
  const env = {
    COMPROBANTES_SMTP_HOST: 'smtp.example.test',
    COMPROBANTES_SMTP_PORT: '587',
    COMPROBANTES_SMTP_USER: 'remitente@example.test',
    COMPROBANTES_SMTP_PASSWORD: 'ficticia',
  }
  const anterior = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(() => {
    for (const [key, value] of Object.entries(anterior)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  t.mock.method(nodemailer, 'createTransport', (config) => {
    assert.equal(config.requireTLS, true)
    assert.equal(config.disableUrlAccess, true)
    return { sendMail: enviar }
  })
}

test('consulta CDR de factura con los cuatro parámetros y verifica la constancia recibida', async (t) => {
  const f = await fixture(t)
  const value = invoice()
  const cdr = cdrZip(nameFor(value), referenceFor(value))
  f.respond((url, options) => {
    const xml = assertConsult(url, options, value)
    assert.equal(xml.getElementsByTagName('wsse:Username').item(0).textContent, RUC + AUTH.usuario)
    return consultResponse(cdr)
  })
  const result = await getFacturaCdr(AUTH, nameFor(value))
  assert.equal(result.codigo, '0001')
  assert.equal(result.cdr.code, '0')
  assert.deepEqual(result.cdr.zip, cdr)
  assert.equal(f.calls.length, 1)
})

test('consulta el estado de factura con los cuatro parámetros en billConsultService', async (t) => {
  const f = await fixture(t)
  f.respond((url, options) => {
    assertConsult(url, options, invoice(), 'getStatus')
    return estadoResponse('0011')
  })
  const result = await getFacturaEstado(AUTH, nameFor(invoice()))
  assert.equal(result.codigo, '0011')
  assert.equal(result.mensaje, 'Estado ficticio confirmado')
  assert.equal(f.calls.length, 1)
})

test('el fault SOAP conserva el código SUNAT 0140 como dato estructurado', async (t) => {
  const f = await fixture(t)
  f.respond(() => fault140())
  await assert.rejects(sendBill('produccion', AUTH, nameFor(invoice()), Buffer.from('<ficticio/>')), (error) => {
    assert.equal(error.sunatCode, '0140')
    return true
  })
})

test('una factura nueva se envía una vez y el 0140 impide reenvíos inmediatos conservando XML y número', async (t) => {
  const f = await fixture(t, [])
  const password = 'certificado-ficticio-pendientes'
  await saveCertificado(certificate(password), 'ficticio.p12', password)
  f.respond((url, options) => {
    assert.equal(url, BILL)
    assert.equal(options.headers.SOAPAction, 'urn:sendBill')
    return fault140()
  })
  const before = Date.now()
  const { invoice: pending } = await emitirComprobante({
    orderId: ORDER_ID, tipo: 'factura', cliente: { tipDoc: '6', num: '20600000005', nombre: 'CLIENTE FICTICIO' },
    lines: [{ descripcion: 'Consumo ficticio', cantidad: 2, precio: 10 }],
  })
  assert.equal(pending.status, 'pendiente')
  assert.equal(pending.sunatCode, '0140')
  assert.ok(Date.parse(pending.nextRetryAt) >= before + 15 * 60_000)
  assert.ok(Date.parse(pending.nextRetryAt) <= Date.now() + 15 * 60_000)
  const xml = await readFile(comprobanteFilePath(ORDER_ID, 'xml'))
  const retried = await reintentarSunat(ORDER_ID)
  assert.equal(retried.status, 'pendiente')
  assert.equal(retried.nextRetryAt, pending.nextRetryAt)
  assert.equal(retried.numero, pending.numero)
  assert.deepEqual(await readFile(comprobanteFilePath(ORDER_ID, 'xml')), xml)
  assert.equal(f.calls.length, 1)
  assert.equal(f.storage.get('invoices')[0].nextRetryAt, pending.nextRetryAt)
})

test('una factura pendiente recupera el CDR remoto sin volver a enviar el XML', async (t) => {
  const f = await fixture(t, [invoice()])
  const expected = invoice()
  const cdr = cdrZip(nameFor(expected), referenceFor(expected))
  f.respond((url, options) => { assertConsult(url, options, expected); return consultResponse(cdr) })
  const result = await reintentarSunat(ORDER_ID)
  assert.equal(result.status, 'aceptada')
  assert.equal(result.numero, 1)
  assert.deepEqual(await readFile(comprobanteFilePath(ORDER_ID, 'cdr')), cdr)
  assert.equal(f.calls.length, 1)
})

test('una referencia incorrecta del CDR remoto deja la factura pendiente sin reenviarla', async (t) => {
  const value = invoice()
  const f = await fixture(t, [value])
  f.respond((url, options) => {
    assertConsult(url, options, value)
    return consultResponse(cdrZip(nameFor(value), 'F001-999'))
  })
  const result = await reintentarSunat(ORDER_ID)
  assert.equal(result.status, 'pendiente')
  assert.equal(result.numero, value.numero)
  assert.match(result.mensaje, /numeración distinta|corresponde/)
  await assert.rejects(readFile(comprobanteFilePath(ORDER_ID, 'cdr')), { code: 'ENOENT' })
  assert.equal(f.calls.length, 1)
})

test('el código exterior 0001 sin archivo CDR no acredita aceptación ni provoca reenvío', async (t) => {
  const f = await fixture(t)
  f.respond((url, options) => {
    if (options.headers.SOAPAction === 'urn:getStatusCdr') {
      assertConsult(url, options)
      return consultResponse(null, '0001')
    }
    assertConsult(url, options, invoice(), 'getStatus')
    return estadoResponse('0001')
  })
  assert.equal((await reintentarSunat(ORDER_ID)).status, 'pendiente')
  assert.equal(f.storage.get('invoices')[0].status, 'pendiente')
  assert.equal(f.calls.length, 2)
})

test('la factura que no llegó a SUNAT se reenvía solo después del 0011 confirmado y conserva XML y correlativo', async (t) => {
  const value = invoice('factura', { fechaEmision: new Date(Date.now() - 3_600_000).toISOString() })
  const f = await fixture(t, [value])
  const original = Buffer.from('<Invoice>XML original de una factura no recibida</Invoice>')
  await saveComprobanteFile(ORDER_ID, 'xml', original)
  const cdr = cdrZip(nameFor(value), referenceFor(value))
  f.respond((url, options) => {
    if (options.headers.SOAPAction === 'urn:getStatusCdr') {
      assertConsult(url, options, value)
      return consultResponse(null, '0011')
    }
    if (options.headers.SOAPAction === 'urn:getStatus') {
      assertConsult(url, options, value, 'getStatus')
      return estadoResponse('0011')
    }
    assert.equal(url, BILL)
    assert.equal(options.headers.SOAPAction, 'urn:sendBill')
    const xml = parseXml(options.body)
    assert.equal(xml.getElementsByTagName('fileName').item(0).textContent, `${nameFor(value)}.zip`)
    const files = unzipSync(Buffer.from(xml.getElementsByTagName('contentFile').item(0).textContent, 'base64'))
    assert.deepEqual(Object.keys(files), [`${nameFor(value)}.xml`])
    assert.deepEqual(Buffer.from(Object.values(files)[0]), original)
    return envelope(`<ser:sendBillResponse><applicationResponse>${cdr.toString('base64')}</applicationResponse></ser:sendBillResponse>`)
  })
  const result = await reintentarSunat(ORDER_ID)
  assert.equal(result.status, 'aceptada')
  assert.equal(result.numero, value.numero)
  assert.equal(result.serie, value.serie)
  assert.deepEqual(await readFile(comprobanteFilePath(ORDER_ID, 'xml')), original)
  assert.deepEqual(f.calls.map(({ options }) => options.headers.SOAPAction), ['urn:getStatusCdr', 'urn:getStatus', 'urn:sendBill'])
})

test('el 0011 confirmado espera 15 minutos desde lastSentAt antes de reenviar una factura', async (t) => {
  const sentAt = Date.now()
  const value = invoice('factura', {
    fechaEmision: new Date(sentAt - 3_600_000).toISOString(), lastSentAt: new Date(sentAt).toISOString(),
  })
  const f = await fixture(t, [value])
  const original = Buffer.from('<Invoice>XML pendiente reciente</Invoice>')
  await saveComprobanteFile(ORDER_ID, 'xml', original)
  f.respond((url, options) => {
    if (options.headers.SOAPAction === 'urn:getStatusCdr') {
      assertConsult(url, options, value)
      return consultResponse(null, '0011')
    }
    assertConsult(url, options, value, 'getStatus')
    return estadoResponse('0011')
  })
  const first = await reintentarSunat(ORDER_ID)
  assert.equal(first.status, 'pendiente')
  assert.equal(Date.parse(first.nextRetryAt), sentAt + 900_000)
  const second = await reintentarSunat(ORDER_ID)
  assert.equal(second.nextRetryAt, first.nextRetryAt)
  assert.equal(second.numero, value.numero)
  assert.deepEqual(await readFile(comprobanteFilePath(ORDER_ID, 'xml')), original)
  assert.equal(f.calls.length, 2)
  assert.equal(f.storage.get('invoices')[0].nextRetryAt, first.nextRetryAt)
})

test('un nuevo fault 0111 sustituye al 0140 anterior y la siguiente espera no anuncia un duplicado', async (t) => {
  const previousAttempt = new Date(Date.now() - 3_600_000).toISOString()
  const value = invoice('factura', {
    fechaEmision: previousAttempt, lastSentAt: previousAttempt, sunatCode: '0140',
    nextRetryAt: previousAttempt, mensaje: 'SUNAT 0140: hay un documento igual en proceso.',
  })
  const f = await fixture(t, [value])
  const original = Buffer.from('<Invoice>XML original conservado tras cambiar el error</Invoice>')
  await saveComprobanteFile(ORDER_ID, 'xml', original)
  f.respond((url, options) => {
    if (options.headers.SOAPAction === 'urn:getStatusCdr') {
      assertConsult(url, options, value)
      return consultResponse(null, '0011')
    }
    if (options.headers.SOAPAction === 'urn:getStatus') {
      assertConsult(url, options, value, 'getStatus')
      return estadoResponse('0011')
    }
    assert.equal(url, BILL)
    assert.equal(options.headers.SOAPAction, 'urn:sendBill')
    const xml = parseXml(options.body)
    const files = unzipSync(Buffer.from(xml.getElementsByTagName('contentFile').item(0).textContent, 'base64'))
    assert.deepEqual(Object.keys(files), [`${nameFor(value)}.xml`])
    assert.deepEqual(Buffer.from(Object.values(files)[0]), original)
    return envelope('<soap:Fault><faultcode>soap:Client.0111</faultcode><faultstring>Error ficticio nuevo del envío</faultstring></soap:Fault>', 500)
  })
  const before = Date.now()
  const first = await reintentarSunat(ORDER_ID)
  assert.equal(first.status, 'pendiente')
  assert.equal(first.sunatCode, '0111')
  assert.equal(first.nextRetryAt, undefined)
  assert.ok(Date.parse(first.lastSentAt) >= before)
  assert.equal(first.numero, value.numero)
  assert.equal(first.serie, value.serie)
  assert.equal(f.storage.get('invoices')[0].sunatCode, '0111')
  assert.equal(f.storage.get('invoices')[0].nextRetryAt, undefined)
  const second = await reintentarSunat(ORDER_ID)
  assert.equal(second.status, 'pendiente')
  assert.equal(Date.parse(second.nextRetryAt), Date.parse(first.lastSentAt) + 900_000)
  assert.doesNotMatch(second.mensaje, /0140|documento igual.*proceso/i)
  assert.equal(second.numero, value.numero)
  assert.deepEqual(await readFile(comprobanteFilePath(ORDER_ID, 'xml')), original)
  assert.deepEqual(f.calls.map(({ options }) => options.headers.SOAPAction), [
    'urn:getStatusCdr', 'urn:getStatus', 'urn:sendBill', 'urn:getStatusCdr', 'urn:getStatus',
  ])
})

test('si getStatus falla tras una consulta sin CDR no se reenvía la factura', async (t) => {
  const value = invoice('factura', { fechaEmision: new Date(Date.now() - 3_600_000).toISOString() })
  const f = await fixture(t, [value])
  f.respond((url, options) => {
    if (options.headers.SOAPAction === 'urn:getStatusCdr') {
      assertConsult(url, options, value)
      return consultResponse(null, '0011')
    }
    assertConsult(url, options, value, 'getStatus')
    throw new Error('Corte ficticio de consulta de estado')
  })
  const result = await reintentarSunat(ORDER_ID)
  assert.equal(result.status, 'pendiente')
  assert.equal(result.numero, value.numero)
  assert.match(result.mensaje, /Corte ficticio de consulta de estado/)
  assert.equal(f.calls.length, 2)
})

test('una consulta de factura fallida conserva el pendiente y nunca cambia a sendBill', async (t) => {
  const f = await fixture(t)
  f.respond((url, options) => { assertConsult(url, options); throw new Error('Corte ficticio de consulta') })
  const result = await reintentarSunat(ORDER_ID)
  assert.equal(result.status, 'pendiente')
  assert.equal(result.numero, 1)
  assert.match(result.mensaje, /Corte ficticio de consulta/)
  assert.equal(f.calls.length, 1)
})

test('el rechazo dentro del CDR prevalece aunque la consulta devuelva código exterior 0001', async (t) => {
  const value = invoice()
  const f = await fixture(t, [value])
  f.respond((url, options) => {
    assertConsult(url, options, value)
    return consultResponse(cdrZip(nameFor(value), referenceFor(value), '2324'), '0001')
  })
  assert.equal((await reintentarSunat(ORDER_ID)).status, 'rechazada')
  assert.equal(f.calls.length, 1)
})

test('los pendientes históricos con mensaje 0140 inician una espera persistente sin SOAP', async (t) => {
  const f = await fixture(t, [invoice('factura', { mensaje: 'SUNAT 0140: Existe un Documento igual en Proceso.' })])
  const before = Date.now()
  const first = await reintentarSunat(ORDER_ID)
  assert.equal(first.sunatCode, '0140')
  assert.equal(first.status, 'pendiente')
  assert.ok(Date.parse(first.nextRetryAt) >= before + 15 * 60_000)
  const second = await reintentarSunat(ORDER_ID)
  assert.equal(second.nextRetryAt, first.nextRetryAt)
  assert.equal(f.storage.get('invoices')[0].nextRetryAt, first.nextRetryAt)
  assert.equal(f.calls.length, 0)
})

for (const tipo of ['factura', 'boleta']) {
  test(`el CDR local de ${tipo} recupera la aceptación antes del cooldown y sin red`, async (t) => {
    const value = invoice(tipo, { sunatCode: '0140', nextRetryAt: new Date(Date.now() + 900_000).toISOString() })
    const f = await fixture(t, [value])
    await saveComprobanteFile(ORDER_ID, 'cdr', cdrZip(nameFor(value), referenceFor(value)))
    const result = await reintentarSunat(ORDER_ID)
    assert.equal(result.status, 'aceptada')
    assert.equal(result.numero, value.numero)
    assert.equal(f.calls.length, 0)
  })
}

test('la boleta recupera el ticket del disco y consulta el resumen sin reenviarlo', async (t) => {
  const value = invoice('boleta')
  const f = await fixture(t, [value])
  await saveComprobanteFile(ORDER_ID, 'ticket', Buffer.from('987654321'))
  f.respond((url, options) => {
    assert.equal(url, BILL)
    assert.equal(options.headers.SOAPAction, 'urn:getStatus')
    assert.equal(parseXml(options.body).getElementsByTagName('ticket').item(0).textContent, '987654321')
    return summaryResponse(cdrZip(nameFor(value), referenceFor(value)))
  })
  const result = await reintentarSunat(ORDER_ID)
  assert.equal(result.status, 'aceptada')
  assert.equal(result.resumen.ticket, '987654321')
  assert.equal(f.calls.length, 1)
})

test('la boleta sin ticket espera tras 0140 y después reutiliza exactamente el mismo resumen', async (t) => {
  const value = invoice('boleta')
  const f = await fixture(t, [value])
  const summary = Buffer.from('<SummaryDocuments>Resumen ficticio invariable</SummaryDocuments>')
  await saveComprobanteFile(ORDER_ID, 'resumen', summary)
  const sent = []
  f.respond((url, options) => {
    assert.equal(url, BILL)
    assert.equal(options.headers.SOAPAction, 'urn:sendSummary')
    const xml = parseXml(options.body)
    const files = unzipSync(Buffer.from(xml.getElementsByTagName('contentFile').item(0).textContent, 'base64'))
    assert.deepEqual(Object.keys(files), [`${nameFor(value)}.xml`])
    sent.push(Buffer.from(Object.values(files)[0]))
    return sent.length === 1 ? fault140() : envelope('<ser:sendSummaryResponse><ticket>123456789</ticket></ser:sendSummaryResponse>')
  })
  const first = await reintentarSunat(ORDER_ID)
  assert.equal(first.status, 'pendiente')
  assert.equal(first.sunatCode, '0140')
  assert.ok(Date.parse(first.nextRetryAt) > Date.now())
  assert.equal((await reintentarSunat(ORDER_ID)).nextRetryAt, first.nextRetryAt)
  assert.equal(f.calls.length, 1)
  f.storage.set('invoices', [{ ...f.storage.get('invoices')[0], nextRetryAt: new Date(Date.now() - 1).toISOString() }])
  const second = await reintentarSunat(ORDER_ID)
  assert.equal(second.status, 'pendiente')
  assert.equal(second.resumen.ticket, '123456789')
  assert.equal(second.numero, value.numero)
  assert.deepEqual(sent, [summary, summary])
  assert.deepEqual(await readFile(comprobanteFilePath(ORDER_ID, 'resumen')), summary)
  assert.equal(f.calls.length, 2)
})

test('el correo de facturación tiene prioridad y no se usa si el comprobante va a otro documento', () => {
  const pedido = { DocNumero: RUC, DocEmail: 'facturacion@example.test', CustomerEmail: 'cliente@example.test' }
  assert.equal(destinatarioComprobante(RUC, pedido), pedido.DocEmail)
  assert.equal(destinatarioComprobante(RUC, { ...pedido, DocEmail: '' }), pedido.CustomerEmail)
  assert.equal(destinatarioComprobante('20999999999', pedido), undefined)
  assert.equal(destinatarioComprobante('-', { DocEmail: 'uno@example.test, dos@example.test' }), undefined)
})

for (const tipo of ['factura', 'boleta']) {
  test(`la ${tipo} aceptada envía una vez el PDF, el XML y el CDR como adjuntos`, async (t) => {
    const enviado = []
    configurarSmtpFicticio(t, async (mail) => {
      enviado.push(mail)
      return { accepted: [mail.to.address] }
    })
    const value = invoice(tipo, { clienteDoc: RUC })
    const destino = 'facturacion@example.test'
    const f = await fixture(t, [value], { DocNumero: RUC, DocEmail: destino })
    const cdr = cdrZip(nameFor(value), referenceFor(value))
    const pdf = Buffer.from('PDF ficticio')
    const xml = Buffer.from('XML ficticio')
    await saveComprobanteFile(ORDER_ID, 'pdf', pdf)
    await saveComprobanteFile(ORDER_ID, 'xml', xml)
    await saveComprobanteFile(ORDER_ID, 'cdr', cdr)

    assert.equal((await reintentarSunat(ORDER_ID)).status, 'aceptada')
    assert.equal(enviado.length, 0)
    assert.equal(f.storage.get('sunat_correos')[0].estado, 'pendiente')
    await procesarCorreosComprobantes()
    await reintentarSunat(ORDER_ID)
    await procesarCorreosComprobantes()

    assert.equal(enviado.length, 1)
    assert.equal(enviado[0].to.address, destino)
    assert.deepEqual(enviado[0].attachments.map((attachment) => attachment.content), [pdf, xml, cdr])
    assert.equal(enviado[0].attachments[2].filename, `R-${nameFor(value)}.zip`)
    assert.equal(f.storage.get('sunat_correos')[0].estado, 'enviado')
    assert.equal(f.calls.length, 0)
  })
}

test('un SMTP temporalmente indisponible no cambia la aceptación ni reintenta de inmediato', async (t) => {
  let intentos = 0
  configurarSmtpFicticio(t, async () => {
    intentos++
    throw Object.assign(new Error('Fallo SMTP ficticio'), { responseCode: 450, command: 'DATA' })
  })
  const value = invoice('factura', { clienteDoc: RUC })
  const f = await fixture(t, [value], { DocNumero: RUC, CustomerEmail: 'cliente@example.test' })
  await saveComprobanteFile(ORDER_ID, 'pdf', Buffer.from('PDF ficticio'))
  await saveComprobanteFile(ORDER_ID, 'xml', Buffer.from('XML ficticio'))
  await saveComprobanteFile(ORDER_ID, 'cdr', cdrZip(nameFor(value), referenceFor(value)))
  assert.equal((await reintentarSunat(ORDER_ID)).status, 'aceptada')
  await procesarCorreosComprobantes()
  await procesarCorreosComprobantes()
  assert.equal(intentos, 1)
  assert.equal(f.storage.get('invoices')[0].status, 'aceptada')
  assert.equal(f.storage.get('sunat_correos')[0].estado, 'pendiente')
  assert.ok(f.storage.get('sunat_correos')[0].siguienteIntento > Date.now())
})
