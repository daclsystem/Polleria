import { ChefHat, Clock3, Flame, ShoppingBag, Table2, UtensilsCrossed, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { elapsedMinutes, formatTime, isSameDay, padOrder, soles } from '../lib/format'
import { PageTitle, StatusBadge, TypeBadge } from '../components/ui'

export function Dashboard() {
  const { state } = useStore()
  const { can, user } = useAuth()
  const today = state.orders.filter((o) => isSameDay(o.createdAt) && o.status !== 'cancelado')
  const sales = today.filter((o) => o.paid).reduce((s, o) => s + o.total, 0)
  const tickets = today.length
  const paidCount = today.filter((o) => o.paid).length
  const pendingPay = state.orders.filter((o) => !o.paid && o.status !== 'cancelado').length
  const avg = paidCount ? sales / paidCount : 0
  const kitchen = state.orders.filter((o) => o.status === 'nuevo' || o.status === 'en_cocina').length
  const isCajero = user?.role === 'cajero'

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    const total = state.orders
      .filter((o) => isSameDay(o.createdAt, d) && o.paid && o.status !== 'cancelado')
      .reduce((s, o) => s + o.total, 0)
    return {
      label: d.toLocaleDateString('es-PE', { weekday: 'short' }),
      total,
    }
  })
  const max = Math.max(...days.map((d) => d.total), 1)

  const productSales = new Map<string, { name: string; qty: number; total: number }>()
  for (const o of today) {
    for (const item of o.items) {
      const prev = productSales.get(item.productId) ?? { name: item.name, qty: 0, total: 0 }
      prev.qty += item.qty
      prev.total += item.qty * item.price
      productSales.set(item.productId, prev)
    }
  }
  const top = [...productSales.values()].sort((a, b) => b.qty - a.qty).slice(0, 5)
  const lowStock = state.inventory.filter((i) => i.stock <= i.minStock)
  const recent = [...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
  const late = state.orders.filter(
    (o) => (o.status === 'nuevo' || o.status === 'en_cocina') && elapsedMinutes(o.createdAt) >= 15,
  ).length

  return (
    <div className="space-y-6 sm:space-y-8">
      <PageTitle kicker="Hoy en el local" title="¿Qué quieres hacer?" hint={state.settings.slogan} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {can('pos') ? (
          <Action to="/pos" title="Tomar pedido" hint="Salón, llevar o delivery" icon={UtensilsCrossed} accent />
        ) : null}
        {can('comandas') ? (
          <Action
            to="/comandas"
            title={isCajero ? 'Por cobrar' : 'Ver pedidos'}
            hint={
              isCajero
                ? pendingPay === 1
                  ? '1 pedido pendiente de pago'
                  : `${pendingPay} pedidos pendientes de pago`
                : 'Cobrar e imprimir'
            }
            icon={ShoppingBag}
            accent={isCajero}
          />
        ) : null}
        {can('cocina') ? (
          <Action to="/cocina" title="Ir a cocina" hint={`${kitchen} en preparación`} icon={ChefHat} />
        ) : null}
        {can('mesas') ? (
          <Action to="/mesas" title="Ver mesas" hint="Salón y terraza" icon={Table2} />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {isCajero ? (
          <Stat
            icon={ShoppingBag}
            label="Por cobrar"
            value={String(pendingPay)}
            hint={pendingPay === 1 ? 'pedido pendiente de pago' : 'pedidos pendientes de pago'}
          />
        ) : (
          <Stat icon={ShoppingBag} label="Comandas" value={String(tickets)} hint="Salón, llevar y web" />
        )}
        <Stat icon={Wallet} label="Ventas" value={soles(sales)} hint={`${paidCount} cobrados`} />
        <Stat icon={Flame} label="Promedio" value={soles(avg || 0)} hint="Ticket cobrado" />
        <Stat icon={Clock3} label="En cocina" value={String(kitchen)} hint={late ? `${late} con demora` : 'Al día'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4 sm:p-5 lg:col-span-2">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="font-display text-xl">Ventas 7 días</h2>
            <Link to="/reportes" className="text-sm font-medium text-ember">
              Reportes
            </Link>
          </div>
          <div className="flex h-40 items-end gap-2 sm:h-48 sm:gap-3">
            {days.map((d) => (
              <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full max-w-14 rounded-t-lg bg-linear-to-t from-ember-hot to-gold"
                  style={{ height: `${Math.max(10, (d.total / max) * 100)}%` }}
                  title={soles(d.total)}
                />
                <span className="text-[10px] uppercase text-ink/40 sm:text-[11px]">{d.label}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-4 sm:p-5">
          <h2 className="font-display text-xl">Más pedidos</h2>
          <ul className="mt-4 space-y-3">
            {top.length === 0 ? <p className="text-sm text-ink/40">Aún no hay ventas.</p> : null}
            {top.map((p, i) => (
              <li key={p.name} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cream-dark text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="truncate text-sm">{p.name}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold">{p.qty}×</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4 sm:p-5 lg:col-span-2">
          <h2 className="font-display text-xl">Últimas comandas</h2>
          <div className="mt-3 space-y-2 md:hidden">
            {recent.map((o) => (
              <div key={o.id} className="rounded-2xl bg-cream px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{padOrder(o.number)}</p>
                  <span className="text-sm font-medium">{soles(o.total)}</span>
                </div>
                <p className="truncate text-sm text-ink/55">{o.customerName}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TypeBadge type={o.type} />
                  <StatusBadge status={o.status} />
                  <span className="text-xs text-ink/40">{formatTime(o.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-wide text-ink/40 uppercase">
                <tr>
                  <th className="pb-2">Nº</th>
                  <th className="pb-2">Cliente</th>
                  <th className="pb-2">Tipo</th>
                  <th className="pb-2">Estado</th>
                  <th className="pb-2">Hora</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-t border-ink/5">
                    <td className="py-2.5 font-semibold">{padOrder(o.number)}</td>
                    <td>{o.customerName}</td>
                    <td>
                      <TypeBadge type={o.type} />
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="text-ink/50">{formatTime(o.createdAt)}</td>
                    <td className="text-right font-medium">{soles(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded-3xl bg-ink p-5 text-cream shadow-sm">
          <h2 className="font-display text-xl text-gold">Stock bajo</h2>
          <ul className="mt-4 space-y-3">
            {lowStock.length === 0 ? (
              <p className="text-sm text-cream/50">Todo abastecido.</p>
            ) : (
              lowStock.map((i) => (
                <li key={i.id} className="flex justify-between text-sm">
                  <span>{i.name}</span>
                  <span className="text-ember">
                    {i.stock} {i.unit}
                  </span>
                </li>
              ))
            )}
          </ul>
          <Link
            to="/inventario"
            className="mt-6 inline-flex min-h-10 items-center rounded-full bg-gold px-4 py-2 text-sm font-semibold text-ink"
          >
            Ir a inventario
          </Link>
        </section>
      </div>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="card p-3 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-wide text-ink/40 uppercase sm:text-xs">{label}</p>
        <Icon size={16} className="text-ember" />
      </div>
      <p className="mt-2 font-display text-xl leading-none sm:mt-3 sm:text-3xl">{value}</p>
      <p className="mt-1 text-[11px] text-ink/45 sm:text-xs">{hint}</p>
    </div>
  )
}

function Action({
  to,
  title,
  hint,
  icon: Icon,
  accent,
}: {
  to: string
  title: string
  hint: string
  icon: typeof Wallet
  accent?: boolean
}) {
  return (
    <Link
      to={to}
      className={`card-press flex min-h-[5.5rem] flex-col justify-between rounded-[1.35rem] p-4 ${
        accent
          ? 'bg-ember text-white shadow-lg shadow-ember/25'
          : 'card'
      }`}
    >
      <Icon size={20} className={accent ? 'text-white' : 'text-ember'} />
      <div>
        <p className={`font-display text-base leading-tight sm:text-lg ${accent ? 'text-white' : ''}`}>
          {title}
        </p>
        <p className={`mt-0.5 text-[11px] ${accent ? 'text-white/80' : 'text-ink/45'}`}>{hint}</p>
      </div>
    </Link>
  )
}
