import * as XLSX from 'xlsx'
import type { Order, User } from '../types'
import { PAY_LABEL, TYPE_LABEL } from '../types'

type RankRow = { label: string; total: number; count: number }

function staffLabel(order: Order, users: User[]) {
  if (order.source === 'web') return 'App / Web'
  if (order.createdByUserId) {
    const u = users.find((x) => x.id === order.createdByUserId)
    if (u) return u.name
  }
  if (order.createdBy) {
    const byId = users.find((x) => x.id === order.createdBy)
    if (byId) return byId.name
    const byName = users.find((x) => x.name === order.createdBy)
    if (byName) return byName.name
    if (!['api', 'Sistema', 'POS', 'Web'].includes(order.createdBy)) return order.createdBy
  }
  return 'Sin asignar'
}

function sheetFromRank(name: string, rows: RankRow[], countHeader: string) {
  const data = [
    ['#', 'Concepto', 'Monto S/', countHeader],
    ...rows.map((r, i) => [i + 1, r.label, Number(r.total.toFixed(2)), r.count]),
  ]
  return { name, data }
}

export function downloadReportsXlsx(opts: {
  periodLabel: string
  settingsName: string
  orders: Order[]
  paid: Order[]
  users: User[]
  kpis: Record<string, string | number>
  tables: RankRow[]
  mozos: RankRow[]
  staff: RankRow[]
  hours: RankRow[]
  customers: RankRow[]
  products: RankRow[]
  weekdays: RankRow[]
  byType: { label: string; value: number }[]
  byPay: { label: string; value: number }[]
  sources: RankRow[]
  categories: RankRow[]
}) {
  const wb = XLSX.utils.book_new()

  const resumen = [
    ['Chifa-Pollería Lopez — Reportes'],
    ['Local', opts.settingsName],
    ['Periodo', opts.periodLabel],
    ['Generado', new Date().toLocaleString('es-PE')],
    [],
    ['KPI', 'Valor'],
    ...Object.entries(opts.kpis).map(([k, v]) => [k, v]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen')

  const pedidos = [
    [
      'N°',
      'Fecha',
      'Tipo',
      'Mesa',
      'Cliente',
      'Teléfono',
      'Atendió',
      'Origen',
      'Estado',
      'Pago',
      'Pagado',
      'Subtotal',
      'IGV',
      'Total',
      'Ítems',
    ],
    ...opts.orders.map((o) => [
      o.number,
      o.createdAt,
      TYPE_LABEL[o.type] || o.type,
      o.tableNumber ?? '',
      o.customerName,
      o.customerPhone || '',
      staffLabel(o, opts.users),
      o.source,
      o.status,
      PAY_LABEL[o.paymentMethod] || o.paymentMethod,
      o.paid ? 'Sí' : 'No',
      o.subtotal,
      o.igv,
      o.total,
      o.items.map((i) => `${i.qty}x ${i.name}`).join(' | '),
    ]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pedidos), 'Pedidos')

  for (const s of [
    sheetFromRank('Mesas', opts.tables, 'Cuentas'),
    sheetFromRank('Mozos', opts.mozos, 'Pedidos'),
    sheetFromRank('Personal', opts.staff, 'Pedidos'),
    sheetFromRank('Horas', opts.hours, 'Tickets'),
    sheetFromRank('Clientes', opts.customers, 'Pedidos'),
    sheetFromRank('Productos', opts.products, 'Unidades'),
    sheetFromRank('DiasSemana', opts.weekdays, 'Tickets'),
    sheetFromRank('Origen', opts.sources, 'Tickets'),
    sheetFromRank('Categorias', opts.categories, 'Unidades'),
  ]) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.data), s.name.slice(0, 31))
  }

  const canal = [
    ['Canal / Tipo', 'Monto S/'],
    ...opts.byType.map((r) => [r.label, Number(r.value.toFixed(2))]),
    [],
    ['Método de pago', 'Monto S/'],
    ...opts.byPay.map((r) => [r.label, Number(r.value.toFixed(2))]),
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(canal), 'CanalPago')

  const fname = `reportes-lopez-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, fname)
}

export { staffLabel }
