import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { formatDateTime, isSameDay, padOrder, soles } from '../lib/format'
import { printReport, reportHtml } from '../lib/print'
import type { OrderType, PaymentMethod } from '../types'
import { PAY_LABEL, TYPE_LABEL } from '../types'
import { PageTitle } from '../components/ui'

export function Reportes() {
  const { state } = useStore()
  const [days, setDays] = useState(7)

  const from = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1))
    d.setHours(0, 0, 0, 0)
    return d
  }, [days])

  const orders = state.orders.filter(
    (o) => o.status !== 'cancelado' && new Date(o.createdAt) >= from,
  )
  const paid = orders.filter((o) => o.paid)
  const sales = paid.reduce((s, o) => s + o.total, 0)
  const igv = paid.reduce((s, o) => s + o.igv, 0)

  const byType = new Map<OrderType, number>()
  const byPay = new Map<PaymentMethod, number>()
  for (const o of paid) {
    byType.set(o.type, (byType.get(o.type) ?? 0) + o.total)
    byPay.set(o.paymentMethod, (byPay.get(o.paymentMethod) ?? 0) + o.total)
  }

  const exportCsv = () => {
    const header = 'numero,fecha,tipo,cliente,total,pago,estado,origen'
    const rows = orders.map((o) =>
      [o.number, o.createdAt, o.type, `"${o.customerName}"`, o.total, o.paymentMethod, o.status, o.source].join(','),
    )
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'chifa-polleria-lopez-ventas.csv'
    a.click()
  }

  const printCierre = () => {
    printReport(
      reportHtml({
        settings: state.settings,
        title: 'Cierre de caja / ventas',
        period: days === 1 ? 'Hoy' : `Últimos ${days} días`,
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

  const todaySales = paid.filter((o) => isSameDay(o.createdAt)).reduce((s, o) => s + o.total, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle title="Reportes" hint="Ventas cobradas en el periodo. Precios incluyen IGV." />
        <div className="flex flex-wrap gap-2">
          {[1, 7, 30].map((n) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`min-h-9 rounded-full px-4 py-1.5 text-sm ${days === n ? 'bg-ink text-cream' : 'bg-white'}`}
            >
              {n === 1 ? 'Hoy' : `${n} días`}
            </button>
          ))}
          <button
            onClick={printCierre}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-cream"
          >
            <Printer size={14} /> Imprimir
          </button>
          <button onClick={exportCsv} className="min-h-9 rounded-full bg-ember px-4 py-1.5 text-sm font-semibold text-white">
            CSV
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card label="Ventas" value={soles(sales)} />
        <Card label="Tickets cobrados" value={String(paid.length)} />
        <Card label="IGV del periodo" value={soles(igv)} />
      </div>
      <p className="text-sm text-ink/50">Hoy van {soles(todaySales)} en caja.</p>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-display text-xl">Por canal</h2>
          <Bars
            items={[...byType.entries()].map(([k, v]) => ({
              label: TYPE_LABEL[k],
              value: v,
            }))}
          />
        </section>
        <section className="card p-5">
          <h2 className="font-display text-xl">Por método de pago</h2>
          <Bars
            items={[...byPay.entries()].map(([k, v]) => ({
              label: PAY_LABEL[k],
              value: v,
            }))}
          />
        </section>
      </div>
    </div>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs tracking-wide text-ink/40 uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  )
}

function Bars({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  if (items.length === 0) return <p className="mt-4 text-sm text-ink/40">Sin datos.</p>
  return (
    <ul className="mt-4 space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span>{i.label}</span>
            <span>{soles(i.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-cream-dark">
            <div className="h-2 rounded-full bg-ember" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
