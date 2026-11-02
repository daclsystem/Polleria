import { ArrowDownLeft, ArrowRight, CalendarDays, ChefHat, Check, ChevronRight, ClipboardList, Clock3, Package, Plus, ShoppingBag, Table2, TrendingUp, UtensilsCrossed, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { elapsedMinutes, formatTime, isSameDay, padOrder, soles } from '../lib/format'
import { apiReportOrders } from '../lib/apiClient'
import { limaRecentRange, paidSalesByDay } from '../lib/salesDays'
import { isVoidOrder, type Order } from '../types'
import { StatusBadge, TypeBadge } from '../components/ui'

const SalesChart = lazy(() => import('../components/ReportCharts').then((m) => ({ default: m.ComposedDayChart })))

export function Dashboard() {
  const { state } = useStore()
  const { can, actingRole, user } = useAuth()
  const [reportOrders, setReportOrders] = useState<Order[] | null>(null)
  const [reportFailed, setReportFailed] = useState(false)

  // El histórico se consulta una vez por minuto. Los cambios en vivo se combinan abajo.
  useEffect(() => {
    let cancelled = false
    let pending = false
    let lastLoad = 0
    const load = async () => {
      if (pending || document.visibilityState === 'hidden' || Date.now() - lastLoad < 60000) return
      pending = true
      lastLoad = Date.now()
      const range = limaRecentRange(7)
      try {
        const rows = await apiReportOrders(range.from.toISOString(), range.until.toISOString())
        if (!cancelled) {
          setReportOrders(rows)
          setReportFailed(false)
        }
      } catch {
        if (!cancelled) setReportFailed(true)
      } finally {
        pending = false
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 60000)
    const onVisible = () => void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const summary = useMemo(() => {
    const merged = new Map((reportOrders || []).map((order) => [order.id, order]))
    for (const order of state.orders) merged.set(order.id, order)
    const all = [...merged.values()]
    const today = all.filter((o) => isSameDay(o.createdAt) && !isVoidOrder(o.status))
    const paid = today.filter((o) => o.paid)
    const sales = paid.reduce((sum, order) => sum + order.total, 0)
    const kitchen = state.orders.filter((o) => o.status === 'nuevo' || o.status === 'en_cocina')
    const productSales = new Map<string, { name: string; qty: number }>()
    for (const order of paid) {
      for (const item of order.items) {
        const previous = productSales.get(item.productId) || { name: item.name, qty: 0 }
        productSales.set(item.productId, { name: item.name, qty: previous.qty + item.qty })
      }
    }
    const range = limaRecentRange(7)
    return {
      sales,
      tickets: today.length,
      paidCount: paid.length,
      avg: paid.length ? sales / paid.length : 0,
      pendingPay: state.orders.filter((o) => !o.paid && !isVoidOrder(o.status)).length,
      kitchen: kitchen.length,
      late: kitchen.filter((o) => elapsedMinutes(o.createdAt) >= 15).length,
      top: [...productSales.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
      recent: [...state.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
      weekDays: paidSalesByDay(all, range.from, range.until),
    }
  }, [state.orders, reportOrders])
  const lowStock = useMemo(() => state.inventory.filter((i) => i.stock <= i.minStock), [state.inventory])
  const freeTables = state.tables.filter((table) => table.status === 'libre').length
  const hour = Number(new Intl.DateTimeFormat('es-PE', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Lima' }).format(new Date()))
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const isCajero = actingRole === 'cajero'
  const weekTotal = summary.weekDays.reduce((sum, day) => sum + day.total, 0)

  return (
    <div className="dashboard space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-bold tracking-[0.18em] text-ember uppercase">Tu negocio al día</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-[1.9rem]">{greeting}, {user?.name?.split(' ')[0] || 'equipo'} <span className="text-gold">✦</span></h1>
          <p className="mt-1.5 text-sm text-ink/50">Así va el servicio de hoy. Todo lo que necesitas, a la mano.</p>
        </div>
        {can('pos') ? (
          <Link to="/pos" className="btn-primary gap-2 px-5 text-sm"><Plus size={18} /> Nuevo pedido</Link>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <h2 className="text-sm font-bold">Resumen de hoy</h2>
        <span className="inline-flex items-center gap-2 rounded-lg border border-ink/8 bg-surface px-3 py-2 text-xs font-medium text-ink/55"><CalendarDays size={14} /> Hoy, {new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'America/Lima' })}</span>
      </div>
      <div className="!mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat icon={Wallet} label="Ventas del día" value={soles(summary.sales)} hint={`${summary.paidCount} pedidos cobrados`} tone="green" />
        <Stat icon={ShoppingBag} label={isCajero ? 'Por cobrar' : 'Pedidos de hoy'} value={String(isCajero ? summary.pendingPay : summary.tickets)} hint={isCajero ? 'Pendientes de pago' : 'Salón, llevar y delivery'} tone="blue" />
        <Stat icon={TrendingUp} label="Ticket promedio" value={soles(summary.avg)} hint="Por pedido cobrado" tone="purple" />
        <Stat icon={ChefHat} label="En cocina" value={String(summary.kitchen)} hint={summary.late ? `${summary.late} llevan más de 15 min` : 'Preparación al día'} tone="amber" attention={summary.late > 0} />
      </div>

      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="mb-3 text-sm font-bold">A trabajar</h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {can('mesas') ? <Action to="/mesas" title="Mesas" hint={`${freeTables} de ${state.tables.length} disponibles`} icon={Table2} /> : null}
          {can('pedidos-web') ? <Action to="/pedidos-web" title="Pedidos en curso" hint="Consulta y sigue cada pedido" icon={ClipboardList} /> : null}
          {can('comandas') ? <Action to="/comandas" title="Ir a caja" hint={`${summary.pendingPay} pendientes de pago`} icon={Wallet} /> : null}
          {can('cocina') ? <Action to="/cocina" title="Cocina" hint={`${summary.kitchen} pedidos en preparación`} icon={UtensilsCrossed} /> : null}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <section className="card min-w-0 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Ventas de la semana</h2>
              <p className="mt-1 text-xs text-ink/45">Pedidos cobrados · últimos 7 días</p>
            </div>
            {can('reportes') ? <Link to="/reportes" className="dashboard-text-link">Ver reporte <ArrowRight size={14} /></Link> : null}
          </div>
          <p className="mt-5 text-3xl font-extrabold tracking-tight tabular-nums">{soles(weekTotal)}</p>
          <div className="mt-4 min-h-60" aria-label="Gráfico de ventas de los últimos siete días">
            <Suspense fallback={<div className="h-60 animate-pulse rounded-xl bg-ink/5" aria-label="Cargando gráfico" />}>
              <SalesChart items={summary.weekDays} height={240} />
            </Suspense>
          </div>
          {reportFailed ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">{reportOrders ? 'No se pudo actualizar el histórico; se conserva la última consulta.' : 'Mostrando los pedidos cargados. El histórico no está disponible por ahora.'}</p> : null}
        </section>
        <section className="card p-5 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Los favoritos de hoy</h2>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/15 text-amber-700 dark:text-gold"><TrendingUp size={16} /></span>
          </div>
          <p className="mt-1 text-xs text-ink/45">Los platos más vendidos del día</p>
          {summary.top.length === 0 ? (
            <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-center"><UtensilsCrossed size={28} className="text-ink/20" /><p className="text-sm text-ink/45">Los favoritos aparecerán<br />con las primeras ventas.</p></div>
          ) : (
            <ol className="mt-6 space-y-5">
              {summary.top.map((product, index) => (
                <li key={product.name} className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${index === 0 ? 'bg-gold/20 text-amber-800 dark:text-gold' : 'bg-ink/4 text-ink/40'}`}>{String(index + 1).padStart(2, '0')}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between gap-2"><span className="truncate text-xs font-semibold sm:text-sm">{product.name}</span><span className="shrink-0 text-xs font-bold tabular-nums">{product.qty} <span className="font-normal text-ink/40">ud.</span></span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink/5"><div className={`h-full rounded-full ${index === 0 ? 'bg-gold' : 'bg-ember/35'}`} style={{ width: `${product.qty / summary.top[0].qty * 100}%` }} /></div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <div className={`grid gap-5 ${can('inventario') ? 'xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]' : ''}`}>
        <section className="card min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 p-5 sm:p-6">
            <div><h2 className="text-base font-bold">Últimos pedidos</h2><p className="mt-1 text-xs text-ink/45">Lo más reciente del servicio</p></div>
            {can('pedidos-web') ? <Link to="/pedidos-web" className="dashboard-text-link">Ver pedidos <ArrowRight size={14} /></Link> : null}
          </div>
          {summary.recent.length === 0 ? <div className="px-5 pb-10 pt-4 text-center text-sm text-ink/45">Aún no hay pedidos. Todo listo para el primero.</div> : (
            <>
              <div className="divide-y divide-ink/5 px-5 md:hidden">
                {summary.recent.map((order) => (
                  <div key={order.id} className="py-4">
                    <div className="flex items-center justify-between gap-3"><span className="text-sm font-bold">{padOrder(order.number)} <span className="ml-2 font-normal text-ink/55">{order.customerName}</span></span><span className="text-sm font-bold tabular-nums">{soles(order.total)}</span></div>
                    <div className="mt-2 flex flex-wrap items-center gap-2"><TypeBadge type={order.type} /><StatusBadge status={order.status} /><span className="ml-auto text-[11px] text-ink/40">{formatTime(order.createdAt)}</span></div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="dashboard-table w-full text-left text-xs">
                  <thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col">Total</th></tr></thead>
                  <tbody>{summary.recent.map((order) => <tr key={order.id}><td><span className="font-bold">{padOrder(order.number)}</span><span className="mt-1 block text-[10px] text-ink/40">{formatTime(order.createdAt)}</span></td><td className="max-w-36 truncate">{order.customerName}</td><td><TypeBadge type={order.type} /></td><td><StatusBadge status={order.status} /></td><td className="whitespace-nowrap font-bold tabular-nums">{soles(order.total)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          )}
        </section>
        {can('inventario') ? (
          <section className="card flex flex-col p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><h2 className="text-base font-bold">Atención al inventario</h2><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${lowStock.length ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-sage/10 text-sage'}`}><Package size={16} /></span></div>
            <p className="mt-1 text-xs text-ink/45">{lowStock.length ? `${lowStock.length} insumos necesitan reposición` : 'Todo abastecido para el servicio'}</p>
            {lowStock.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-sage"><Check size={28} /><p className="text-sm">El stock está al día</p></div> : (
              <ul className="my-4 divide-y divide-ink/5">{lowStock.slice(0, 5).map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-xs"><span className="truncate font-medium">{item.name}</span><span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-1 font-semibold text-amber-800 dark:text-amber-300">{item.stock} {item.unit}</span></li>)}</ul>
            )}
            <Link to="/inventario" className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ink/10 text-xs font-bold text-ember transition-colors hover:bg-ember/5">Revisar inventario <ArrowRight size={14} /></Link>
          </section>
        ) : null}
      </div>
      <p className="flex items-center justify-center gap-1.5 pb-2 text-[10px] text-ink/35"><span className="h-1.5 w-1.5 rounded-full bg-ember/40" /> Chifa & Pollería Lopez · Hecho para un buen servicio</p>
    </div>
  )
}

function Stat({ icon: Icon, label, value, hint, tone, attention }: { icon: typeof Wallet; label: string; value: string; hint: string; tone: string; attention?: boolean }) {
  return (
    <div className="card min-w-0 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-medium text-ink/55 sm:text-xs">{label}</p><span className={`stat-icon stat-icon-${tone}`}><Icon size={17} /></span></div>
      <p className="mt-4 whitespace-nowrap text-[clamp(1rem,4.6vw,1.4rem)] font-extrabold leading-none tracking-tight tabular-nums sm:text-[1.75rem]">{value}</p>
      <p className={`mt-3 flex items-center gap-1 text-[10px] sm:text-[11px] ${attention ? 'text-amber-700 dark:text-amber-300' : 'text-ink/45'}`}>{attention ? <Clock3 size={12} /> : <ArrowDownLeft size={12} className="text-ink/30" />}{hint}</p>
    </div>
  )
}

function Action({ to, title, hint, icon: Icon }: { to: string; title: string; hint: string; icon: typeof Wallet }) {
  return (
    <Link to={to} className="dashboard-action card group flex items-center gap-3 p-3.5 sm:p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ember/6 text-ember"><Icon size={19} /></span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-bold sm:text-[13px]">{title}</span><span className="mt-1 block text-[10px] leading-relaxed text-ink/45 sm:text-[11px]">{hint}</span></span>
      <ChevronRight size={15} className="hidden shrink-0 text-ink/25 transition-transform group-hover:translate-x-0.5 sm:block" />
    </Link>
  )
}
