import { Clock3, ShoppingBag } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { formatDateTime, padOrder, reconcileOrderMoney, soles } from '../lib/format'
import { staffLabel } from '../lib/staffLabel'
import { Modal, StatusBadge, TypeBadge } from './ui'
import { OrderPeople } from './OrderPeople'

/** Consulta del pedido: no envía, cobra, imprime ni cambia datos. */
export function OrderItemsDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { state } = useStore()
  const order = state.orders.find((entry) => entry.id === orderId)
  const quantity = order?.items.reduce((sum, item) => sum + item.qty, 0) || 0
  const total = order ? reconcileOrderMoney(order, state.settings.igvRate).total : 0

  return (
    <Modal
      open={Boolean(orderId)}
      title={order?.tableNumber ? `Productos de mesa ${order.tableNumber}` : 'Productos del pedido'}
      onClose={onClose}
      wide
    >
      {order ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{padOrder(order.number)}</span>
            <StatusBadge status={order.status} />
            <TypeBadge type={order.type} />
            <span className={`ml-auto rounded-lg px-2 py-1 text-[11px] font-bold ${order.paid ? 'bg-sage/10 text-sage' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
              {order.paid ? 'Pagado' : 'Por cobrar'}
            </span>
          </div>
          <OrderPeople
            customer={order.customerName}
            attendant={staffLabel(order, state.users)}
            attendantLabel={order.source === 'web' ? 'Origen' : 'Mozo'}
          />
          <p className="flex items-center gap-1.5 text-xs text-ink/50">
            <Clock3 size={13} className="shrink-0" /> {formatDateTime(order.createdAt)}
          </p>
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <ShoppingBag size={16} className="text-ember" />
              {quantity} {quantity === 1 ? 'producto pedido' : 'productos pedidos'}
            </h3>
            <ul className="divide-y divide-ink/7 rounded-xl border border-ink/8 px-3 sm:px-4">
              {order.items.map((item, index) => (
                <li key={item.id || `${item.productId}-${index}`} className="flex items-start gap-3 py-4">
                  <span className="flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-ember/8 px-1.5 text-xs font-bold text-ember">
                    {item.qty}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold [overflow-wrap:anywhere]">{item.name}</p>
                    <p className="mt-1 text-xs text-ink/50">{soles(item.price)} por unidad</p>
                    {item.selectedOptions?.length ? (
                      <p className="mt-1 text-xs leading-relaxed text-ink/55">
                        {item.selectedOptions.map((option) => option.name).join(' · ')}
                      </p>
                    ) : null}
                    {item.notes ? <p className="mt-2 rounded-lg bg-amber-500/8 px-2 py-1.5 text-xs leading-relaxed text-ink/70 [overflow-wrap:anywhere]">Nota: {item.notes}</p> : null}
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums">{soles(item.qty * item.price)}</span>
                </li>
              ))}
            </ul>
          </div>
          {order.notes ? <div className="rounded-xl bg-ink/4 p-3"><p className="text-xs font-bold text-ink/55">Notas del pedido</p><p className="mt-1 text-sm [overflow-wrap:anywhere]">{order.notes}</p></div> : null}
          <div className="space-y-2 border-t border-ink/10 pt-4">
            {order.discount > 0 ? <p className="flex justify-between gap-3 text-xs text-ink/55"><span>Descuento aplicado</span><span>−{soles(order.discount)}</span></p> : null}
            <p className="flex items-center justify-between gap-3 text-lg font-extrabold"><span>Total del pedido</span><span className="text-ember tabular-nums">{soles(total)}</span></p>
          </div>
          <button type="button" onClick={onClose} className="min-h-11 w-full rounded-xl border border-ink/10 bg-ink/4 text-sm font-bold">Cerrar detalle</button>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-ink/55">El pedido ya no está disponible en esta vista. Cierra el detalle y actualiza las mesas.</p>
      )}
    </Modal>
  )
}
