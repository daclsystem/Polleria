import { createPrivateKey, X509Certificate } from 'node:crypto'
import { DOMParser, onWarningStopParsing, type Element } from '@xmldom/xmldom'
import { unzipSync, zipSync } from 'fflate'
import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'

const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'
const EXT = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2'
const DS = 'http://www.w3.org/2000/09/xmldsig#'
const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/'
const SERVICE = 'http://service.sunat.gob.pe'
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'
const SIGNATURE_ID = 'FirmaCPE'
const CATALOG = 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo'
const SUNAT_BETA = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService'
const SUNAT_PRODUCTION = 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService'
const XML_LIMIT = 2 * 1024 * 1024

export interface SunatDocument {
  ruc: string
  razonSocial: string
  direccionFiscal: string
  establecimiento: string
  tipo: '01' | '03'
  serie: string
  numero: number
  fecha: string
  cliente: { tipo: '6' | '1' | '-'; documento: string; nombre: string }
  lineas: Array<{
    descripcion: string
    cantidad: number
    precio: number
    base: number
    igv: number
  }>
  tasa: number
  base: number
  igv: number
  total: number
  totalLetras: string
}

type SigningKeys = { privateKey: string; publicCert: string }

export function xmlText(value: string | number) {
  // XML 1.0 no admite estos caracteres incluso si se representan como entidades.
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, '').replace(
    /[<>&"']/g,
    (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  )
}

const amount = (tag: string, value: number) => `<cbc:${tag} currencyID="PEN">${value.toFixed(2)}</cbc:${tag}>`
const catalog = (id: string) => CATALOG + id

function identity(tipo: string, documento: string) {
  return `<cac:PartyIdentification><cbc:ID schemeID="${tipo}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="${catalog('06')}">${xmlText(documento)}</cbc:ID></cac:PartyIdentification>`
}

function taxes(base: number, igv: number, tasa?: number) {
  return `<cac:TaxTotal>${amount('TaxAmount', igv)}
    <cac:TaxSubtotal>${amount('TaxableAmount', base)}${amount('TaxAmount', igv)}
      <cac:TaxCategory>${tasa === undefined ? '' : `<cbc:Percent>${tasa.toFixed(2)}</cbc:Percent><cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listURI="${catalog('07')}">10</cbc:TaxExemptionReasonCode>`}
        <cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`
}

function invoiceLine(line: SunatDocument['lineas'][number], index: number, tasa: number) {
  return `<cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">${line.cantidad.toFixed(3)}</cbc:InvoicedQuantity>
    ${amount('LineExtensionAmount', line.base)}
    <cac:PricingReference><cac:AlternativeConditionPrice>
      <cbc:PriceAmount currencyID="PEN">${line.precio.toFixed(10)}</cbc:PriceAmount>
      <cbc:PriceTypeCode listAgencyName="PE:SUNAT" listURI="${catalog('16')}">01</cbc:PriceTypeCode>
    </cac:AlternativeConditionPrice></cac:PricingReference>
    ${taxes(line.base, line.igv, tasa)}
    <cac:Item><cbc:Description>${xmlText(line.descripcion)}</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="PEN">${(line.base / line.cantidad).toFixed(10)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`
}

export function unsignedInvoice(d: SunatDocument) {
  const [fecha, hora] = d.fecha.split('T')
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="${CBC}" xmlns:cac="${CAC}" xmlns:ext="${EXT}">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${d.serie}-${d.numero}</cbc:ID>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  <cbc:IssueTime>${hora.slice(0, 8)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="${catalog('01')}">${d.tipo}</cbc:InvoiceTypeCode>
  <cbc:Note languageLocaleID="1000">${xmlText(d.totalLetras)}</cbc:Note>
  <cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">PEN</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${d.lineas.length}</cbc:LineCountNumeric>
  <cac:Signature>
    <cbc:ID>${SIGNATURE_ID}</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification><cbc:ID>${d.ruc}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xmlText(d.razonSocial)}</cbc:Name></cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#${SIGNATURE_ID}</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty><cac:Party>
    ${identity('6', d.ruc)}
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>${xmlText(d.razonSocial)}</cbc:RegistrationName>
      <cac:RegistrationAddress>
        <cbc:AddressTypeCode listAgencyName="PE:SUNAT" listName="Establecimientos anexos">${d.establecimiento}</cbc:AddressTypeCode>
        <cac:AddressLine><cbc:Line>${xmlText(d.direccionFiscal)}</cbc:Line></cac:AddressLine>
        <cac:Country><cbc:IdentificationCode>PE</cbc:IdentificationCode></cac:Country>
      </cac:RegistrationAddress>
    </cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    ${identity(d.cliente.tipo, d.cliente.documento)}
    <cac:PartyLegalEntity><cbc:RegistrationName>${xmlText(d.cliente.nombre)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  ${d.tipo === '01' ? '<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>' : ''}
  ${taxes(d.base, d.igv)}
  <cac:LegalMonetaryTotal>
    ${amount('LineExtensionAmount', d.base)}
    ${amount('TaxInclusiveAmount', d.total)}
    ${amount('PayableAmount', d.total)}
  </cac:LegalMonetaryTotal>
  ${d.lineas.map((line, index) => invoiceLine(line, index, d.tasa)).join('\n')}
</Invoice>`
}

export function pkcs12SigningKeys(archivo: Buffer, clave: string): SigningKeys {
  try {
    const container = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(archivo.toString('binary')), clave)
    const keyBags = [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag]
      .flatMap((bagType) => container.getBags({ bagType })[bagType] ?? [])
    const bagType = forge.pki.oids.certBag
    const certificates = container.getBags({ bagType })[bagType] ?? []
    for (const keyBag of keyBags) {
      if (!keyBag.key) continue
      const privateKey = forge.pki.privateKeyToPem(keyBag.key)
      const key = createPrivateKey(privateKey)
      for (const certBag of certificates) {
        if (!certBag.cert) continue
        const publicCert = forge.pki.certificateToPem(certBag.cert)
        const cert = new X509Certificate(publicCert)
        if (!cert.checkPrivateKey(key)) continue
        if (Date.now() < Date.parse(cert.validFrom) || Date.now() > Date.parse(cert.validTo)) {
          throw new Error('El certificado digital está vencido o todavía no está vigente.')
        }
        return { privateKey, publicCert }
      }
    }
  } catch (error) {
    if ((error as Error).message === 'El certificado digital está vencido o todavía no está vigente.') {
      throw Object.assign(error as Error, { status: 400 })
    }
  }
  throw Object.assign(new Error('No pude abrir la firma del certificado .p12 o .pfx. Revisa el archivo y su clave.'), { status: 400 })
}

export function signedInvoice(document: SunatDocument, keys: SigningKeys) {
  const signer = new SignedXml({
    ...keys,
    canonicalizationAlgorithm: C14N,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  })
  signer.addReference({
    xpath: '/*',
    isEmptyUri: true,
    transforms: [DS + 'enveloped-signature', C14N],
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
  })
  signer.computeSignature(unsignedInvoice(document), {
    prefix: 'ds',
    attrs: { Id: SIGNATURE_ID },
    location: { reference: `//*[local-name()='ExtensionContent' and namespace-uri()='${EXT}']`, action: 'append' },
  })
  const xml = signer.getSignedXml()
  const digest = parseXml(xml).getElementsByTagNameNS(DS, 'DigestValue').item(0)?.textContent
  if (!digest) throw new Error('No se pudo calcular el resumen de la firma digital.')
  return { xml: Buffer.from(xml, 'utf8'), digest }
}

export function parseXml(xml: string) {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('El XML contiene una declaración de tipo de documento inesperada.')
  return new DOMParser({ onError: onWarningStopParsing }).parseFromString(xml, 'application/xml')
}

function child(parent: Element, namespace: string, localName: string) {
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType !== 1) continue
    const element = node as Element
    if (element.localName === localName && (element.namespaceURI || '') === namespace) return element
  }
  return null
}

export function parseCdr(zip: Buffer, fileName: string) {
  if (!zip.length || zip.length > XML_LIMIT) throw new Error('El tamaño de la constancia SUNAT es inválido.')
  const expectedName = `R-${fileName}.xml`
  const files = unzipSync(zip, {
    filter: (entry) => entry.name.toUpperCase() === expectedName.toUpperCase() && entry.originalSize <= XML_LIMIT,
  })
  const file = Object.values(files)[0]
  if (!file) throw new Error('La constancia recibida no corresponde al comprobante enviado.')
  const root = parseXml(Buffer.from(file).toString('utf8')).documentElement
  if (!root || root.localName !== 'ApplicationResponse' ||
      root.namespaceURI !== 'urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2') {
    throw new Error('SUNAT devolvió una constancia con un formato inesperado.')
  }
  const documentResponse = child(root, CAC, 'DocumentResponse')
  const response = documentResponse && child(documentResponse, CAC, 'Response')
  const reference = response && child(response, CBC, 'ReferenceID')?.textContent?.trim()
  const code = response && child(response, CBC, 'ResponseCode')?.textContent?.trim()
  const description = response && child(response, CBC, 'Description')?.textContent?.trim()
  const expectedReference = fileName.split('-').slice(2).join('-')
  if (!code || !/^\d{1,4}$/.test(code) || reference !== expectedReference) {
    throw new Error('SUNAT devolvió una constancia sin código válido o con una numeración distinta.')
  }
  const notes = Array.from(root.getElementsByTagNameNS(CBC, 'Note')).map((note) => note.textContent?.trim()).filter(Boolean)
  return { code, message: [description, ...notes].filter(Boolean).join(' · ').slice(0, 900), zip }
}

export async function sendBill(
  environment: 'beta' | 'produccion',
  auth: { ruc: string; usuario: string; clave: string },
  fileName: string,
  xml: Buffer,
) {
  const zip = zipSync({ [fileName + '.xml']: xml })
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${SOAP}" xmlns:ser="${SERVICE}" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soap:Header><wsse:Security><wsse:UsernameToken><wsse:Username>${xmlText(auth.ruc + auth.usuario)}</wsse:Username><wsse:Password>${xmlText(auth.clave)}</wsse:Password></wsse:UsernameToken></wsse:Security></soap:Header>
  <soap:Body><ser:sendBill><fileName>${xmlText(fileName)}.zip</fileName><contentFile>${Buffer.from(zip).toString('base64')}</contentFile></ser:sendBill></soap:Body>
</soap:Envelope>`
  const response = await fetch(environment === 'beta' ? SUNAT_BETA : SUNAT_PRODUCTION, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
    body: envelope,
  })
  if (Number(response.headers.get('content-length')) > XML_LIMIT) {
    await response.body?.cancel()
    throw new Error('SUNAT devolvió una respuesta demasiado grande.')
  }
  const text = await response.text()
  if (text.length > XML_LIMIT) throw new Error('SUNAT devolvió una respuesta demasiado grande.')
  const root = (() => {
    try {
      return parseXml(text).documentElement
    } catch {
      throw new Error(`SUNAT devolvió una respuesta inválida (HTTP ${response.status}).`)
    }
  })()
  const body = root && child(root, SOAP, 'Body')
  if (!body) throw new Error(`SUNAT devolvió una respuesta inválida (HTTP ${response.status}).`)
  const fault = child(body, SOAP, 'Fault')
  if (fault) {
    const message = child(fault, '', 'faultstring')?.textContent || fault.getElementsByTagName('faultstring').item(0)?.textContent
    const code = fault.getElementsByTagName('faultcode').item(0)?.textContent?.match(/\b(\d{3,4})\b/)?.[1]
    const safe = (message || 'El servicio devolvió un error.').replaceAll(auth.clave, '[omitida]').replaceAll(auth.ruc + auth.usuario, '[omitido]')
    throw new Error(`SUNAT${code ? ' ' + code : ''}: ${safe.slice(0, 500)}`)
  }
  const result = child(body, SERVICE, 'sendBillResponse')
  const content = result?.getElementsByTagName('applicationResponse').item(0)?.textContent?.replace(/\s/g, '')
    || result?.getElementsByTagNameNS(SERVICE, 'applicationResponse').item(0)?.textContent?.replace(/\s/g, '')
  if (!response.ok || !content) throw new Error(`SUNAT no devolvió una constancia (HTTP ${response.status}).`)
  return parseCdr(Buffer.from(content, 'base64'), fileName)
}
