import { ChevronRight, Plus, Printer, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/StoreContext'
import { useAuth } from '../auth/AuthContext'
import { padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import { staffLabel } from '../lib/staffLabel'
import { orderBelongsToStaff } from '../lib/realtime'
import type { Order, Table, TableStatus } from '../types'
import { tablesForStaff } from '../lib/staffBranch'
import { PageTitle } from '../components/ui'
import { NuevoPedidoButton } from '../components/NuevoPedido'

const CARD: Record<TableStatus, string> = {
  libre:
    'border-[#1a3d1a]/15 bg-gradient-to-br from-white to-[#f4f7f2] text-ink shadow-[0_8px_24px_-16px_rgba(26,61,26,0.45)] dark:from-surface dark:to-surface',
  ocupada: 'border-ember/40 bg-ember text-white shadow-[0_10px_28px_-14px_rgba(180,40,20,0.55)]',
  cuenta: 'border-gold bg-gold text-[#1a3d1a] shadow-[0_10px_28px_-14px_rgba(200,160,0,0.55)]',
}

export function Mesas() {
  const { state, updateOrderStatus } = useStore()
  const { user, actingRole } = useAuth()
  const navigate = useNavigate()
  const tables = tablesForStaff(state.tables, user, actingRole)
  const zones = [...new Set(tables.map((t) => t.zone))]
  const isMozo = actingRole === 'mozo'

  const openTable = (t: Table, order?: Order) => {
    if (t.status === 'libre') navigate(`/pos?mesa=${t.id}`)
    else if (order) navigate(`/pos?mesa=${t.id}&agregar=${order.id}`)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          title="Mesas"
          hint={
            isMozo
              ? 'Toca la mesa completa para pedir. Nuevo pedido también sirve para llevar o delivery.'
              : 'Toca la mesa completa para abrir comanda. Si está ocupada, agregas más.'
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <NuevoPedidoButton />
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 ring-1 ring-ink/10">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Libre
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ember px-3 py-1 text-white">
              <span className="h-2 w-2 rounded-full bg-white" />
              Ocupada
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1 text-[#1a3d1a]">
              <span className="h-2 w-2 rounded-full bg-[#1a3d1a]" />
              Cuenta
            </span>
          </div>
        </div>
      </div>
      {zones.map((zone) => (
        <section key={zone} className="mb-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.2em] text-ink/40 uppercase">{zone}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {tables
              .filter((t) => t.zone === zone)
              .map((t) => {
                const order = state.orders.find((o) => o.id === t.orderId)
                const mine = !order || !isMozo || !user ? true : orderBelongsToStaff(order, user)
                const locked = Boolean(order && isMozo && !mine)

                return (
                  <article
                    key={t.id}
                    className={`relative overflow-hidden rounded-[1.35rem] border text-left transition ${
                      locked ? 'border-ink/15 bg-ink/[0.07] text-ink/45' : CARD[t.status]
                    } ${locked ? '' : 'active:scale-[0.98]'}`}
                  >
                    <button
                      type="button"
                      disabled={locked}
                      aria-label={
                        locked
                          ? `Mesa ${t.number} de otro mozo`
                          : t.status === 'libre'
                            ? `Mesa ${t.number} libre, tomar pedido`
                            : `Mesa ${t.number}, agregar a la comanda`
                      }
                      onClick={() => {
                        if (!locked) openTable(t, order)
                      }}
                      className="absolute inset-0 z-0 h-full w-full cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="pointer-events-none relative z-10 flex min-h-[9.25rem] flex-col p-4 sm:min-h-[10rem] sm:p-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-4xl leading-none tracking-tight sm:text-5xl">{t.number}</p>
                        {!locked ? (
                          <span
                            className={`mt-1 flex h-8 w-8 items-center justify-center rounded-full ${
                              t.status === 'libre'
                                ? 'bg-[#1a3d1a]/8 text-[#1a3d1a]'
                                : t.status === 'cuenta'
                                  ? 'bg-[#1a3d1a]/10'
                                  : 'bg-white/20'
                            }`}
                          >
                            <ChevronRight size={18} strokeWidth={2.4} />
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold opacity-70">
                        <Users size={12} />
                        {t.seats} asientos
                      </p>
                      <div className="mt-auto pt-3">
                        {locked ? (
                          <p className="text-xs font-bold">Ocupada por otro mozo</p>
                        ) : order ? (
                          <div className="text-sm">
                            <p className="font-black">{padOrder(order.number)}</p>
                            <p className="text-xs font-semibold opacity-85">
                              {soles(order.total)} · {order.items.length} platos
                            </p>
                            <p className="mt-0.5 text-[11px] font-semibold opacity-80">
                              {staffLabel(order, state.users)}
                            </p>
                          </div>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${
                              t.status === 'libre'
                                ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                                : ''
                            }`}
                          >
                            Libre · pedir
                          </span>
                        )}
                      </div>
                    </div>
                    {!locked && order ? (
                      <div className="relative z-20 flex flex-wrap gap-1.5 px-3 pb-3">
                        <button
                          type="button"
                          onClick={() => openTable(t, order)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-black/15 px-3 text-xs font-bold"
                        >
                          <Plus size={12} /> Agregar
                        </button>
                        <button
                          type="button"
                          onClick={() => printTicket(order, state.settings, 'cuenta', state.users)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-black/15 px-3 text-xs font-bold"
                        >
                          <Printer size={12} /> Cuenta
                        </button>
                        {t.status === 'cuenta' ? (
                          <button
                            type="button"
                            onClick={() => updateOrderStatus(order.id, 'entregado')}
                            className="inline-flex min-h-9 items-center rounded-full bg-ink px-3 text-xs font-bold text-cream"
                          >
                            Liberar
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}
