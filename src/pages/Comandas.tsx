import { useEffect, useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { formatDateTime, padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import { apiAssignDriver, apiListDrivers } from '../lib/apiClient'
import type { Driver, Order, OrderStatus, PaymentMethod } from '../types'
import { Empty, Modal, PageTitle, StatusBadge, TypeBadge, inputClass } from '../components/ui'

const FILTERS: { id: 'todas' | OrderStatus; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'nuevo', label: 'Nuevas' },
  { id: 'en_cocina', label: 'Cocina' },
  { id: 'listo', label: 'Listas' },
  { id: 'entregado', label: 'Entregadas' },
  { id: 'cancelado', label: 'Canceladas' },
]

export function Comandas() {
  const { state, updateOrderStatus, payOrder, cancelOrder, reloadFromApi } = useStore()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('todas')
  const [selected, setSelected] = useState<Order | null>(null)
  const [pay, setPay] = useState<PaymentMethod>('efectivo')
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    void apiListDrivers()
      .then((r) => setDrivers((r.drivers || []).filter((d) => d.active)))
      .catch(() => setDrivers([]))
  }, [])

  const list = useMemo(() => {
    return state.orders
      .filter((o) => (filter === 'todas' ? true : o.status === filter))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [state.orders, filter])

  const current = selected ? (state.orders.find((o) => o.id === selected.id) ?? selected) : null

  return (
    <div>
      <PageTitle title="Ver pedidos" hint="Toca uno para cobrar, cambiar estado o imprimir ticket." />
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-9 shrink-0 rounded-full px-4 py-1.5 text-sm ${
              filter === f.id ? 'bg-ink text-cream' : 'bg-white text-ink/60'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="mt-8">
          <Empty title="No hay comandas en este filtro" hint="Crea una desde Nueva comanda o la carta web." />
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-3 md:hidden">
            {list.map((o) => (
              <button
                key={o.id}
                onClick={() => setSelected(o)}
                className="card card-press w-full p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-xl tracking-tight">{padOrder(o.number)}</p>
                    <p className="text-sm font-medium text-ink/55">{o.customerName}</p>
                  </div>
                  <p className="font-extrabold text-ember">{soles(o.total)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={o.status} />
                  <TypeBadge type={o.type} />
                  <span className="text-xs text-ink/35">{formatDateTime(o.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 hidden overflow-hidden rounded-[1.35rem] bg-white shadow-sm ring-1 ring-ink/[0.04] md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-xs tracking-wide text-ink/40 uppercase">
                <tr>
                  <th className="px-4 py-3">Nº</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3">Hora</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {list.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o)}
                    className="cursor-pointer border-t border-ink/5 hover:bg-cream/80"
                  >
                    <td className="px-4 py-3 font-semibold">{padOrder(o.number)}</td>
                    <td className="px-4 py-3">
                      <p>{o.customerName}</p>
                      <p className="text-xs text-ink/40">{o.createdBy}</p>
                    </td>
                    <td className="px-4 py-3">
                      <TypeBadge type={o.type} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-4 py-3 capitalize">{o.paid ? o.paymentMethod : 'Pendiente'}</td>
                    <td className="px-4 py-3 text-ink/50">{formatDateTime(o.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-medium">{soles(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal
        open={!!current}
        title={current ? `Comanda ${padOrder(current.number)}` : ''}
        onClose={() => setSelected(null)}
        wide
      >
        {current ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={current.status} />
              <TypeBadge type={current.type} />
            </div>
            <p className="text-sm text-ink/60">
              {current.customerName}
              {current.customerPhone ? ` · ${current.customerPhone}` : ''}
              {current.address ? ` · ${current.address}` : ''}
            </p>
            <ul className="divide-y divide-ink/5 rounded-xl bg-white">
              {current.items.map((i, idx) => (
                <li key={idx} className="flex justify-between px-3 py-2 text-sm">
                  <span>
                    {i.qty}× {i.name}
                    {i.notes ? <span className="block text-xs text-ember">{i.notes}</span> : null}
                  </span>
                  <span>{soles(i.qty * i.price)}</span>
                </li>
              ))}
            </ul>
            <div className="text-sm text-ink/50">
              <p>Subtotal (sin IGV): {soles(current.subtotal)}</p>
              <p>IGV: {soles(current.igv)}</p>
              <p className="font-display text-xl text-ink">Total {soles(current.total)}</p>
            </div>
            {current.notes ? <p className="text-sm">Nota: {current.notes}</p> : null}

            {(current.type === 'delivery' || current.type === 'web') &&
            current.address &&
            current.status !== 'cancelado' &&
            current.status !== 'entregado' ? (
              <div className="rounded-xl bg-teal-50 p-3">
                <p className="mb-2 text-xs font-semibold tracking-wide text-teal-800 uppercase">
                  Conductor (delivery tipo PedidosYa)
                </p>
                <select
                  className={inputClass}
                  disabled={assigning}
                  value={current.driverId || ''}
                  onChange={async (e) => {
                    const driverId = e.target.value || null
                    setAssigning(true)
                    try {
                      await apiAssignDriver(current.id, driverId)
                      setSelected({ ...current, driverId: driverId || undefined })
                      await reloadFromApi()
                    } catch (err) {
                      alert((err as Error).message)
                    } finally {
                      setAssigning(false)
                    }
                  }}
                >
                  <option value="">Sin asignar — el conductor puede tomarlo</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} · {d.phone}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-teal-800/70">
                  App conductor: /conductor — toma pedidos listos y abre la ruta en Maps.
                </p>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold"
                onClick={() => printTicket(current, state.settings, 'caja')}
              >
                <Printer size={16} /> Ticket caja
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold"
                onClick={() => printTicket(current, state.settings, 'cocina')}
              >
                <Printer size={16} /> Comanda cocina
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold"
                onClick={() => printTicket(current, state.settings, 'cuenta')}
              >
                <Printer size={16} /> Pre-cuenta
              </button>
            </div>

            {current.status !== 'cancelado' && current.status !== 'entregado' ? (
              <div className="flex flex-wrap gap-2">
                {current.status === 'nuevo' ? (
                  <button
                    className="min-h-11 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      updateOrderStatus(current.id, 'en_cocina')
                      setSelected(null)
                    }}
                  >
                    Pasar a cocina
                  </button>
                ) : null}
                {current.status === 'en_cocina' ? (
                  <button
                    className="min-h-11 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                    onClick={() => {
                      updateOrderStatus(current.id, 'listo')
                      setSelected(null)
                    }}
                  >
                    Marcar listo
                  </button>
                ) : null}
                {current.status === 'listo' ? (
                  <button
                    className="min-h-11 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream"
                    onClick={() => {
                      updateOrderStatus(current.id, 'entregado')
                      setSelected(null)
                    }}
                  >
                    Entregar
                  </button>
                ) : null}
                <button
                  className="min-h-11 rounded-xl bg-brick px-4 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    cancelOrder(current.id)
                    setSelected(null)
                  }}
                >
                  Cancelar
                </button>
              </div>
            ) : null}
            {!current.paid && current.status !== 'cancelado' ? (
              <div className="rounded-xl bg-white p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-ink/40">Cobrar</p>
                <div className="flex flex-wrap gap-2">
                  {(['efectivo', 'yape', 'tarjeta'] as PaymentMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setPay(m)}
                      className={`min-h-10 rounded-lg px-3 py-1 text-sm capitalize ${pay === m ? 'bg-ink text-cream' : 'bg-cream'}`}
                    >
                      {m}
                    </button>
                  ))}
                  <button
                    className="min-h-10 rounded-lg bg-ember px-3 py-1 text-sm font-semibold text-white sm:ml-auto"
                    onClick={() => {
                      payOrder(current.id, pay)
                      printTicket({ ...current, paid: true, paymentMethod: pay }, state.settings, 'caja')
                      setSelected(null)
                    }}
                  >
                    Confirmar e imprimir
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
