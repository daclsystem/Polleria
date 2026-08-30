import { useState } from 'react'
import { Check, Copy, ExternalLink, Printer } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { copyText, formatDateTime, padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import { filterKitchenItems } from '../lib/kitchen'
import { customerMenuUrl } from '../lib/paths'
import { PageTitle, StatusBadge } from '../components/ui'

export function PedidosWeb() {
  const { state, updateOrderStatus } = useStore()
  const [copied, setCopied] = useState(false)
  const link = customerMenuUrl()
  const web = state.orders.filter((o) => o.source === 'web').sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div>
      <PageTitle
        title="Pedidos del cliente"
        hint="Venta externa (app/web). Cocina solo recibe productos marcados como preparación."
      />
      <div className="mt-5 flex flex-col gap-2 rounded-3xl bg-ink p-4 text-cream sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate text-sm text-gold">{link}</code>
        <div className="flex gap-2">
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm sm:flex-none"
            onClick={async () => {
              await copyText(link)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <a
            href={customerMenuUrl()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ember px-3 py-2 text-sm font-semibold"
          >
            <ExternalLink size={16} />
            Abrir
          </a>
        </div>
      </div>
      <div className="mt-6 space-y-3">
        {web.length === 0 ? <p className="text-sm text-ink/40">Aún no llegan pedidos web.</p> : null}
        {web.map((o) => (
          <article key={o.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-xl">
                  {padOrder(o.number)} · {o.customerName}
                </p>
                <p className="text-sm text-ink/50">
                  {o.customerPhone} {o.address ? `· ${o.address}` : ''}
                </p>
                <p className="text-xs text-ink/40">{formatDateTime(o.createdAt)}</p>
              </div>
              <div className="text-right">
                <StatusBadge status={o.status} />
                <p className="mt-2 font-semibold">{soles(o.total)}</p>
              </div>
            </div>
            <ul className="mt-3 text-sm text-ink/70">
              {o.items.map((i, idx) => {
                const kitchen = filterKitchenItems([i], state.products).length > 0
                return (
                  <li key={idx} className="flex flex-wrap items-center gap-2">
                    <span>
                      {i.qty}× {i.name}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        kitchen ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {kitchen ? 'cocina' : 'barra'}
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {o.status === 'nuevo' ? (
                <button
                  className="min-h-10 rounded-xl bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white"
                  onClick={() => {
                    const kitchen = filterKitchenItems(o.items, state.products)
                    if (kitchen.length > 0) {
                      updateOrderStatus(o.id, 'en_cocina')
                      printTicket(
                        {
                          ...o,
                          items: kitchen,
                          notes: `WEB / APP · ${o.notes || ''}`.trim(),
                        },
                        state.settings,
                        'cocina',
                      )
                    } else {
                      // Solo barra (bebidas, etc.): listo para entregar / empaquetar
                      updateOrderStatus(o.id, 'listo')
                    }
                  }}
                >
                  Aceptar e imprimir cocina
                </button>
              ) : null}
              <button
                className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-cream px-3 py-1.5 text-sm font-semibold"
                onClick={() => printTicket(o, state.settings, 'caja')}
              >
                <Printer size={14} /> Ticket
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
