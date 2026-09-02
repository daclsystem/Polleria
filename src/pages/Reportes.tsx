import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Printer } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { formatDateTime, isSameDay, padOrder, soles } from '../lib/format'
import { printReport, reportHtml } from '../lib/print'
import { downloadReportsXlsx, staffLabel } from '../lib/exportReports'
import type { Order, OrderType, PaymentMethod, User } from '../types'
import { PAY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../types'
import { PageTitle } from '../components/ui'

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

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
  return new Date(`${ymd}T05:00:00.000Z`)
}
function limaEnd(ymd: string) {
  const d = limaStart(ymd)
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}
function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
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

  const periodOrders = useMemo(
    () =>
      state.orders.filter((o) => {
        const t = new Date(o.createdAt).getTime()
        return t >= from.getTime() && t < until.getTime()
      }),
    [state.orders, from, until],
  )
  const orders = periodOrders.filter((o) => o.status !== 'cancelado')
  const cancelled = periodOrders.filter((o) => o.status === 'cancelado')
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

      const hour = new Date(o.createdAt).getHours()
      addRank(byHour, `${String(hour).padStart(2, '0')}:00`, o.total)

      const wd = WEEKDAYS[new Date(o.createdAt).getDay()]
      addRank(byWeekday, wd, o.total)

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

    const hoursOrdered = [...byHour.values()].sort((a, b) => a.label.localeCompare(b.label))
    const hoursPeak = toRank(byHour, 12)

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
      weekdays,
      customers: toRank(byCustomer),
      products: toRank(byProduct),
      sources: toRank(bySource),
      categories: toRank(byCategory),
      drivers: toRank(byDriver),
      ticketAvgByType,
    }
  }, [paid, state.users, productById])

  const periodLabel =
    preset === 'rango' ? `${fromYmd} — ${toYmd}` : preset === 1 ? 'Hoy' : `Últimos ${preset} días`
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
          hint="Solo administrador · elige Hoy, 7, 30 días o un rango. Cada pestaña usa las mismas fechas."
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
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-cream"
          >
            <Printer size={14} /> Imprimir
          </button>
          <button
            onClick={exportCsv}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-semibold ring-1 ring-ink/10"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={exportXlsx}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-white"
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

      {tab === 'resumen' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
            <Card label="Ventas cobradas" value={soles(sales)} />
            <Card label="Tickets cobrados" value={String(paid.length)} />
            <Card label="Ticket promedio" value={soles(ticketAvg)} />
            <Card label="IGV" value={soles(igv)} />
            <Card label="Pendiente cobro" value={soles(pending)} />
            <Card label="Cancelados" value={`${cancelled.length} · ${soles(cancelledTotal)}`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Insight title="Mozo top" value={topMozo?.label || '—'} hint={topMozo ? `${soles(topMozo.total)} · ${topMozo.count} pedidos` : 'Sin datos'} />
            <Insight title="Hora pico" value={topHour?.label || '—'} hint={topHour ? `${soles(topHour.total)} · ${topHour.count} tickets` : 'Sin datos'} />
            <Insight title="Cliente top" value={topCustomer?.label || '—'} hint={topCustomer ? `${soles(topCustomer.total)} · ${topCustomer.count} pedidos` : 'Sin datos'} />
            <Insight title="Mesa top" value={topTable?.label || '—'} hint={topTable ? `${soles(topTable.total)} · ${topTable.count} cuentas` : 'Sin salón'} />
            <Insight title="Plato top" value={topProduct?.label || '—'} hint={topProduct ? `${soles(topProduct.total)} · ${topProduct.count} unid.` : 'Sin datos'} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Card label="Ítems vendidos" value={String(itemsSold)} />
            <Card label="Costo delivery cobrado" value={soles(deliveryFees)} />
            <Card label="Hoy en caja (cobrado)" value={soles(todaySales)} />
          </div>

          {analytics.hoursOrdered.length > 0 ? (
            <section className="card p-5">
              <h2 className="font-display text-xl">Curva horaria</h2>
              <p className="mb-3 text-xs text-ink/40">Ventas cobradas por hora · {periodLabel}</p>
              <HourStrip items={analytics.hoursOrdered} />
            </section>
          ) : null}
        </>
      )}

      {tab === 'mesas' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-xl">Ventas por mesa</h2>
            <p className="text-xs text-ink/40">Pedidos de salón cobrados</p>
            <RankList items={analytics.tables} countLabel="cuentas" />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Por día de la semana</h2>
            <Bars
              items={analytics.weekdays.map((d) => ({
                label: d.label,
                value: d.total,
                meta: d.count ? `${d.count} tickets` : undefined,
              }))}
            />
          </section>
        </div>
      )}

      {tab === 'equipo' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-xl">Mozos — ranking</h2>
            <p className="text-xs text-ink/40">Quién tomó más pedidos cobrados</p>
            <RankList items={analytics.mozos.length ? analytics.mozos : analytics.staff} countLabel="pedidos" />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Quién atendió (todos)</h2>
            <p className="text-xs text-ink/40">Mozos, cajeros, app y sin asignar</p>
            <RankList items={analytics.staff} countLabel="pedidos" />
          </section>
          {analytics.drivers.length > 0 ? (
            <section className="card p-5 lg:col-span-2">
              <h2 className="font-display text-xl">Conductores</h2>
              <p className="text-xs text-ink/40">Entregas cobradas con conductor asignado</p>
              <RankList items={analytics.drivers} countLabel="entregas" />
            </section>
          ) : null}
        </div>
      )}

      {tab === 'horas' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-xl">Horas que más venden</h2>
            <RankList items={analytics.hoursPeak} countLabel="tickets" />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Curva completa</h2>
            <HourStrip items={analytics.hoursOrdered} />
          </section>
        </div>
      )}

      {tab === 'clientes' && (
        <section className="card p-5">
          <h2 className="font-display text-xl">Clientes que más pidieron</h2>
          <p className="text-xs text-ink/40">Por monto cobrado en el periodo</p>
          <RankList items={analytics.customers} countLabel="pedidos" />
        </section>
      )}

      {tab === 'carta' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-xl">Platos más vendidos</h2>
            <RankList items={analytics.products} countLabel="unid." />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Por categoría</h2>
            <RankList items={analytics.categories} countLabel="unid." />
          </section>
        </div>
      )}

      {tab === 'canal' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-xl">Origen</h2>
            <Bars items={analytics.sources.map((s) => ({ label: s.label, value: s.total, meta: `${s.count} tickets` }))} />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Tipo de servicio</h2>
            <Bars items={analytics.byType} />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Método de pago</h2>
            <Bars items={analytics.byPay} />
          </section>
          <section className="card p-5">
            <h2 className="font-display text-xl">Ticket promedio por canal</h2>
            <Bars items={analytics.ticketAvgByType} />
          </section>
        </div>
      )}

      {tab === 'detalle' && (
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

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs tracking-wide text-ink/40 uppercase">{label}</p>
      <p className="mt-2 font-display text-2xl lg:text-3xl">{value}</p>
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

function RankList({ items, countLabel }: { items: RankRow[]; countLabel: string }) {
  const max = Math.max(...items.map((i) => i.total), 1)
  if (items.length === 0) return <p className="mt-4 text-sm text-ink/40">Sin datos en este periodo.</p>
  return (
    <ul className="mt-4 space-y-3">
      {items.map((i, idx) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="mr-1.5 font-mono text-[10px] text-ink/35">{idx + 1}.</span>
              {i.label}
            </span>
            <span className="shrink-0 font-semibold">{soles(i.total)}</span>
          </div>
          <div className="h-2 rounded-full bg-cream-dark">
            <div className="h-2 rounded-full bg-ember" style={{ width: `${(i.total / max) * 100}%` }} />
          </div>
          <p className="mt-0.5 text-[11px] text-ink/40">
            {i.count} {countLabel}
          </p>
        </li>
      ))}
    </ul>
  )
}

function Bars({ items }: { items: { label: string; value: number; meta?: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  if (items.length === 0) return <p className="mt-4 text-sm text-ink/40">Sin datos.</p>
  return (
    <ul className="mt-4 space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{i.label}</span>
            <span>
              {soles(i.value)}
              {i.meta ? <span className="ml-1 text-[11px] text-ink/40">· {i.meta}</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-cream-dark">
            <div className="h-2 rounded-full bg-ember" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function HourStrip({ items }: { items: RankRow[] }) {
  const max = Math.max(...items.map((i) => i.total), 1)
  if (items.length === 0) return <p className="mt-4 text-sm text-ink/40">Sin datos.</p>
  return (
    <div className="flex h-36 items-end gap-1 overflow-x-auto pb-1">
      {items.map((i) => (
        <div key={i.label} className="flex w-8 shrink-0 flex-col items-center gap-1" title={`${i.label}: ${soles(i.total)}`}>
          <div
            className="w-full rounded-t-md bg-ember/90"
            style={{ height: `${Math.max(4, (i.total / max) * 100)}%` }}
          />
          <span className="text-[9px] text-ink/40">{i.label.slice(0, 2)}</span>
        </div>
      ))}
    </div>
  )
}
