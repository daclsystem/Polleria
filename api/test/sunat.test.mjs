import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import forge from 'node-forge'
import { zipSync, unzipSync } from 'fflate'
import { SignedXml } from 'xml-crypto'
import { sql } from '../dist/db.js'
import { saveCertificado } from '../dist/lib/certificado.js'
import { comprobantePrueba, emitirComprobante, probarSunat, reintentarSunat } from '../dist/lib/emision.js'
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

test('la prueba envía únicamente una boleta ficticia al ambiente Beta', async (t) => {
  const fake = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService')
    assert.equal(options.redirect, 'error')
    const request = parseXml(options.body)
    const name = request.getElementsByTagName('fileName').item(0).textContent
    assert.equal(name, '20100066603-03-B001-1.zip')
    const content = request.getElementsByTagName('contentFile').item(0).textContent
    const files = unzipSync(Buffer.from(content, 'base64'))
    assert.deepEqual(Object.keys(files), ['20100066603-03-B001-1.xml'])
    assert.match(Buffer.from(Object.values(files)[0]).toString(), /Consumo de prueba/)
    const cdr = cdrZip('20100066603-03-B001-1', 'B001-1', '0')
    return new Response(`<soap:Envelope xmlns:soap="${SOAP}" xmlns:ser="${SERVICE}">
      <soap:Body><ser:sendBillResponse><applicationResponse>${cdr.toString('base64')}</applicationResponse></ser:sendBillResponse></soap:Body>
    </soap:Envelope>`)
  })
  assert.equal((await probarSunat('boleta')).codigo, '0')
  assert.equal(fake.mock.callCount(), 1)
})

test('reserva un comprobante antes del envío y conserva su XML y correlativo al reintentar', async (t) => {
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
    ['emision_activa', { activa: true }],
    ['sunat', {
      proveedor: 'sunat', ambiente: 'produccion', enabled: true, ruc: '20100066603',
      razonSocial: 'LOCAL DE PRUEBA', direccionFiscal: 'LIMA, PERÚ', usuario: 'FICTICIO', clave: 'clave-ficticia',
      serieboleta: 'B003', seriefactura: 'F003',
    }],
    ['invoices', [{ orderId: 'pedido-previo', serie: 'B003', numero: 6, status: 'aceptada' }]],
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
    if (query.includes('FROM dbo.Orders')) return { recordset: [{ Paid: true, Status: 'entregado', Total: 20 }] }
    if (query.includes('FROM dbo.Settings')) return { recordset: [{ IgvRate: 0.18 }] }
    assert.fail('Consulta inesperada: ' + query)
  })

  const payloads = []
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService')
    assert.equal(storage.get('invoices')[0].status, 'pendiente')
    const request = parseXml(options.body)
    const contents = request.getElementsByTagName('contentFile').item(0).textContent
    const xml = Buffer.from(unzipSync(Buffer.from(contents, 'base64'))['20100066603-03-B003-7.xml'])
    payloads.push(xml)
    if (payloads.length === 1) throw new Error('Corte ficticio después de la reserva')
    const cdr = cdrZip('20100066603-03-B003-7', 'B003-7', '0')
    return new Response(`<soap:Envelope xmlns:soap="${SOAP}" xmlns:ser="${SERVICE}">
      <soap:Body><ser:sendBillResponse><applicationResponse>${cdr.toString('base64')}</applicationResponse></ser:sendBillResponse></soap:Body>
    </soap:Envelope>`)
  })

  const input = {
    orderId: 'de9515b0-131a-4f2d-92a0-f2f94d9416b6',
    tipo: 'boleta', cliente: { tipDoc: '0', num: '00000000', nombre: 'CLIENTES VARIOS' },
    lines: [{ descripcion: 'Consumo ficticio', cantidad: 2, precio: 10 }],
  }
  await assert.rejects(emitirComprobante({ ...input, lines: [{ ...input.lines[0], precio: 11 }] }), /importe pagado/)
  assert.equal(storage.get('invoices').length, 1)
  const { invoice: pending } = await emitirComprobante(input)
  assert.equal(pending.status, 'pendiente')
  assert.equal(pending.numero, 7)
  const accepted = await reintentarSunat(input.orderId)
  assert.equal(accepted.status, 'aceptada')
  assert.equal(accepted.numero, 7)
  assert.deepEqual(payloads[0], payloads[1])
  assert.deepEqual(await readFile(join(dir, 'comprobantes', input.orderId, 'xml.xml')), payloads[0])
  assert.equal((await emitirComprobante(input)).invoice.status, 'aceptada')
  assert.equal(fetchMock.mock.callCount(), 2)
})
