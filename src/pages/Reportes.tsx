import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Printer } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { apiReportOrders } from '../lib/apiClient'
import { formatDate, formatDateTime, isSameDay, limaHour, limaWeekdayShort, padOrder, soles } from '../lib/format'
import { limaDayEnd, limaDayStart, limaTodayYmd, paidSalesByDay } from '../lib/salesDays'
import { printReport, reportHtml } from '../lib/print'
import { downloadReportsXlsx, staffLabel } from '../lib/exportReports'
import type { Order, OrderType, PaymentMethod, User } from '../types'
import { isVoidOrder, PAY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../types'
import { PageTitle } from '../components/ui'
import {
  ComposedDayChart,
  DonutChart,
  HorizontalMoneyChart,
  HourMoneyChart,
  VerticalMoneyChart,
} from '../components/ReportCharts'

type RankRow = { label: string; total: number; count: number }
type TabId = 'resumen' | 'mesas' | 'equipo' | 'horas' | 'clientes' | 'carta' | 'canal' | 'detalle'

const TABS: { id: TabId; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'mesas', label: 'Mesas' },
  { id: 'equipo', label: 'Equipo' },
  { id: 'horas', label: 'Horas' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'carta', label: 'Carta' },
  { id: 'canal', label: 'Canal / Pago' },
  { id: 'detalle', label: 'Detalle' },
]

function addRank(map: Map<string, RankRow>, label: string, total: number, qty = 1) {
  const cur = map.get(label) || { label, total: 0, count: 0 }
  cur.total += total
  cur.count += qty
  map.set(label, cur)
}

function toRank(map: Map<string, RankRow>, limit = 15): RankRow[] {
  return [...map.values()].sort((a, b) => b.total - a.total || b.count - a.count).slice(0, limit)
}

function staffUser(order: Order, users: User[]): User | undefined {
  if (order.createdByUserId) return users.find((x) => x.id === order.createdByUserId)
  if (order.createdBy) {
    return users.find((x) => x.id === order.createdBy || x.name === order.createdBy)
  }
  return undefined
}

function limaStart(ymd: string) {
  return limaDayStart(ymd)
}
function limaEnd(ymd: string) {
  return limaDayEnd(ymd)
}
function todayYmd() {
  return limaTodayYmd()
}

function deltaPct(current: number, previous: number) {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

export function Reportes() {
  const { state } = useStore()
  const [preset, setPreset] = useState<1 | 7 | 30 | 'rango'>(7)
  const [fromYmd, setFromYmd] = useState(() => {
    const d = limaStart(todayYmd())
    d.setUTCDate(d.getUTCDate() - 6)
    return d.toISOString().slice(0, 10)
  })
  const [toYmd, setToYmd] = useState(todayYmd)
  const [tab, setTab] = useState<TabId>('resumen')
  const [dbOrders, setDbOrders] = useState<Order[] | null>(null)
  const [reportLoading, setReportLoading] = useState(true)
  const [reportError, setReportError] = useState<string | null>(null)

  const { from, until } = useMemo(() => {
    if (preset === 'rango') {
      const a = fromYmd <= toYmd ? fromYmd : toYmd
      const b = fromYmd <= toYmd ? toYmd : fromYmd
      return { from: limaStart(a), until: limaEnd(b) }
    }
    const end = limaEnd(todayYmd())
    const start = limaStart(todayYmd())
    start.setUTCDate(start.getUTCDate() - (preset - 1))
    return { from: start, until: end }
  }, [preset, fromYmd, toYmd])

  useEffect(() => {
    let cancel = false
    const span = until.getTime() - from.getTime()
    const prevFrom = new Date(from.getTime() - span)
    setReportLoading(true)
    setReportError(null)
    apiReportOrders(prevFrom.toISOString(), until.toISOString())
      .then((rows) => {
        if (!cancel) setDbOrders(rows)
      })
      .catch((e) => {
        if (!cancel) {
          setDbOrders([])
          setReportError((e as Error).message || 'No se pudieron leer los pedidos de la base')
        }
      })
      .finally(() => {
        if (!cancel) setReportLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [from, until])

  const periodOrders = useMemo(
    () =>
      (dbOrders ?? []).filter((o) => {
        const t = new Date(o.createdAt).getTime()
        return t >= from.getTime() && t < until.getTime()
      }),
    [dbOrders, from, until],
  )
  const orders = periodOrders.filter((o) => !isVoidOrder(o.status))
  const cancelled = periodOrders.filter((o) => isVoidOrder(o.status))
  const paid = orders.filter((o) => o.paid)
  const unpaid = orders.filter((o) => !o.paid)

  const sales = paid.reduce((s, o) => s + o.total, 0)
  const igv = paid.reduce((s, o) => s + o.igv, 0)
  const ticketAvg = paid.length ? sales / paid.length : 0
  const pending = unpaid.reduce((s, o) => s + o.total, 0)
  const cancelledTotal = cancelled.reduce((s, o) => s + o.total, 0)
  const itemsSold = paid.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0)
  const deliveryFees = paid.reduce(
    (s, o) => s + o.items.filter((i) => /^delivery$/i.test(i.name) || i.productId === 'delivery').reduce((a, i) => a + i.price * i.qty, 0),
    0,
  )

  const prevPaid = useMemo(() => {
    const ms = until.getTime() - from.getTime()
    const prevFrom = from.getTime() - ms
    const prevUntil = from.getTime()
    return (dbOrders ?? []).filter((o) => {
      const t = new Date(o.createdAt).getTime()
      return t >= prevFrom && t < prevUntil && o.paid && !isVoidOrder(o.status)
    })
  }, [dbOrders, from, until])
  const prevSales = prevPaid.reduce((s, o) => s + o.total, 0)
  const prevTickets = prevPaid.length
  const prevAvg = prevTickets ? prevSales / prevTickets : 0
  const salesDelta = deltaPct(sales, prevSales)
  const ticketsDelta = deltaPct(paid.length, prevTickets)
  const avgDelta = deltaPct(ticketAvg, prevAvg)

  const daily = useMemo(() => paidSalesByDay(periodOrders, from, until), [periodOrders, from, until])

  const productById = useMemo(() => new Map(state.products.map((p) => [p.id, p])), [state.products])

  const analytics = useMemo(() => {
    const byType = new Map<OrderType, number>()
    const byPay = new Map<PaymentMethod, number>()
    const byTable = new Map<string, RankRow>()
    const byStaff = new Map<string, RankRow>()
    const byMozo = new Map<string, RankRow>()
    const byHour = new Map<string, RankRow>()
    const byWeekday = new Map<string, RankRow>()
    const byCustomer = new Map<string, RankRow>()
    const byProduct = new Map<string, RankRow>()
    const bySource = new Map<string, RankRow>()
    const byCategory = new Map<string, RankRow>()
    const byDriver = new Map<string, RankRow>()
    const ticketByType = new Map<OrderType, { total: number; count: number }>()

    for (const o of paid) {
      byType.set(o.type, (byType.get(o.type) ?? 0) + o.total)
      byPay.set(o.paymentMethod, (byPay.get(o.paymentMethod) ?? 0) + o.total)

      const tb = ticketByType.get(o.type) || { total: 0, count: 0 }
      tb.total += o.total
      tb.count += 1
      ticketByType.set(o.type, tb)

      if (o.type === 'salon' && o.tableNumber != null) {
        addRank(byTable, `Mesa ${o.tableNumber}`, o.total)
      } else if (o.type === 'salon') {
        addRank(byTable, 'Salón (sin mesa)', o.total)
      }

      const who = staffLabel(o, state.users)
      addRank(byStaff, who, o.total)

      const u = staffUser(o, state.users)
      if (u?.role === 'mozo') {
        addRank(byMozo, u.name, o.total)
      } else if (!u && o.source === 'pos' && /mozo/i.test(who)) {
        addRank(byMozo, who, o.total)
      }

      const hour = limaHour(o.createdAt)
      addRank(byHour, `${String(hour).padStart(2, '0')}:00`, o.total)

      addRank(byWeekday, limaWeekdayShort(o.createdAt), o.total)

      const custKey = o.customerId || o.customerPhone || o.customerName?.trim() || 'anon'
      const custLabel = o.customerName?.trim() || o.customerPhone || 'Cliente anónimo'
      const existing = byCustomer.get(custKey)
      if (existing) {
        existing.total += o.total
        existing.count += 1
        if (custLabel !== 'Cliente anónimo') existing.label = custLabel
      } else {
        byCustomer.set(custKey, { label: custLabel, total: o.total, count: 1 })
      }

      addRank(bySource, o.source === 'web' ? 'App / Web' : 'POS / Local', o.total)

      if (o.driverName) addRank(byDriver, o.driverName, o.total)

      for (const item of o.items) {
        if (!item.productId || item.productId === 'delivery') continue
        if (/^delivery$/i.test(item.name)) continue
        const p = byProduct.get(item.name) || { label: item.name, total: 0, count: 0 }
        p.total += item.price * item.qty
        p.count += item.qty
        byProduct.set(item.name, p)

        const cat = productById.get(item.productId)?.category || 'Sin categoría'
        addRank(byCategory, cat, item.price * item.qty, item.qty)
      }
    }

    const soldHours = [...byHour.keys()].map((k) => Number(k.slice(0, 2))).filter((n) => Number.isFinite(n))
    const fromH = Math.min(11, ...(soldHours.length ? soldHours : [11]))
    const toH = Math.max(23, ...(soldHours.length ? soldHours : [23]))
    const hoursOrdered: RankRow[] = []
    for (let h = fromH; h <= toH; h++) {
      const label = `${String(h).padStart(2, '0')}:00`
      hoursOrdered.push(byHour.get(label) || { label, total: 0, count: 0 })
    }
    const hoursPeak = toRank(byHour, 12)
    const hoursTop3 = hoursPeak.slice(0, 3).reduce((s, h) => s + h.total, 0)
    const hoursValley = hoursOrdered
      .filter((h) => h.count > 0)
      .slice()
      .sort((a, b) => a.total - b.total || a.count - b.count)[0]

    const dayOrder = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    const weekdays = dayOrder.map((d) => byWeekday.get(d) || { label: d, total: 0, count: 0 })

    const ticketAvgByType = ([...ticketByType.entries()] as [OrderType, { total: number; count: number }][]).map(
      ([type, v]) => ({
        label: TYPE_LABEL[type],
        value: v.count ? v.total / v.count : 0,
        meta: `${v.count} tickets`,
      }),
    )

    return {
      byType: [...byType.entries()].map(([k, v]) => ({ label: TYPE_LABEL[k], value: v })),
      byPay: [...byPay.entries()].map(([k, v]) => ({ label: PAY_LABEL[k], value: v })),
      tables: toRank(byTable),
      staff: toRank(byStaff),
      mozos: toRank(byMozo),
      hoursOrdered,
      hoursPeak,
      hoursTop3,
      hoursValley,
      weekdays,
      customers: toRank(byCustomer),
      products: toRank(byProduct),
      sources: toRank(bySource),
      categories: toRank(byCategory),
      drivers: toRank(byDriver),
      ticketAvgByType,
    }
  }, [paid, state.users, productById])

  const periodPretty = `${formatDate(from.toISOString())} — ${formatDate(new Date(until.getTime() - 1000).toISOString())}`
  const periodLabel =
    preset === 1 ? `Hoy · ${formatDate(from.toISOString())}` : `${preset === 'rango' ? 'Rango' : `${preset} días`} · ${periodPretty}`
  const todaySales = paid.filter((o) => isSameDay(o.createdAt)).reduce((s, o) => s + o.total, 0)
  const topMozo = analytics.mozos[0] || analytics.staff.find((s) => !/app|web|sin asignar/i.test(s.label))
  const topHour = analytics.hoursPeak[0]
  const topCustomer = analytics.customers[0]
  const topTable = analytics.tables[0]
  const topProduct = analytics.products[0]

  const exportXlsx = () => {
    downloadReportsXlsx({
      periodLabel,
      settingsName: state.settings.name,
      orders: periodOrders,
      paid,
      users: state.users,
      kpis: {
        'Ventas cobradas': Number(sales.toFixed(2)),
        'Tickets cobrados': paid.length,
        'Ticket promedio': Number(ticketAvg.toFixed(2)),
        'IGV': Number(igv.toFixed(2)),
        'Pendiente de cobro': Number(pending.toFixed(2)),
        'Cancelados (monto)': Number(cancelledTotal.toFixed(2)),
        'Cancelados (cantidad)': cancelled.length,
        'Ítems vendidos': itemsSold,
        'Delivery fees': Number(deliveryFees.toFixed(2)),
        'Hoy cobrado': Number(todaySales.toFixed(2)),
      },
      tables: analytics.tables,
      mozos: analytics.mozos,
      staff: analytics.staff,
      hours: analytics.hoursPeak,
      customers: analytics.customers,
      products: analytics.products,
      weekdays: analytics.weekdays,
      byType: analytics.byType,
      byPay: analytics.byPay,
      sources: analytics.sources,
      categories: analytics.categories,
    })
  }

  const exportCsv = () => {
    const header = 'numero,fecha,tipo,mesa,cliente,atendio,total,pago,estado,origen'
    const rows = periodOrders.map((o) =>
      [
        o.number,
        o.createdAt,
        o.type,
        o.tableNumber ?? '',
        `"${o.customerName}"`,
        `"${staffLabel(o, state.users)}"`,
        o.total,
        o.paymentMethod,
        o.status,
        o.source,
      ].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `reportes-lopez-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const printCierre = () => {
    printReport(
      reportHtml({
        settings: state.settings,
        title: 'Cierre de caja / ventas',
        period: periodLabel,
        sales: soles(sales),
        tickets: String(paid.length),
        igv: soles(igv),
        rows: paid.map((o) => [
          padOrder(o.number),
          formatDateTime(o.createdAt),
          o.customerName,
          TYPE_LABEL[o.type],
          PAY_LABEL[o.paymentMethod],
          soles(o.total),
        ]),
      }),
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle
          title="Reportes"
          hint={
            reportLoading
              ? 'Leyendo los pedidos registrados en la base…'
              : `Pedidos de la base, según su estado · ${periodLabel}`
          }
        />
        <div className="flex flex-wrap gap-2">
          {([1, 7, 30] as const).map((n) => (
            <button
              key={n}
              onClick={() => setPreset(n)}
              className={`min-h-9 rounded-full px-4 py-1.5 text-sm ${preset === n ? 'bg-ink text-cream' : 'bg-white'}`}
            >
              {n === 1 ? 'Hoy' : `${n} días`}
            </button>
          ))}
          <button
            onClick={() => setPreset('rango')}
            className={`min-h-9 rounded-full px-4 py-1.5 text-sm ${preset === 'rango' ? 'bg-ink text-cream' : 'bg-white'}`}
          >
            Rango
          </button>
          {preset === 'rango' ? (
            <>
              <input
                type="date"
                className="min-h-9 rounded-full bg-white px-3 text-sm ring-1 ring-ink/10"
                value={fromYmd}
                onChange={(e) => setFromYmd(e.target.value || todayYmd())}
              />
              <input
                type="date"
                className="min-h-9 rounded-full bg-white px-3 text-sm ring-1 ring-ink/10"
                value={toYmd}
                onChange={(e) => setToYmd(e.target.value || todayYmd())}
              />
            </>
          ) : null}
          <button
            onClick={printCierre}
            disabled={reportLoading}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-cream disabled:opacity-40"
          >
            <Printer size={14} /> Imprimir
          </button>
          <button
            onClick={exportCsv}
            disabled={reportLoading}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-semibold ring-1 ring-ink/10 disabled:opacity-40"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={exportXlsx}
            disabled={reportLoading}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <FileSpreadsheet size={14} /> Exportar XLSX
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${
              tab === t.id ? 'bg-ember text-white' : 'bg-white text-ink/70 ring-1 ring-ink/8'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {reportError ? (
        <p className="rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-medium text-red-700">{reportError}</p>
      ) : null}

      {reportLoading ? <ReportSkeleton /> : null}

      {!reportLoading && tab === 'resumen' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="Ventas cobradas" value={soles(sales)} delta={salesDelta} />
            <Card label="Tickets cobrados" value={String(paid.length)} delta={ticketsDelta} />
            <Card label="Ticket promedio" value={soles(ticketAvg)} delta={avgDelta} />
            <Card label="Pendiente cobro" value={soles(pending)} hint={cancelled.length ? `${cancelled.length} cancelados` : undefined} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Insight title="Mozo top" value={topMozo?.label || '—'} hint={topMozo ? `${soles(topMozo.total)} · ${topMozo.count} pedidos` : 'Sin datos'} />
            <Insight title="Hora pico" value={topHour?.label || '—'} hint={topHour ? `${soles(topHour.total)} · ${topHour.count} tickets` : 'Sin datos'} />
            <Insight title="Cliente top" value={topCustomer?.label || '—'} hint={topCustomer ? `${soles(topCustomer.total)} · ${topCustomer.count} pedidos` : 'Sin datos'} />
            <Insight title="Mesa top" value={topTable?.label || '—'} hint={topTable ? `${soles(topTable.total)} · ${topTable.count} cuentas` : 'Sin salón'} />
            <Insight title="Plato top" value={topProduct?.label || '—'} hint={topProduct ? `${soles(topProduct.total)} · ${topProduct.count} unid.` : 'Sin datos'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <section className="card p-5 lg:col-span-3">
              <h2 className="font-display text-xl">Ventas por día</h2>
              <p className="text-xs text-ink/40">Tickets (barras) y monto (línea) · {periodPretty}</p>
              <ComposedDayChart items={daily} />
            </section>
            <section className="card p-5 lg:col-span-2">
              <h2 className="font-display text-xl">Tipo de servicio</h2>
              <p className="text-xs text-ink/40">Cómo se cobró en el periodo</p>
              <DonutChart items={analytics.byType} />
            </section>
          </div>

          <section className="card p-5">
            <h2 className="font-display text-xl">Curva horaria</h2>
            <p className="text-xs text-ink/40">Hora de Lima · la barra dorada es el pico · {periodPretty}</p>
            <HourMoneyChart items={analytics.hoursOrdered} />
          </section>
        </>
      )}

      {!reportLoading && tab === 'mesas' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-xl">Ventas por mesa</h2>
            <p className="text-xs text-ink/40">Pedidos de salón cobrados</p>
            <HorizontalMoneyChart items={analytics.tables} />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Por día de la semana</h2>
            <VerticalMoneyChart items={analytics.weekdays.map((d) => ({ label: d.label, value: d.total }))} />
          </section>
        </div>
      )}

      {!reportLoading && tab === 'equipo' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-xl">Mozos — ranking</h2>
            <p className="text-xs text-ink/40">Quién tomó más pedidos cobrados</p>
            <HorizontalMoneyChart items={analytics.mozos.length ? analytics.mozos : analytics.staff} />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Quién atendió (todos)</h2>
            <p className="text-xs text-ink/40">Mozos, cajeros, app y sin asignar</p>
            <HorizontalMoneyChart items={analytics.staff} />
          </section>
          {analytics.drivers.length > 0 ? (
            <section className="card p-5 lg:col-span-2">
              <h2 className="font-display text-xl">Conductores</h2>
              <p className="text-xs text-ink/40">Entregas cobradas con conductor asignado</p>
              <HorizontalMoneyChart items={analytics.drivers} height={220} />
            </section>
          ) : null}
        </div>
      )}

      {!reportLoading && tab === 'horas' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Insight
              title="Hora pico"
              value={topHour?.label || '—'}
              hint={topHour ? `${soles(topHour.total)} · ${topHour.count} tickets` : 'Sin datos'}
            />
            <Insight
              title="Hora más baja"
              value={analytics.hoursValley?.label || '—'}
              hint={
                analytics.hoursValley
                  ? `${soles(analytics.hoursValley.total)} · ${analytics.hoursValley.count} tickets`
                  : 'Sin datos'
              }
            />
            <Insight
              title="Las 3 horas top"
              value={sales ? `${Math.round((analytics.hoursTop3 / sales) * 100)}%` : '—'}
              hint={sales ? `${soles(analytics.hoursTop3)} de ${soles(sales)} cobrado` : 'Sin datos'}
            />
          </div>
          <section className="card p-5">
            <h2 className="font-display text-xl">Curva completa</h2>
            <p className="text-xs text-ink/40">De apertura a cierre · hora de Lima · la barra dorada es el pico</p>
            <HourMoneyChart items={analytics.hoursOrdered} height={320} />
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <h2 className="font-display text-xl">Horas que más venden</h2>
              <HorizontalMoneyChart items={analytics.hoursPeak} />
            </section>
            <section className="card p-5">
              <h2 className="font-display text-xl">Por día de la semana</h2>
              <VerticalMoneyChart items={analytics.weekdays.map((d) => ({ label: d.label, value: d.total }))} />
            </section>
          </div>
        </div>
      )}

      {!reportLoading && tab === 'clientes' && (
        <section className="card p-5">
          <h2 className="font-display text-xl">Clientes que más pidieron</h2>
          <p className="text-xs text-ink/40">Por monto cobrado en el periodo</p>
          <HorizontalMoneyChart items={analytics.customers} height={360} />
        </section>
      )}

      {!reportLoading && tab === 'carta' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-xl">Platos más vendidos</h2>
            <HorizontalMoneyChart items={analytics.products} height={360} />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Por categoría</h2>
            <DonutChart items={analytics.categories.map((c) => ({ label: c.label, value: c.total }))} height={280} />
            <HorizontalMoneyChart items={analytics.categories} height={240} />
          </section>
        </div>
      )}

      {!reportLoading && tab === 'canal' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-xl">Origen</h2>
            <DonutChart items={analytics.sources.map((s) => ({ label: s.label, value: s.total }))} />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Tipo de servicio</h2>
            <DonutChart items={analytics.byType} />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Método de pago</h2>
            <DonutChart items={analytics.byPay} />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Ticket promedio por canal</h2>
            <VerticalMoneyChart items={analytics.ticketAvgByType} />
          </section>
        </div>
      )}

      {!reportLoading && tab === 'detalle' && (
        <section className="card overflow-hidden">
          <div className="border-b border-ink/5 px-5 py-4">
            <h2 className="font-display text-xl">Detalle de pedidos</h2>
            <p className="text-xs text-ink/40">
              {periodOrders.length} pedidos en {periodLabel} (incluye cancelados)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-cream-dark/40 text-xs tracking-wide text-ink/45 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">N°</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Atendió</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Pago</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {periodOrders
                  .slice()
                  .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                  .slice(0, 200)
                  .map((o) => (
                    <tr key={o.id} className="border-t border-ink/5">
                      <td className="px-4 py-2.5 font-mono text-xs">{padOrder(o.number)}</td>
                      <td className="px-4 py-2.5 text-ink/60">{formatDateTime(o.createdAt)}</td>
                      <td className="px-4 py-2.5">{TYPE_LABEL[o.type]}</td>
                      <td className="max-w-[140px] truncate px-4 py-2.5">{o.customerName || '—'}</td>
                      <td className="max-w-[120px] truncate px-4 py-2.5">{staffLabel(o, state.users)}</td>
                      <td className="px-4 py-2.5">{STATUS_LABEL[o.status]}</td>
                      <td className="px-4 py-2.5">
                        {o.paid ? PAY_LABEL[o.paymentMethod] : 'Pendiente'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">{soles(o.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Bone({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink/10 dark:bg-white/10 ${className}`} />
}

function ReportSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card p-5">
            <Bone className="h-3 w-24" />
            <Bone className="mt-3 h-8 w-32" />
            <Bone className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="card p-4">
            <Bone className="h-3 w-16" />
            <Bone className="mt-3 h-6 w-28" />
            <Bone className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <Bone className="h-5 w-36" />
          <Bone className="mt-4 h-64 w-full rounded-2xl" />
        </div>
        <div className="card p-5 lg:col-span-2">
          <Bone className="h-5 w-32" />
          <Bone className="mx-auto mt-8 h-44 w-44 rounded-full" />
        </div>
      </div>
      <div className="card p-5">
        <Bone className="h-5 w-32" />
        <Bone className="mt-4 h-40 w-full rounded-2xl" />
      </div>
    </div>
  )
}

function Card({
  label,
  value,
  delta,
  hint,
}: {
  label: string
  value: string
  delta?: number | null
  hint?: string
}) {
  return (
    <div className="card p-5">
      <p className="text-xs tracking-wide text-ink/40 uppercase">{label}</p>
      <p className="mt-2 font-display text-2xl lg:text-3xl">{value}</p>
      {delta != null ? (
        <p className={`mt-1 text-xs font-semibold ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-brick'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% vs periodo anterior
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink/40">{hint}</p>
      ) : null}
    </div>
  )
}

function Insight({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5">
      <p className="text-[10px] font-bold tracking-wider text-ink/35 uppercase">{title}</p>
      <p className="mt-1 truncate font-display text-xl text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink/45">{hint}</p>
    </div>
  )
}
