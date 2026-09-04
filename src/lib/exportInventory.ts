import * as XLSX from 'xlsx'
import type { InventoryItem } from '../types'
import { formatDateTime } from './format'

export function downloadInventoryXlsx(
  items: InventoryItem[],
  movs: Array<{
    name: string
    unit: string
    delta: number
    stockAfter: number
    reason: string
    notes: string
    createdAt: string
    userName?: string
  }>,
  flow?: Array<{ inventoryId: string; had: number; out: number; in: number; left: number }>,
) {
  const wb = XLSX.utils.book_new()
  const flowBy = new Map((flow || []).map((f) => [f.inventoryId, f]))
  const stock = [
    ['Insumo', 'Unidad', 'Había (hoy)', 'Salió hoy', 'Ingresó hoy', 'Saldo', 'Mínimo', 'Costo', 'Precio venta'],
    ...items.map((i) => {
      const f = flowBy.get(i.id)
      return [
        i.name,
        i.unit,
        f?.had ?? '',
        f?.out ?? '',
        f?.in ?? '',
        i.stock,
        i.minStock,
        i.cost,
        i.salePrice ?? '',
      ]
    }),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stock), 'Stock')
  const kardex = [
    ['Fecha', 'Usuario', 'Insumo', 'Movimiento', 'Cantidad', 'Stock después', 'Nota'],
    ...movs.map((m) => [
      formatDateTime(m.createdAt),
      m.userName || '',
      m.name,
      m.reason,
      m.delta,
      m.stockAfter,
      m.notes,
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kardex), 'Movimientos')
  XLSX.writeFile(wb, 'inventario-polleria.xlsx')
}
