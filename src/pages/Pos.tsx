import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, Minus, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import { apiUpsertCustomer } from '../lib/apiClient'
import { filterKitchenItems } from '../lib/kitchen'
import { orderBelongsToStaff } from '../lib/realtime'
import type { OrderItem, OrderType, PaymentMethod } from '../types'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'

const TYPES: { id: OrderType; label: string }[] = [
  { id: 'salon', label: 'Salón / mesa' },
  { id: 'llevar', label: 'Recojo (llamada/WSP)' },
  { id: 'delivery', label: 'Delivery (llamada/WSP)' },
]

export function Pos() {
  const { state, createOrder, addItemsToOrder, payOrder } = useStore()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presetTable = params.get('mesa') ?? ''
  const appendOrderId = params.get('agregar') ?? ''

  const appendOrder = appendOrderId ? state.orders.find((o) => o.id === appendOrderId) : null
  const appendForbidden =
    Boolean(appendOrder) && user?.role === 'mozo' && !orderBelongsToStaff(appendOrder!, user)
  const isAppendMode = !!appendOrder && !appendForbidden

  const categories = useMemo(
    () => ['Todos', ...new Set(state.products.map((p) => p.category))],
    [state.products],
  )
  const [cat, setCat] = useState('Todos')
  const [q, setQ] = useState('')
  const [type, setType] = useState<OrderType>(isAppendMode ? (appendOrder?.type ?? 'salon') : 'salon')
  const [tableId, setTableId] = useState(presetTable)
  const [tableOpen, setTableOpen] = useState(false)
  const [customerName, setCustomerName] = useState(
    isAppendMode ? (appendOrder?.customerName ?? '') : '',
  )
  const [phone, setPhone] = useState(isAppendMode ? (appendOrder?.customerPhone ?? '') : '')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [discount, setDiscount] = useState(0)
  const [items, setItems] = useState<OrderItem[]>([])
  const [payOpen, setPayOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('efectivo')
  const [cash, setCash] = useState('')

  if (appendForbidden) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <PageTitle title="Mesa de otro mozo" hint="Solo puedes agregar a tus propias comandas." />
        <button
          className="mt-6 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-cream"
          onClick={() => navigate('/mesas')}
        >
          Volver a mesas
        </button>
      </div>
    )
  }

  const selectedTable = state.tables.find((t) => t.id === tableId)

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

  const phoneDigits = phone.replace(/\D/g, '')
  const nameOk = customerName.trim().length >= 2
  const phoneOk = phoneDigits.length >= 9
  const customerOk = isAppendMode || (nameOk && phoneOk)
  const canSubmit = canSend && customerOk

  const add = (productId: string) => {
    const p = state.products.find((x) => x.id === productId)
    if (!p) return
    setItems((prev) => {
      const found = prev.find((i) => i.productId === p.id && !i.notes)
      if (found) return prev.map((i) => (i === found ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { productId: p.id, name: p.name, qty: 1, price: p.price }]
    })
  }

  const submit = async (paid: boolean, payMethod: PaymentMethod) => {
    if (!canSubmit) return

    if (isAppendMode && appendOrder) {
      const kitchenNew = filterKitchenItems(items, state.products)
      addItemsToOrder(appendOrder.id, items, user?.name ?? 'POS')
      // Comanda adicional: cocina lo ve en Recibidos (nuevo), no en fuego
      if (kitchenNew.length > 0) {
        printTicket(
          {
            ...appendOrder,
            items: kitchenNew,
            notes: `ADICIONAL · Mesa ${appendOrder.tableNumber ?? ''} · solo lo nuevo`,
            status: 'nuevo',
          },
          state.settings,
          'cocina',
        )
      }
      navigate('/comandas')
      return
    }

    const name = customerName.trim()
    if (!nameOk || !phoneOk) {
      alert('Nombre y teléfono del cliente son obligatorios')
      return
    }

    try {
      const { customer } = await apiUpsertCustomer({
        name,
        phone,
        address: type === 'delivery' ? address || undefined : undefined,
      })
      const order = await createOrder({
        type,
        items,
        customerName: name,
        customerPhone: customer.phone || phone,
        customerId: customer.id,
        address: type === 'delivery' ? address : undefined,
        tableId: type === 'salon' ? tableId : undefined,
        discount,
        paymentMethod: paid ? payMethod : 'pendiente',
        paid,
        notes: notes || undefined,
        createdBy: user?.name ?? 'POS',
        createdByUserId: user?.id,
        source: 'pos',
      })
      if (paid) payOrder(order.id, payMethod)
      const kitchenItems = filterKitchenItems(order.items, state.products)
      if (kitchenItems.length > 0) {
        printTicket({ ...order, items: kitchenItems }, state.settings, 'cocina')
      }
      if (paid) setTimeout(() => printTicket(order, state.settings, 'caja'), 400)
      navigate('/comandas')
    } catch (e) {
      alert((e as Error).message || 'No se pudo crear el pedido')
    }
  }

  const cartBody = (
    <>
      <ul className="max-h-[40vh] space-y-2.5 overflow-y-auto xl:max-h-72">
        {items.length === 0 ? <p className="text-sm text-ink/40">Agrega platos de la carta.</p> : null}
        {items.map((item, idx) => (
          <li key={`${item.productId}-${idx}`} className="rounded-2xl bg-cream px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold">{item.name}</p>
                <p className="text-xs font-semibold text-ember">{soles(item.price)}</p>
              </div>
              <button className="tap" onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}>
                <Trash2 size={16} className="text-ink/25" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                className="tap rounded-xl bg-white p-1.5 shadow-sm"
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
              <span className="w-6 text-center text-sm font-black">{item.qty}</span>
              <button
                className="tap rounded-xl bg-white p-1.5 shadow-sm"
                onClick={() =>
                  setItems((p) => p.map((it, i) => (i === idx ? { ...it, qty: it.qty + 1 } : it)))
                }
              >
                <Plus size={14} />
              </button>
              <input
                className="min-w-0 flex-1 rounded-xl border border-ink/[0.08] bg-white px-2.5 py-2 text-sm"
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
      <div className="mt-4 space-y-2 border-t border-ink/[0.06] pt-4 text-sm">
        <div className="flex justify-between text-ink/45">
          <span>Subtotal</span>
          <span className="font-semibold text-ink">{soles(gross)}</span>
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
        <div className="flex justify-between pt-2 font-display text-2xl tracking-tight">
          <span>Total</span>
          <span className="text-ember">{soles(total)}</span>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        <button
          disabled={!canSubmit}
          onClick={() => submit(false, 'pendiente')}
          className="min-h-12 rounded-2xl bg-ink py-3 font-bold text-cream disabled:opacity-40"
        >
          {isAppendMode
            ? 'Agregar (comanda solo lo nuevo de cocina)'
            : 'Enviar e imprimir cocina'}
        </button>
        {!isAppendMode && (
          <button
            disabled={!canSubmit}
            onClick={() => setPayOpen(true)}
            className="btn-primary disabled:opacity-40"
          >
            Cobrar, imprimir y enviar
          </button>
        )}
        {isAppendMode ? (
          <p className="text-center text-[11px] text-ink/40">
            Cocina solo recibe platos nuevos (ej. chaufa). Bebidas no van a comanda.
          </p>
        ) : null}
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
            : '1. Nombre y teléfono. 2. Salón, llevar o delivery. 3. Toca los platos. 4. Envía o cobra.'}
        />

        <div className="seg mt-5">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => setType(t.id)}
              className={`seg-btn ${type === t.id ? 'seg-btn-on' : ''}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className={inputClass}
            placeholder="Nombre del cliente *"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
            disabled={isAppendMode}
          />
          <input
            className={inputClass}
            placeholder="Teléfono *"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            required
            disabled={isAppendMode}
          />
          {type === 'salon' ? (
            <button
              type="button"
              disabled={isAppendMode}
              onClick={() => setTableOpen(true)}
              className={`${inputClass} sm:col-span-2 flex items-center justify-between text-left ${
                !tableId ? 'text-ink/35' : 'font-semibold text-ink'
              }`}
            >
              <span>
                {selectedTable
                  ? `Mesa ${selectedTable.number} · ${selectedTable.zone} · ${selectedTable.status}`
                  : 'Selecciona mesa'}
              </span>
              <ChevronDown size={18} className="text-ink/35" />
            </button>
          ) : null}
          {type === 'delivery' ? (
            <input
              className={`${inputClass} sm:col-span-2`}
              placeholder="Dirección de entrega"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          ) : null}
          {!isAppendMode && (!nameOk || !phoneOk) ? (
            <p className="sm:col-span-2 text-xs font-medium text-brick">
              Nombre (mín. 2 letras) y teléfono (9 dígitos) son obligatorios.
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          <input
            className={`${inputClass} max-w-full sm:max-w-sm`}
            placeholder="Buscar plato…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`chip shrink-0 ${cat === c ? 'chip-on' : 'chip-off'}`}
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
              className="card card-press p-3.5 text-left sm:p-4"
            >
              <div
                className="mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl text-2xl"
                style={{ background: `${p.tone}18` }}
              >
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  p.emoji
                )}
              </div>
              <p className="text-sm font-bold leading-snug tracking-tight sm:text-[15px]">{p.name}</p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-ink/40 sm:text-xs">{p.description}</p>
              <p className="mt-2.5 text-base font-extrabold text-ember sm:text-lg">{soles(p.price)}</p>
            </button>
          ))}
        </div>
      </div>

      <aside className="card hidden h-fit p-5 xl:sticky xl:top-24 xl:block">
        <p className="mb-3 font-display text-xl tracking-tight">Ticket</p>
        {cartBody}
      </aside>

      {qty > 0 ? (
        <button
          onClick={() => setCartOpen(true)}
          className="safe-bottom fixed inset-x-3 z-20 flex min-h-[3.25rem] items-center justify-between rounded-2xl bg-ember px-4 py-3.5 text-white shadow-xl shadow-ember/35 xl:hidden"
          style={{ bottom: '4.75rem' }}
        >
          <span className="inline-flex items-center gap-2 font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm">
              {qty}
            </span>
            Ver ticket
          </span>
          <span className="font-display text-lg tracking-tight">{soles(total)}</span>
        </button>
      ) : null}

      {cartOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setCartOpen(false)} aria-label="Cerrar" />
          <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[1.75rem] bg-white p-5 shadow-2xl">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/10" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-2xl tracking-tight">Ticket</h2>
              <button className="tap flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.04]" onClick={() => setCartOpen(false)}>
                <X size={18} />
              </button>
            </div>
            {cartBody}
          </div>
        </div>
      ) : null}

      {tableOpen ? (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => setTableOpen(false)} aria-label="Cerrar" />
          <div className="absolute inset-x-0 bottom-0 max-h-[78dvh] overflow-hidden rounded-t-[1.75rem] bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[22rem] sm:rounded-[1.75rem]">
            <div className="border-b border-ink/[0.06] px-5 py-4">
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/10 sm:hidden" />
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl tracking-tight">Elegir mesa</h2>
                <button className="tap flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.04]" onClick={() => setTableOpen(false)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <ul className="max-h-[60dvh] overflow-y-auto p-2">
              {state.tables.map((t) => {
                const disabled = t.status !== 'libre' && t.id !== presetTable
                const active = t.id === tableId
                return (
                  <li key={t.id}>
                    <button
                      disabled={disabled}
                      onClick={() => {
                        setTableId(t.id)
                        setTableOpen(false)
                      }}
                      className={`flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left transition ${
                        active ? 'bg-ember text-white' : disabled ? 'opacity-35' : 'hover:bg-cream'
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-bold">Mesa {t.number}</span>
                        <span className={`block text-xs ${active ? 'text-white/75' : 'text-ink/40'}`}>
                          {t.zone} · {t.status}
                        </span>
                      </span>
                      {active ? <Check size={18} /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}

      <Modal open={payOpen} title="Cobrar comanda" onClose={() => setPayOpen(false)}>
        <p className="mb-4 font-display text-3xl tracking-tight text-ember">{soles(total)}</p>
        <div className="seg w-full">
          {(['efectivo', 'yape', 'tarjeta'] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`seg-btn flex-1 capitalize ${method === m ? 'seg-btn-on' : ''}`}
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
          <p className="mt-4 text-sm text-ink/45">Confirma el pago {method}. Se imprime ticket y comanda.</p>
        )}
        <button className="btn-primary mt-5 w-full" onClick={() => submit(true, method)}>
          Confirmar, imprimir y enviar
        </button>
      </Modal>
    </div>
  )
}
