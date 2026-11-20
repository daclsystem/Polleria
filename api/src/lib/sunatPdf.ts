import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import type { SunatDocument } from './sunat.js'

export async function comprobantePdf(data: SunatDocument, resumen: string) {
  const pdf = new jsPDF({ format: 'a4', compress: true })
  const left = 16
  const right = 194
  const date = data.fecha.slice(0, 10)
  const title = data.tipo === '01' ? 'Factura electrónica' : 'Boleta de venta electrónica'
  const reference = `${data.serie}-${data.numero}`
  const total = (value: number) => value.toFixed(2)
  const qr = [
    data.ruc, data.tipo, data.serie, data.numero, total(data.igv), total(data.total), date,
    data.cliente.tipo === '-' ? '' : data.cliente.tipo,
    data.cliente.tipo === '-' ? '' : data.cliente.documento,
    resumen,
  ].join('|')

  function encabezadoDetalle(y: number) {
    pdf.setFont('helvetica', 'bold').setFontSize(10)
    pdf.text('Descripción', left, y)
    pdf.text('Cant.', 135, y, { align: 'right' })
    pdf.text('P. unit.', 165, y, { align: 'right' })
    pdf.text('Importe', right, y, { align: 'right' })
    pdf.line(left, y + 2, right, y + 2)
    pdf.setFont('helvetica', 'normal')
    return y + 8
  }

  pdf.setFont('helvetica', 'bold').setFontSize(19).text(title, left, 21)
  pdf.setFontSize(13).text(reference, right, 21, { align: 'right' })
  const emisor = pdf.splitTextToSize(data.razonSocial, right - left) as string[]
  pdf.setFontSize(11).text(emisor, left, 34)
  let y = 35 + emisor.length * 5
  pdf.setFont('helvetica', 'normal').setFontSize(10)
  pdf.text(`RUC ${data.ruc}`, left, y)
  const address = pdf.splitTextToSize(data.direccionFiscal, right - left) as string[]
  pdf.text(address, left, y + 5)
  y += 11 + address.length * 5
  pdf.text(`Emisión ${date} · Contado · Soles`, left, y)
  const customer = pdf.splitTextToSize(
    data.cliente.tipo === '-' ? data.cliente.nombre : `${data.cliente.nombre} · ${data.cliente.tipo === '6' ? 'RUC' : 'DNI'} ${data.cliente.documento}`,
    right - left,
  ) as string[]
  pdf.text(customer, left, y + 6)
  y = encabezadoDetalle(y + 14 + customer.length * 5)

  for (const line of data.lineas) {
    const description = pdf.splitTextToSize(line.descripcion, 105) as string[]
    const height = 5 * description.length + 2
    if (y + height > 273) {
      pdf.addPage()
      y = encabezadoDetalle(20)
    }
    pdf.text(description, left, y)
    pdf.text(String(line.cantidad), 135, y, { align: 'right' })
    pdf.text(line.precio.toFixed(4).replace(/(\.\d{2}\d*?)0+$/, '$1'), 165, y, { align: 'right' })
    pdf.text(total(line.base + line.igv), right, y, { align: 'right' })
    y += height
  }

  if (y > 225) {
    pdf.addPage()
    y = 20
  }
  pdf.line(left, y, right, y)
  pdf.text(`Op. gravadas   S/ ${total(data.base)}`, right, y + 8, { align: 'right' })
  pdf.text(`IGV (${data.tasa} %)   S/ ${total(data.igv)}`, right, y + 14, { align: 'right' })
  pdf.setFont('helvetica', 'bold').text(`Total   S/ ${total(data.total)}`, right, y + 21, { align: 'right' })
  pdf.setFont('helvetica', 'normal').text(pdf.splitTextToSize(data.totalLetras, 108), left, y + 9)
  const qrImage = await QRCode.toDataURL(qr, { errorCorrectionLevel: 'M', margin: 4, width: 280 })
  pdf.addImage(qrImage, 'PNG', left, y + 24, 33, 33)
  pdf.setFontSize(9).text('Representación impresa del comprobante electrónico', left + 36, y + 41)
  return Buffer.from(pdf.output('arraybuffer'))
}
