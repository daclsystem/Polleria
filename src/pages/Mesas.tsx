import { Plus, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/StoreContext'
import { useAuth } from '../auth/AuthContext'
import { padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import { orderBelongsToStaff } from '../lib/realtime'
import type { TableStatus } from '../types'
import { PageTitle } from '../components/ui'

const STYLE: Record<TableStatus, string> = {
  libre: 'bg-white border-ink/10 text-ink',
  ocupada: 'bg-ember text-white border-ember',
  cuenta: 'bg-gold text-ink border-gold',
}

export function Mesas() {
  const { state, updateOrderStatus } = useStore()
  const { user } = useAuth()
  const navigate = useNavigate()
  const zones = [...new Set(state.tables.map((t) => t.zone))]
  const isMozo = user?.role === 'mozo'

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          title="Salón y mesas"
          hint={
            isMozo
              ? 'Solo gestionas tus mesas. Las de otro mozo se ven ocupadas sin detalle.'
              : 'Toca una mesa libre para abrir comanda. Toca ocupada para agregar más.'
          }
        />
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white px-3 py-1">Libre</span>
          <span className="rounded-full bg-ember px-3 py-1 text-white">Ocupada</span>
          <span className="rounded-full bg-gold px-3 py-1">Cuenta</span>
        </div>
      </div>
      {zones.map((zone) => (
        <section key={zone} className="mb-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.2em] text-ink/40 uppercase">{zone}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {state.tables
              .filter((t) => t.zone === zone)
              .map((t) => {
                const order = state.orders.find((o) => o.id === t.orderId)
                const mine = !order || !isMozo || !user ? true : orderBelongsToStaff(order, user)
                const locked = Boolean(order && isMozo && !mine)

                return (
                  <div
                    key={t.id}
                    className={`rounded-3xl border p-4 text-left shadow-sm sm:p-5 ${
                      locked ? 'bg-ink/15 border-ink/20 text-ink/50' : STYLE[t.status]
                    }`}
                  >
                    <button
                      className="w-full text-left"
                      disabled={locked}
                      onClick={() => {
                        if (locked) return
                        if (t.status === 'libre') navigate(`/pos?mesa=${t.id}`)
                        if (t.status === 'ocupada' && order) navigate(`/pos?mesa=${t.id}&agregar=${order.id}`)
                      }}
                    >
                      <p className="font-display text-3xl sm:text-4xl">{t.number}</p>
                      <p className="mt-1 text-xs opacity-70">{t.seats} asientos</p>
                    </button>
                    {locked ? (
                      <p className="mt-3 text-xs font-semibold">Ocupada por otro mozo</p>
                    ) : order ? (
                      <div className="mt-3 text-sm">
                        <p className="font-semibold">{padOrder(order.number)}</p>
                        <p className="opacity-80">{soles(order.total)} · {order.items.length} platos</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            onClick={() => navigate(`/pos?mesa=${t.id}&agregar=${order.id}`)}
                            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-black/15 px-3 py-1 text-xs font-semibold"
                          >
                            <Plus size={12} /> Agregar
                          </button>
                          <button
                            onClick={() => printTicket(order, state.settings, 'cuenta')}
                            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-black/15 px-3 py-1 text-xs font-semibold"
                          >
                            <Printer size={12} /> Cuenta
                          </button>
                          {t.status === 'cuenta' ? (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'entregado')}
                              className="rounded-full bg-ink px-3 py-1 text-xs text-cream"
                            >
                              Liberar
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs opacity-60">Libre</p>
                    )}
                  </div>
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}
