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
) {
  const wb = XLSX.utils.book_new()
  const stock = [
    ['Insumo', 'Unidad', 'Stock', 'Mínimo', 'Costo', 'Precio venta'],
    ...items.map((i) => [i.name, i.unit, i.stock, i.minStock, i.cost, i.salePrice ?? '']),
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
