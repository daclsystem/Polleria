import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import type { OrderItem, OrderType, PaymentMethod } from '../types'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'

const TYPES: { id: OrderType; label: string }[] = [
  { id: 'salon', label: 'Salón' },
  { id: 'llevar', label: 'Llevar' },
  { id: 'delivery', label: 'Delivery' },
]

export function Pos() {
  const { state, createOrder, addItemsToOrder, payOrder } = useStore()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presetTable = params.get('mesa') ?? ''
  const appendOrderId = params.get('agregar') ?? ''

  const appendOrder = appendOrderId ? state.orders.find((o) => o.id === appendOrderId) : null
  const isAppendMode = !!appendOrder

  const categories = useMemo(
    () => ['Todos', ...new Set(state.products.map((p) => p.category))],
    [state.products],
  )
  const [cat, setCat] = useState('Todos')
  const [q, setQ] = useState('')
  const [type, setType] = useState<OrderType>(isAppendMode ? (appendOrder?.type ?? 'salon') : 'salon')
  const [tableId, setTableId] = useState(presetTable)
  const [customerName, setCustomerName] = useState(
    isAppendMode
      ? (appendOrder?.customerName ?? '')
      : presetTable ? `Mesa ${state.tables.find((t) => t.id === presetTable)?.number ?? ''}` : '',
  )
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState(0)
  const [items, setItems] = useState<OrderItem[]>([])
  const [payOpen, setPayOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('efectivo')
  const [cash, setCash] = useState('')

  const products = state.products.filter((p) => {
    if (!p.available) return false
    if (cat !== 'Todos' && p.category !== cat) return false
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  const qty = items.reduce((s, i) => s + i.qty, 0)
  const gross = items.reduce((s, i) => s + i.qty * i.price, 0)
  const total = Math.max(0, gross - discount)
  const cashNum = Number(cash) || 0
  const change = Math.max(0, cashNum - total)
  const canSend = items.length > 0 && (isAppendMode || type !== 'salon' || Boolean(tableId))

  const add = (productId: string) => {
    const p = state.products.find((x) => x.id === productId)
    if (!p) return
    setItems((prev) => {
      const found = prev.find((i) => i.productId === p.id && !i.notes)
      if (found) return prev.map((i) => (i === found ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { productId: p.id, name: p.name, qty: 1, price: p.price }]
    })
  }

  const submit = (paid: boolean, payMethod: PaymentMethod) => {
    if (!canSend) return

    if (isAppendMode && appendOrder) {
      addItemsToOrder(appendOrder.id, items, user?.name ?? 'POS')
      printTicket({ ...appendOrder, items: [...appendOrder.items, ...items] }, state.settings, 'cocina')
      navigate('/comandas')
      return
    }

    const name =
      customerName.trim() ||
      (type === 'salon' ? `Mesa ${state.tables.find((t) => t.id === tableId)?.number}` : 'Cliente')
    const order = createOrder({
      type,
      items,
      customerName: name,
      customerPhone: phone || undefined,
      address: type === 'delivery' ? address : undefined,
      tableId: type === 'salon' ? tableId : undefined,
      discount,
      paymentMethod: paid ? payMethod : 'pendiente',
      paid,
      notes: notes || undefined,
      createdBy: user?.name ?? 'POS',
      source: 'pos',
    })
    if (paid) payOrder(order.id, payMethod)
    printTicket(order, state.settings, 'cocina')
    if (paid) setTimeout(() => printTicket(order, state.settings, 'caja'), 400)
    navigate('/comandas')
  }

  const cartBody = (
    <>
      <ul className="max-h-[40vh] space-y-3 overflow-y-auto xl:max-h-72">
        {items.length === 0 ? <p className="text-sm text-ink/40">Agrega platos de la carta.</p> : null}
        {items.map((item, idx) => (
          <li key={`${item.productId}-${idx}`} className="rounded-xl bg-cream p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{item.name}</p>
                <p className="text-xs text-ink/40">{soles(item.price)}</p>
              </div>
              <button className="tap" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                <Trash2 size={16} className="text-ink/30" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                className="tap rounded-lg bg-white p-1"
                onClick={() =>
                  setItems((p) =>
                    p
                      .map((it, i) => (i === idx ? { ...it, qty: it.qty - 1 } : it))
                      .filter((it) => it.qty > 0),
                  )
                }
              >
                <Minus size={14} />
              </button>
              <span className="w-6 text-center text-sm font-bold">{item.qty}</span>
              <button
                className="tap rounded-lg bg-white p-1"
                onClick={() =>
                  setItems((p) => p.map((it, i) => (i === idx ? { ...it, qty: it.qty + 1 } : it)))
                }
              >
                <Plus size={14} />
              </button>
              <input
                className="min-w-0 flex-1 rounded-lg border border-ink/10 px-2 py-2 text-sm"
                placeholder="Nota (sin mayo)"
                value={item.notes ?? ''}
                onChange={(e) =>
                  setItems((p) => p.map((it, i) => (i === idx ? { ...it, notes: e.target.value } : it)))
                }
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-2 border-t border-ink/10 pt-4 text-sm">
        <div className="flex justify-between text-ink/50">
          <span>Subtotal</span>
          <span>{soles(gross)}</span>
        </div>
        <Field label="Descuento (S/)">
          <input
            type="number"
            min={0}
            className={inputClass}
            value={discount || ''}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="Notas de comanda">
          <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex justify-between pt-2 font-display text-2xl">
          <span>Total</span>
          <span>{soles(total)}</span>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <button
          disabled={!canSend}
          onClick={() => submit(false, 'pendiente')}
          className="min-h-12 rounded-xl bg-ink py-3 font-semibold text-cream disabled:opacity-40"
        >
          {isAppendMode ? 'Agregar e imprimir cocina' : 'Enviar e imprimir cocina'}
        </button>
        {!isAppendMode && (
          <button
            disabled={!canSend}
            onClick={() => setPayOpen(true)}
            className="min-h-12 rounded-xl bg-ember py-3 font-semibold text-white disabled:opacity-40"
          >
            Cobrar, imprimir y enviar
          </button>
        )}
      </div>
    </>
  )

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div>
        <PageTitle
          title={isAppendMode ? `Agregar a ${padOrder(appendOrder!.number)}` : 'Tomar pedido'}
          hint={isAppendMode
            ? `${appendOrder!.customerName} ya tiene ${appendOrder!.items.length} platos. Agrega más y envía a cocina.`
            : '1. Elige salón, llevar o delivery. 2. Toca los platos. 3. Envía a cocina o cobra.'}
        />
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`min-h-10 shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
                type === t.id ? 'bg-ink text-cream' : 'bg-white text-ink/70'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {type === 'salon' ? (
            <select
              className={inputClass}
              value={tableId}
              onChange={(e) => {
                setTableId(e.target.value)
                const t = state.tables.find((x) => x.id === e.target.value)
                if (t) setCustomerName(`Mesa ${t.number}`)
              }}
            >
              <option value="">Selecciona mesa</option>
              {state.tables.map((t) => (
                <option key={t.id} value={t.id} disabled={t.status !== 'libre' && t.id !== presetTable}>
                  Mesa {t.number} · {t.zone} · {t.status}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputClass}
              placeholder="Nombre del cliente"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          )}
          <input
            className={inputClass}
            placeholder="Teléfono"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
          />
          {type === 'delivery' ? (
            <input
              className={`${inputClass} sm:col-span-2`}
              placeholder="Dirección de entrega"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          ) : null}
        </div>
        <div className="mt-4">
          <input
            className={`${inputClass} max-w-full sm:max-w-xs`}
            placeholder="Buscar plato..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`min-h-9 shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                  cat === c ? 'bg-ember text-white' : 'bg-white text-ink/60'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className={`mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 ${qty > 0 ? 'pb-24 xl:pb-0' : ''}`}>
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => add(p.id)}
              className="card p-3 text-left transition active:scale-[0.98] sm:p-4"
            >
              <div
                className="mb-2 flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl text-xl sm:mb-3 sm:h-12 sm:w-12 sm:text-2xl"
                style={{ background: `${p.tone}22` }}
              >
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  p.emoji
                )}
              </div>
              <p className="text-sm font-semibold leading-tight sm:text-base">{p.name}</p>
              <p className="mt-1 line-clamp-2 text-[11px] text-ink/45 sm:text-xs">{p.description}</p>
              <p className="mt-2 font-display text-base text-ember sm:text-lg">{soles(p.price)}</p>
            </button>
          ))}
        </div>
      </div>

      <aside className="card hidden h-fit p-5 xl:sticky xl:top-24 xl:block">{cartBody}</aside>

      {qty > 0 ? (
        <button
          onClick={() => setCartOpen(true)}
          className="safe-bottom fixed inset-x-3 z-20 flex min-h-12 items-center justify-between rounded-2xl bg-ember px-4 py-3 text-white shadow-xl shadow-ember/30 xl:hidden"
          style={{ bottom: '4.6rem' }}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <ShoppingBag size={18} />
            {qty} ítems
          </span>
          <span className="font-display text-lg">{soles(total)}</span>
        </button>
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button className="absolute inset-0 bg-ink/50" onClick={() => setCartOpen(false)} aria-label="Cerrar" />
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-cream p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-2xl">Ticket</h2>
              <button className="tap rounded-full" onClick={() => setCartOpen(false)}>
                <X />
              </button>
            </div>
            {cartBody}
          </div>
        </div>
      ) : null}

      <Modal open={payOpen} title="Cobrar comanda" onClose={() => setPayOpen(false)}>
        <p className="mb-4 font-display text-3xl">{soles(total)}</p>
        <div className="flex gap-2">
          {(['efectivo', 'yape', 'tarjeta'] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`min-h-11 flex-1 rounded-xl py-2 text-sm font-semibold capitalize ${
                method === m ? 'bg-ink text-cream' : 'bg-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {method === 'efectivo' ? (
          <div className="mt-4 space-y-2">
            <Field label="Recibido">
              <input
                className={inputClass}
                value={cash}
                onChange={(e) => setCash(e.target.value)}
                inputMode="decimal"
              />
            </Field>
            <p className="text-sm">
              Vuelto: <strong>{soles(change)}</strong>
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink/50">Confirma el pago {method}. Se imprime ticket y comanda.</p>
        )}
        <button
          className="mt-5 min-h-12 w-full rounded-xl bg-ember py-3 font-semibold text-white"
          onClick={() => submit(true, method)}
        >
          Confirmar, imprimir y enviar
        </button>
      </Modal>
    </div>
  )
}
