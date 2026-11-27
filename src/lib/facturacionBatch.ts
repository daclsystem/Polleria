export function normalizarPedidoId(id: string) {
  return id.trim().toLowerCase()
}

type ComprobantePorPedido = {
  orderId: string
  serie: string
  numero: number
  status: string
}

function estadoFinal(status: string) {
  return status === 'aceptada' || status === 'rechazada'
}

/** Conserva la confirmación de SUNAT ante una respuesta HTTP pendiente más antigua. */
export function combinarComprobante<T extends ComprobantePorPedido>(invoices: T[], invoice: T): T[] {
  const id = normalizarPedidoId(invoice.orderId)
  const primero = invoices.findIndex((item) => normalizarPedidoId(item.orderId) === id)
  if (primero < 0) return [invoice, ...invoices]

  const confirmado = invoices.find((item) => normalizarPedidoId(item.orderId) === id &&
    item.serie === invoice.serie && item.numero === invoice.numero && estadoFinal(item.status))
  const actual = confirmado && !estadoFinal(invoice.status) ? confirmado : invoice
  return invoices.flatMap((item, index) => normalizarPedidoId(item.orderId) === id
    ? index === primero ? [actual] : []
    : [item])
}

/** Los GUID de SQL y del navegador pueden representar el mismo pedido con distinto casing. */
export function pedidosSinComprobante<T extends { id: string; paid: boolean; status: string }>(
  orders: T[], invoices: Array<{ orderId: string }>,
): T[] {
  const emitidos = new Set(invoices.map((invoice) => normalizarPedidoId(invoice.orderId)))
  return orders.filter((order) => order.paid &&
    !/^(cancelad[oa]|eliminad[oa]|anulad[oa])$/.test(order.status.trim().toLowerCase()) &&
    !emitidos.has(normalizarPedidoId(order.id)))
}

/** Cada pedido termina antes de empezar el siguiente; un fallo no interrumpe el resto. */
export async function ejecutarLoteSecuencial<T>(
  items: readonly T[],
  emitir: (item: T, index: number) => Promise<void>,
  onError: (item: T, error: unknown, index: number) => void,
): Promise<void> {
  for (const [index, item] of items.entries()) {
    try {
      await emitir(item, index)
    } catch (error) {
      onError(item, error, index)
    }
  }
}
