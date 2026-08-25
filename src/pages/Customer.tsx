import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, MapPin, Minus, Plus, Printer, ShoppingBag, Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import type { OrderItem } from '../types'
import { Field, inputClass } from '../components/ui'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { platformLabel } from '../lib/platform'

export function CustomerApp() {
  const { orderId } = useParams()
  if (orderId) return <Track orderId={orderId} />
  return <CustomerMenu />
}

function CustomerMenu() {
  const { state, createOrder } = useStore()
  const navigate = useNavigate()
  const [cat, setCat] = useState('Todos')
  const [items, setItems] = useState<OrderItem[]>([])
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'llevar' | 'delivery'>('llevar')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('937493214')
  const [address, setAddress] = useState('')
  const [addressLat, setAddressLat] = useState<number | null>(null)
  const [addressLng, setAddressLng] = useState<number | null>(null)
  const [locBusy, setLocBusy] = useState(false)
  const [note, setNote] = useState('')
  const [pay, setPay] = useState<'yape' | 'efectivo'>('yape')
  const { requestOnce, reverseGeocode, error: locError } = useDeviceLocation({ auto: false })

  const categories = ['Todos', ...new Set(state.products.filter((p) => p.available).map((p) => p.category))]
  const products = state.products.filter((p) => p.available && (cat === 'Todos' || p.category === cat))
  const qty = items.reduce((s, i) => s + i.qty, 0)
  const sub = items.reduce((s, i) => s + i.qty * i.price, 0)
  const fee = mode === 'delivery' ? state.settings.deliveryFee : 0
  const total = sub + fee

  const add = (id: string) => {
    const p = state.products.find((x) => x.id === id)
    if (!p) return
    setItems((prev) => {
      const f = prev.find((i) => i.productId === id)
      if (f) return prev.map((i) => (i.productId === id ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { productId: p.id, name: p.name, qty: 1, price: p.price }]
    })
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || items.length === 0) return
    const orderItems =
      mode === 'delivery' && fee > 0
        ? [...items, { productId: 'delivery', name: 'Delivery', qty: 1, price: fee }]
        : items
    try {
      const order = await createOrder({
        type: mode === 'delivery' ? 'delivery' : 'llevar',
        items: orderItems,
        customerName: name.trim(),
        customerPhone: phone,
        address: mode === 'delivery' ? address : undefined,
        addressLat: mode === 'delivery' && addressLat != null ? addressLat : undefined,
        addressLng: mode === 'delivery' && addressLng != null ? addressLng : undefined,
        discount: 0,
        paymentMethod: pay,
        paid: pay === 'yape',
        notes: note || undefined,
        createdBy: 'Web',
        source: 'web',
        deliveryFee: mode === 'delivery' ? fee : 0,
      })
      const tel = phone.replace(/\D/g, '').slice(-9)
      navigate(`/web/seguimiento/${order.id}${tel ? `?tel=${tel}` : ''}`)
    } catch (err) {
      alert((err as Error).message || 'No se pudo crear el pedido')
    }
  }

  return (
    <div className="min-h-dvh bg-cream paper-grain">
      <header className="flame-bg px-4 pb-12 pt-7 text-cream sm:px-8 sm:pt-10">
        <div className="mx-auto max-w-5xl">
          <p className="text-[11px] tracking-[0.3em] text-gold uppercase">Carta en línea</p>
          <h1 className="mt-2 font-display text-4xl leading-none sm:text-5xl">{state.settings.name}</h1>
          <p className="mt-2 text-cream/70">{state.settings.slogan}</p>
          <p className="mt-4 max-w-xl text-sm text-cream/50">
            {state.settings.address} · {state.settings.hours} · {state.settings.phone}
          </p>
        </div>
      </header>
      <div className="-mt-6 rounded-t-3xl bg-cream px-4 pb-28 pt-5 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex gap-2 overflow-x-auto pb-3">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={`min-h-9 shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${
                  cat === c ? 'bg-ink text-cream' : 'bg-white text-ink/60'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <article key={p.id} className="card flex gap-3 p-3">
                <div
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl"
                  style={{ background: `${p.tone}22` }}
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="h-full w-full rounded-2xl object-cover" />
                  ) : (
                    p.emoji
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{p.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink/45">{p.description}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-display text-ember">{soles(p.price)}</span>
                    <button
                      onClick={() => add(p.id)}
                      className="min-h-9 rounded-full bg-ember px-3 py-1 text-xs font-bold text-white"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {qty > 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="safe-bottom fixed bottom-4 left-1/2 z-30 flex min-h-12 w-[min(92vw,28rem)] -translate-x-1/2 items-center justify-between rounded-2xl bg-ember px-5 py-3 text-white shadow-xl shadow-ember/40"
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <ShoppingBag size={18} />
            {qty} ítems
          </span>
          <span className="font-display text-lg">{soles(sub)}</span>
        </button>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
          <button className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-label="Cerrar" />
          <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cream p-5 sm:rounded-3xl">
            <h2 className="font-display text-2xl">Tu pedido</h2>
            <ul className="mt-4 space-y-2">
              {items.map((i) => (
                <li key={i.productId} className="flex items-center gap-2 rounded-xl bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{i.name}</p>
                    <p className="text-xs text-ink/40">{soles(i.price)}</p>
                  </div>
                  <button
                    className="tap"
                    onClick={() =>
                      setItems((p) =>
                        p
                          .map((x) => (x.productId === i.productId ? { ...x, qty: x.qty - 1 } : x))
                          .filter((x) => x.qty > 0),
                      )
                    }
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-5 text-center text-sm font-bold">{i.qty}</span>
                  <button
                    className="tap"
                    onClick={() =>
                      setItems((p) => p.map((x) => (x.productId === i.productId ? { ...x, qty: x.qty + 1 } : x)))
                    }
                  >
                    <Plus size={14} />
                  </button>
                  <button className="tap" onClick={() => setItems((p) => p.filter((x) => x.productId !== i.productId))}>
                    <Trash2 size={14} className="text-ink/30" />
                  </button>
                </li>
              ))}
            </ul>
            <form onSubmit={send} className="mt-5 space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('llevar')}
                  className={`min-h-11 flex-1 rounded-xl py-2 text-sm font-semibold ${mode === 'llevar' ? 'bg-ink text-cream' : 'bg-white'}`}
                >
                  Recojo
                </button>
                <button
                  type="button"
                  onClick={() => setMode('delivery')}
                  className={`min-h-11 flex-1 rounded-xl py-2 text-sm font-semibold ${mode === 'delivery' ? 'bg-ink text-cream' : 'bg-white'}`}
                >
                  Delivery (+{soles(state.settings.deliveryFee)})
                </button>
              </div>
              <Field label="Tu nombre">
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Celular">
                <input
                  className={inputClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  inputMode="tel"
                />
              </Field>
              {mode === 'delivery' ? (
                <Field label={`Dirección · ${platformLabel()}`}>
                  <input
                    className={inputClass}
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value)
                      setAddressLat(null)
                      setAddressLng(null)
                    }}
                    required
                  />
                  <button
                    type="button"
                    disabled={locBusy}
                    className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-semibold text-cream disabled:opacity-60"
                    onClick={() => {
                      setLocBusy(true)
                      void requestOnce(false)
                        .then(async (c) => {
                          setAddressLat(c.lat)
                          setAddressLng(c.lng)
                          const addr = await reverseGeocode(c.lat, c.lng)
                          setAddress(addr || `GPS ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`)
                        })
                        .finally(() => setLocBusy(false))
                    }}
                  >
                    <MapPin size={14} />
                    {locBusy ? 'Detectando…' : 'Usar mi ubicación'}
                  </button>
                  {locError ? <p className="mt-1 text-xs text-amber-700">{locError}</p> : null}
                </Field>
              ) : null}
              <Field label="Indicaciones">
                <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPay('yape')}
                  className={`min-h-11 flex-1 rounded-xl py-2 text-sm ${pay === 'yape' ? 'bg-ember text-white' : 'bg-white'}`}
                >
                  Yape / Plin
                </button>
                <button
                  type="button"
                  onClick={() => setPay('efectivo')}
                  className={`min-h-11 flex-1 rounded-xl py-2 text-sm ${pay === 'efectivo' ? 'bg-ember text-white' : 'bg-white'}`}
                >
                  Efectivo
                </button>
              </div>
              <div className="flex justify-between font-display text-2xl">
                <span>Total</span>
                <span>{soles(total)}</span>
              </div>
              <button className="min-h-12 w-full rounded-xl bg-ember py-3 font-semibold text-white">
                Enviar pedido
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Track({ orderId }: { orderId: string }) {
  const { state } = useStore()
  const order = useMemo(() => state.orders.find((o) => o.id === orderId), [state.orders, orderId])
  if (!order) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream p-6">
        <div className="text-center">
          <p className="font-display text-2xl">No encontramos ese pedido</p>
          <Link to="/pedir" className="mt-4 inline-block text-ember">
            Volver a la carta
          </Link>
        </div>
      </div>
    )
  }
  const steps = [
    { id: 'nuevo', label: 'Recibido' },
    { id: 'en_cocina', label: 'En cocina' },
    { id: 'listo', label: 'Listo' },
    { id: 'entregado', label: 'Entregado' },
  ] as const
  const idx = steps.findIndex((s) => s.id === order.status)

  return (
    <div className="min-h-dvh bg-cream p-5 sm:p-8">
      <div className="mx-auto max-w-lg">
        <Link to="/pedir" className="inline-flex min-h-10 items-center gap-2 text-sm text-ink/50">
          <ArrowLeft size={16} /> Carta
        </Link>
        <p className="mt-8 text-xs tracking-[0.2em] text-ember uppercase">Pedido confirmado</p>
        <h1 className="font-display text-4xl sm:text-5xl">{padOrder(order.number)}</h1>
        <p className="mt-2 text-ink/60">
          Gracias, {order.customerName}. Te avisamos el avance aquí mismo.
        </p>
        {order.status === 'cancelado' ? (
          <p className="mt-6 rounded-xl bg-rose-100 p-4 text-brick">Este pedido fue cancelado.</p>
        ) : (
          <ol className="mt-8 space-y-3">
            {steps.map((s, i) => (
              <li
                key={s.id}
                className={`rounded-2xl px-4 py-3 ${i <= idx ? 'bg-ink text-cream' : 'bg-white text-ink/40'}`}
              >
                {s.label}
              </li>
            ))}
          </ol>
        )}
        <ul className="card mt-8 p-4">
          {order.items.map((i, n) => (
            <li key={n} className="flex justify-between py-1 text-sm">
              <span>
                {i.qty}× {i.name}
              </span>
              <span>{soles(i.qty * i.price)}</span>
            </li>
          ))}
          <li className="mt-2 flex justify-between border-t border-ink/10 pt-2 font-semibold">
            <span>Total</span>
            <span>{soles(order.total)}</span>
          </li>
        </ul>
        <button
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white font-semibold"
          onClick={() => printTicket(order, state.settings, 'caja')}
        >
          <Printer size={16} /> Imprimir / guardar ticket
        </button>
        <p className="mt-6 text-center text-sm text-ink/40">{state.settings.phone}</p>
      </div>
    </div>
  )
}
