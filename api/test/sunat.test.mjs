import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import forge from 'node-forge'
import { zipSync, unzipSync } from 'fflate'
import { SignedXml } from 'xml-crypto'
import { sql } from '../dist/db.js'
import { saveCertificado } from '../dist/lib/certificado.js'
import {
  activarEmision, comprobantePrueba, comprobantesParaImpresion, configuracionSunat, emitirBoletaAlCobrar,
  emitirComprobante, estadoEmision, guardarConfiguracionSunat, probarSunat, procesarPendientesSunat, reintentarSunat,
} from '../dist/lib/emision.js'
import { parseCdr, parseXml, pkcs12SigningKeys, signedInvoice } from '../dist/lib/sunat.js'
import { comprobantePdf } from '../dist/lib/sunatPdf.js'

const DS = 'http://www.w3.org/2000/09/xmldsig#'
const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/'
const SERVICE = 'http://service.sunat.gob.pe'

function cdrZip(name, reference, code) {
  const xml = `<ApplicationResponse xmlns="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2"
    xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
    xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
      <cbc:Note>Observación de prueba</cbc:Note>
      <cac:DocumentResponse><cac:Response>
        <cbc:ReferenceID>${reference}</cbc:ReferenceID>
        <cbc:ResponseCode>${code}</cbc:ResponseCode>
        <cbc:Description>Respuesta de prueba</cbc:Description>
      </cac:Response></cac:DocumentResponse>
    </ApplicationResponse>`
  return Buffer.from(zipSync({ [`R-${name}.xml`]: Buffer.from(xml) }))
}

for (const tipo of ['factura', 'boleta']) {
  test(`${tipo} UBL firmada y representación PDF`, async () => {
    const { xml, digest, document } = comprobantePrueba(tipo)
    const text = xml.toString('utf8')
    const dom = parseXml(text)
    assert.match(text, new RegExp(`<cbc:InvoiceTypeCode[^>]*>${document.tipo}</cbc:InvoiceTypeCode>`))
    assert.match(text, /<cbc:PayableAmount currencyID="PEN">20\.00<\/cbc:PayableAmount>/)
    const certificate = dom.getElementsByTagNameNS(DS, 'X509Certificate').item(0).textContent
    const verifier = new SignedXml({ publicCert: `-----BEGIN CERTIFICATE-----\n${certificate}\n-----END CERTIFICATE-----` })
    verifier.loadSignature(dom.getElementsByTagNameNS(DS, 'Signature').item(0))
    assert.equal(verifier.checkSignature(text), true)
    assert.equal(verifier.checkSignature(text.replace('20.00</cbc:PayableAmount>', '21.00</cbc:PayableAmount>')), false)
    const pdf = await comprobantePdf(document, digest)
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  })
}

function certificadoFicticio(password) {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 60_000)
  cert.validity.notAfter = new Date(Date.now() + 60_000)
  cert.setSubject([{ name: 'commonName', value: 'Fixture CDT' }])
  cert.setIssuer(cert.subject.attributes)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const archive = forge.pkcs12.toPkcs12Asn1(keys.privateKey, cert, password, { algorithm: 'aes256' })
  return Buffer.from(forge.asn1.toDer(archive).getBytes(), 'binary')
}

test('abre un .p12 con su clave y rechaza una clave equivocada', () => {
  const password = 'clave-de-prueba-123'
  const p12 = certificadoFicticio(password)
  const decoded = pkcs12SigningKeys(p12, password)
  assert.match(decoded.publicCert, /BEGIN CERTIFICATE/)
  assert.match(signedInvoice(comprobantePrueba('factura').document, decoded).xml.toString(), /X509Certificate/)
  assert.throws(() => pkcs12SigningKeys(p12, 'incorrecta'), /Revisa el archivo y su clave/)
})

test('solo admite una constancia con el nombre, referencia y código esperados', () => {
  const name = '20100066603-01-F001-1'
  assert.equal(parseCdr(cdrZip(name, 'F001-1', '0'), name).code, '0')
  assert.equal(parseCdr(cdrZip(name, 'F001-1', '2324'), name).code, '2324')
  assert.throws(() => parseCdr(cdrZip(name, 'F001-2', '0'), name), /numeración distinta/)
  assert.throws(() => parseCdr(cdrZip(name, 'F001-1', ''), name), /sin código válido/)
  assert.throws(() => parseCdr(cdrZip(name, 'F001-1', '0'), '20100066603-01-F001-2'), /no corresponde/)
})

test('la prueba usa el encabezado configurado y envía una boleta ficticia solo a Beta', async (t) => {
  const fake = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers.SOAPAction, 'urn:sendBill')
    const request = parseXml(options.body)
    const name = request.getElementsByTagName('fileName').item(0).textContent
    assert.match(name, /^20100066603-03-B555-\d{8}\.zip$/)
    assert.equal(request.getElementsByTagName('wsse:Username').item(0).textContent, '20100066603MODDATOS')
    const content = request.getElementsByTagName('contentFile').item(0).textContent
    const files = unzipSync(Buffer.from(content, 'base64'))
    const fileName = name.replace(/\.zip$/, '')
    assert.deepEqual(Object.keys(files), [`${fileName}.xml`])
    const xml = Buffer.from(Object.values(files)[0]).toString()
    assert.match(xml, /Consumo de prueba/)
    assert.match(xml, /<cbc:RegistrationName>EMISOR CONFIGURADO<\/cbc:RegistrationName>/)
    assert.match(xml, /<cbc:PayableAmount currencyID="PEN">13\.00<\/cbc:PayableAmount>/)
    const cdr = cdrZip(fileName, fileName.split('-').slice(2).join('-'), '0')
    return new Response(`<soap:Envelope xmlns:soap="${SOAP}" xmlns:ser="${SERVICE}">
      <soap:Body><ser:sendBillResponse><applicationResponse>${cdr.toString('base64')}</applicationResponse></ser:sendBillResponse></soap:Body>
    </soap:Envelope>`)
  })
  const prueba = await probarSunat('boleta', { numero: 7767, total: 13, tasa: 0.18 }, {
    ruc: '20100066603', razonSocial: 'EMISOR CONFIGURADO', serieboleta: 'B555',
  })
  assert.equal(prueba.codigo, '0')
  assert.equal(prueba.pedidoNumero, 7767)
  assert.equal(fake.mock.callCount(), 1)
})

test('habilita boletas y facturas sin key, conserva reintentos y valida pedido, importe y certificado', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'polleria-emision-'))
  const prevCert = process.env.CERTIFICADO_DIR
  const prevInvoices = process.env.COMPROBANTES_DIR
  process.env.CERTIFICADO_DIR = join(dir, 'certificado')
  process.env.COMPROBANTES_DIR = join(dir, 'comprobantes')
  t.after(async () => {
    if (prevCert === undefined) delete process.env.CERTIFICADO_DIR
    else process.env.CERTIFICADO_DIR = prevCert
    if (prevInvoices === undefined) delete process.env.COMPROBANTES_DIR
    else process.env.COMPROBANTES_DIR = prevInvoices
    await rm(dir, { recursive: true, force: true })
  })
  const password = 'clave-certificado-ficticio'
  await saveCertificado(certificadoFicticio(password), 'ficticio.p12', password)
  const storage = new Map([
    ['emision_activa', { activa: false }],
    ['emision_sin_licencia', { orderId: 'cupo-ya-utilizado' }],
    ['sunat', {
      ruc: '20100066603',
      razonSocial: 'LOCAL DE PRUEBA', direccionFiscal: 'LIMA, PERÚ', usuario: 'FICTICIO', clave: 'clave-ficticia',
      serieboleta: 'B003', seriefactura: 'F003',
      factilizaToken: 'token-ficticio',
    }],
    ['invoices', [{ orderId: 'pedido-previo', serie: 'B003', numero: 6, status: 'aceptada' }]],
  ])
  const pedidoFacturaId = '452b5e9e-441d-45ba-b946-26c4c3ef02d7'
  let orderOverride = {}
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
    if (query.includes('FROM dbo.Orders')) {
      return { recordset: [{ Paid: true, Status: 'entregado', Total: 20, DocTipo: this.parameters.id.value === pedidoFacturaId ? 'factura' : 'boleta', ...orderOverride }] }
    }
    if (query.includes('FROM dbo.OrderItems')) {
      return { recordset: [
        { Name: 'Producto ficticio', Qty: 2, Price: 8.77 },
        { Name: 'Otro producto ficticio', Qty: 3, Price: 2.51 },
        { Name: 'Cortesía', Qty: 1, Price: 0 },
      ] }
    }
    if (query.includes('FROM dbo.Settings')) return { recordset: [{ IgvRate: 0.18 }] }
    assert.fail('Consulta inesperada: ' + query)
  })

  const payloads = []
  let duranteEnvioDeCaja
  const resultXml = (content) => new Response(`<soap:Envelope xmlns:soap="${SOAP}" xmlns:ser="${SERVICE}">
      <soap:Body>${content}</soap:Body></soap:Envelope>`)
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService')
    assert.equal(storage.get('invoices')[0].status, 'pendiente')
    const request = parseXml(options.body)
    if (request.getElementsByTagNameNS(SERVICE, 'getStatus').length) {
      assert.equal(options.headers.SOAPAction, 'urn:getStatus')
      assert.equal(request.getElementsByTagName('ticket').item(0).textContent, '123456')
      const filename = storage.get('invoices')[0].resumen.nombre
      const cdr = cdrZip(filename, filename.slice(12), '0')
      return resultXml(`<ser:getStatusResponse><status><statusCode>0</statusCode><content>${cdr.toString('base64')}</content></status></ser:getStatusResponse>`)
    }
    const contents = request.getElementsByTagName('contentFile').item(0).textContent
    const filename = request.getElementsByTagName('fileName').item(0).textContent.replace(/\.zip$/, '')
    const zip = unzipSync(Buffer.from(contents, 'base64'))
    const xml = Buffer.from(zip[`${filename}.xml`])
    payloads.push(xml)
    if (request.getElementsByTagNameNS(SERVICE, 'sendSummary').length) {
      assert.equal(options.headers.SOAPAction, 'urn:sendSummary')
      assert.match(filename, /^20100066603-RC-\d{8}-\d+$/)
      assert.deepEqual(Object.keys(zip), [`${filename}.xml`])
      assert.match(xml.toString(), new RegExp(`<cbc:ID>B003-${storage.get('invoices')[0].numero}</cbc:ID>`))
      assert.match(xml.toString(), /<cbc:Percent>18\.00<\/cbc:Percent>/)
      if (payloads.length === 1) throw new Error('Corte ficticio después de la reserva')
      if (duranteEnvioDeCaja) await duranteEnvioDeCaja()
      return resultXml('<ser:sendSummaryResponse><ticket>123456</ticket></ser:sendSummaryResponse>')
    }
    assert.equal(options.headers.SOAPAction, 'urn:sendBill')
    const cdr = cdrZip(filename, filename.split('-').slice(2).join('-'), '0')
    return resultXml(`<ser:sendBillResponse><applicationResponse>${cdr.toString('base64')}</applicationResponse></ser:sendBillResponse>`)
  })

  const input = {
    orderId: 'de9515b0-131a-4f2d-92a0-f2f94d9416b6',
    tipo: 'boleta', cliente: { tipDoc: '0', num: '00000000', nombre: 'CLIENTES VARIOS' },
    lines: [{ descripcion: 'Consumo ficticio', cantidad: 2, precio: 10 }],
  }
  const secondInput = {
    ...input, orderId: pedidoFacturaId, tipo: 'factura',
    cliente: { tipDoc: '6', num: '20600000005', nombre: 'CLIENTE FICTICIO' },
  }
  assert.equal((await estadoEmision()).disponible, true)
  assert.equal((await estadoEmision()).activa, true)
  assert.equal((await estadoEmision()).requiereLicencia, false)
  await activarEmision()
  await guardarConfiguracionSunat({ razonSocial: 'LOCAL DE PRUEBA ACTUALIZADO', clave: '', factilizaToken: 'otro valor' })
  assert.equal(storage.get('sunat').clave, 'clave-ficticia')
  assert.equal(storage.get('sunat').factilizaToken, 'token-ficticio')
  const configPublica = await configuracionSunat()
  assert.equal(configPublica.claveSolGuardada, true)
  assert.equal(Object.hasOwn(configPublica, 'clave'), false)
  assert.equal(Object.hasOwn(configPublica, 'factilizaToken'), false)
  await assert.rejects(emitirComprobante({ ...input, orderId: pedidoFacturaId }), /El pedido requiere una factura/)
  await assert.rejects(emitirComprobante({ ...input, lines: [{ ...input.lines[0], precio: 11 }] }), /importe pagado/)
  for (const override of [{ Paid: false }, { Status: 'cancelado' }, { Status: 'eliminado' }]) {
    orderOverride = override
    await assert.rejects(emitirComprobante(input), /pedido pagado y vigente/)
  }
  orderOverride = {}
  assert.equal(storage.get('invoices').length, 1)
  const { invoice: pending } = await emitirComprobante(input)
  assert.equal(pending.status, 'pendiente')
  assert.equal(pending.numero, 7)
  assert.equal((await estadoEmision()).disponible, true)
  assert.equal(fetchMock.mock.callCount(), 1)
  const sentSummary = await reintentarSunat(input.orderId)
  assert.equal(sentSummary.status, 'pendiente')
  assert.equal(sentSummary.resumen.ticket, '123456')
  const accepted = await reintentarSunat(input.orderId)
  assert.equal(accepted.status, 'aceptada')
  assert.equal(accepted.numero, 7)
  assert.deepEqual(payloads[0], payloads[1])
  assert.deepEqual(await readFile(join(dir, 'comprobantes', input.orderId, 'resumen.xml')), payloads[0])
  assert.match(await readFile(join(dir, 'comprobantes', input.orderId, 'xml.xml'), 'utf8'), /<cbc:ID>B003-7<\/cbc:ID>/)
  assert.equal((await emitirComprobante(input)).invoice.status, 'aceptada')
  assert.equal(fetchMock.mock.callCount(), 3)

  // No se realiza ninguna activación ni se modifica el estado heredado de licencia.
  const { invoice: second } = await emitirComprobante(secondInput)
  assert.equal(second.status, 'aceptada')
  assert.equal(second.tipo, 'factura')
  assert.equal(fetchMock.mock.callCount(), 4)
  const thirdInput = { ...input, orderId: '166cdd99-1b1c-45d2-8a51-49573cc3d12e' }
  const { invoice: third } = await emitirComprobante(thirdInput)
  assert.equal(third.numero, 8)
  assert.equal(third.status, 'pendiente')
  assert.equal((await reintentarSunat(thirdInput.orderId)).status, 'aceptada')
  assert.equal(fetchMock.mock.callCount(), 6)
  assert.deepEqual(storage.get('emision_activa'), { activa: false })
  assert.deepEqual(storage.get('emision_sin_licencia'), { orderId: 'cupo-ya-utilizado' })

  const idCaja = 'c4ab2aae-126e-4d3b-9dea-d0381803a85f'
  orderOverride = { DocTipo: 'boleta_dni', DocNumero: '98765432', DocNombre: 'COMPRADOR FICTICIO', Paid: false }
  await assert.rejects(emitirBoletaAlCobrar(idCaja), /pedido pagado y vigente/)
  orderOverride.Paid = true
  const boletaCaja = await emitirBoletaAlCobrar(idCaja)
  assert.equal(boletaCaja.status, 'pendiente')
  assert.equal(boletaCaja.serie, 'B003')
  assert.equal(boletaCaja.numero, 9)
  assert.equal(boletaCaja.clienteDoc, '98765432')
  assert.equal(boletaCaja.clienteNombre, 'COMPRADOR FICTICIO')
  assert.deepEqual(await emitirBoletaAlCobrar(idCaja.toUpperCase()), boletaCaja)
  assert.equal(fetchMock.mock.callCount(), 6)
  const xmlCaja = await readFile(join(dir, 'comprobantes', idCaja, 'xml.xml'), 'utf8')
  assert.match(xmlCaja, /<cbc:ID>B003-9<\/cbc:ID>/)
  assert.match(xmlCaja, /<cbc:PayableAmount currencyID="PEN">20\.00<\/cbc:PayableAmount>/)
  assert.match(xmlCaja, /Producto ficticio/)
  assert.match(xmlCaja, /98765432/)
  assert.doesNotMatch(xmlCaja, /Cortesía/)
  duranteEnvioDeCaja = async () => {
    const reintentoEnCurso = await reintentarSunat(idCaja)
    assert.equal(reintentoEnCurso.status, 'pendiente')
    assert.equal(reintentoEnCurso.numero, boletaCaja.numero)
    assert.ok(reintentoEnCurso.nextRetryAt)
    assert.equal(fetchMock.mock.callCount(), 7)
  }
  await procesarPendientesSunat()
  assert.equal(fetchMock.mock.callCount(), 7)
  assert.equal(storage.get('invoices')[0].resumen.ticket, '123456')
  await procesarPendientesSunat()
  const reimpresion = (await comprobantesParaImpresion()).get(idCaja)
  assert.deepEqual(reimpresion, { ...boletaCaja, status: 'aceptada' })
  assert.equal(fetchMock.mock.callCount(), 8)
  orderOverride = {}

  await guardarConfiguracionSunat({ ruc: '' })
  assert.equal((await estadoEmision()).disponible, false)
  await assert.rejects(activarEmision(), /Completa los datos/)
  await assert.rejects(emitirComprobante(input), /Completa los datos de emisión/)
  await guardarConfiguracionSunat({ ruc: '20100066603' })
  const passFile = join(dir, 'certificado', 'certificado.pass')
  await writeFile(passFile, 'incorrecta')
  assert.equal((await estadoEmision()).disponible, false)
  assert.match((await estadoEmision()).motivo, /Revisa el archivo y su clave/)
  await assert.rejects(activarEmision(), /Revisa el archivo y su clave/)
  await writeFile(passFile, password)
  assert.equal((await estadoEmision()).disponible, true)
  await rm(passFile)
  assert.equal((await estadoEmision()).disponible, false)
})
