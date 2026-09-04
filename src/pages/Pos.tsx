import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, ChevronDown, Loader2, MapPin, Minus, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { padOrder, soles } from '../lib/format'
import { printTicket } from '../lib/print'
import { apiSearchCustomers, apiUpsertCustomer } from '../lib/apiClient'
import { formatDeliveryQuote, quoteDeliveryFromAddress } from '../lib/deliveryQuote'
import { pickDeliveryBranchId } from '../lib/deliveryRanges'
import { filterKitchenItems } from '../lib/kitchen'
import { orderBelongsToStaff } from '../lib/realtime'
import type { Customer, OrderItem, OrderType, PaymentMethod } from '../types'
import { canCharge } from '../types'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'

function phoneDigitsOf(value?: string) {
  return String(value || '').replace(/\D/g, '')
}

function phoneLast9(value?: string) {
  return phoneDigitsOf(value).slice(-9)
}

function prettyPhone(value?: string) {
  const d = phoneLast9(value)
  if (d.length !== 9) return value || ''
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
}

export function Pos() {
  const { state, createOrder, addItemsToOrder, payOrder } = useStore()
  const { user, actingRole } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presetTable = params.get('mesa') ?? ''
  const appendOrderId = params.get('agregar') ?? ''
  const presetTipo = params.get('tipo')

  const appendOrder = appendOrderId ? state.orders.find((o) => o.id === appendOrderId) : null
  const appendForbidden =
    Boolean(appendOrder) && actingRole === 'mozo' && !orderBelongsToStaff(appendOrder!, user)
  const isAppendMode = !!appendOrder && !appendForbidden
  const salonFlow = Boolean(presetTable) || isAppendMode
  const mayCharge = canCharge(actingRole)

  const categories = useMemo(
    () => ['Todos', ...new Set(state.products.map((p) => p.category))],
    [state.products],
  )
  const [cat, setCat] = useState('Todos')
  const [q, setQ] = useState('')
  const [type, setType] = useState<OrderType>(
    isAppendMode
      ? (appendOrder?.type ?? 'salon')
      : presetTable
        ? 'salon'
        : presetTipo === 'delivery'
          ? 'delivery'
          : 'llevar',
  )
  const [tableId, setTableId] = useState(presetTable)
  const [tableOpen, setTableOpen] = useState(false)
  const [customerName, setCustomerName] = useState(
    isAppendMode ? (appendOrder?.customerName ?? '') : '',
  )
  const [phone, setPhone] = useState(isAppendMode ? (appendOrder?.customerPhone ?? '') : '')
  const [custHits, setCustHits] = useState<Customer[]>([])
  const [custOpen, setCustOpen] = useState(false)
  const [matchedCustomer, setMatchedCustomer] = useState<Customer | null>(null)
  const appliedPhoneRef = useRef('')
  const [address, setAddress] = useState('')
  const [addressLat, setAddressLat] = useState<number | null>(null)
  const [addressLng, setAddressLng] = useState<number | null>(null)
  const [quotedFee, setQuotedFee] = useState<number | null>(null)
  const [quoteKm, setQuoteKm] = useState<number | null>(null)
  const [quoteMin, setQuoteMin] = useState<number | null>(null)
  const [quoteInfo, setQuoteInfo] = useState<string | null>(null)
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [payOpen, setPayOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)
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
  const deliveryFee = type === 'delivery' ? quotedFee || 0 : 0
  const total = Math.max(0, gross + deliveryFee)

  useEffect(() => {
    if (type !== 'delivery') {
      setQuotedFee(null)
      setQuoteInfo(null)
    }
  }, [type])

  useEffect(() => {
    if (isAppendMode) return
    const nameQ = customerName.trim().toLowerCase()
    const phoneQ = phoneDigitsOf(phone)
    const last9 = phoneQ.slice(-9)
    if (nameQ.length < 2 && phoneQ.length < 3) {
      setCustHits([])
      setMatchedCustomer(null)
      appliedPhoneRef.current = ''
      return
    }
    const local: Customer[] = []
    const seen = new Set<string>()
    const push = (c: { id?: string; name: string; phone?: string; address?: string }) => {
      const key = phoneLast9(c.phone) || c.name.toLowerCase()
      if (!key || seen.has(key)) return
      seen.add(key)
      local.push({
        id: c.id || key,
        name: c.name,
        phone: c.phone || '',
        password: '',
        address: c.address,
        createdAt: '',
      })
    }
    for (const c of state.customers) {
      const n = c.name.toLowerCase()
      const p = phoneDigitsOf(c.phone)
      if ((nameQ.length >= 2 && n.includes(nameQ)) || (phoneQ.length >= 3 && p.includes(phoneQ))) push(c)
    }
    for (const o of state.orders) {
      const n = o.customerName.toLowerCase()
      const p = phoneDigitsOf(o.customerPhone)
      if ((nameQ.length >= 2 && n.includes(nameQ)) || (phoneQ.length >= 3 && p.includes(phoneQ))) {
        push({ name: o.customerName, phone: o.customerPhone, address: o.address, id: o.customerId })
      }
    }

    const applyExact = (pool: Customer[]) => {
      if (last9.length !== 9) {
        setMatchedCustomer(null)
        appliedPhoneRef.current = ''
        return
      }
      const exact = pool.find((c) => phoneLast9(c.phone) === last9)
      if (!exact) {
        setMatchedCustomer(null)
        return
      }
      setMatchedCustomer(exact)
      if (appliedPhoneRef.current === last9) return
      appliedPhoneRef.current = last9
      setCustomerName(exact.name)
      if (exact.address) setAddress(exact.address)
      setCustOpen(true)
    }

    setCustHits(local.slice(0, 8))
    applyExact(local)
    const query = phoneQ.length >= 3 ? phoneQ : customerName.trim()
    const t = window.setTimeout(() => {
      void apiSearchCustomers(query)
        .then((r) => {
          const incoming = r.customers || []
          setCustHits((prev) => {
            const map = new Map(prev.map((x) => [phoneLast9(x.phone) || x.name, x]))
            for (const c of incoming) {
              const k = phoneLast9(c.phone) || c.name
              if (!map.has(k)) map.set(k, c)
            }
            const next = [...map.values()].slice(0, 8)
            applyExact(next)
            return next
          })
        })
        .catch(() => undefined)
    }, 280)
    return () => window.clearTimeout(t)
  }, [customerName, phone, isAppendMode, state.customers, state.orders])
  const cashNum = Number(cash) || 0
  const change = Math.max(0, cashNum - total)
  const canSend = items.length > 0 && (isAppendMode || type !== 'salon' || Boolean(tableId))

  const nameOk = customerName.trim().length >= 2
  const phoneOk = phoneLast9(phone).length === 9
  const customerOk = isAppendMode || (nameOk && phoneOk)
  const canSubmit = canSend && customerOk && (type !== 'salon' || Boolean(tableId) || isAppendMode)

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
    if (!canSubmit || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setConfirmSend(false)
    setPayOpen(false)

    try {
      if (isAppendMode && appendOrder) {
        const kitchenNew = filterKitchenItems(items, state.products)
        addItemsToOrder(appendOrder.id, items, user?.name ?? 'POS')
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
            state.users,
          )
        }
        navigate('/pedidos-web')
        return
      }

      const name = customerName.trim()
      if (!isAppendMode && (!nameOk || !phoneOk)) {
        alert('Nombre y celular del cliente son obligatorios')
        return
      }
      if (type === 'delivery' && !address.trim()) {
        alert('Indica la dirección de entrega para calcular km y tiempo')
        return
      }

      let lat = addressLat
      let lng = addressLng
      let dist = quoteKm
      let mins = quoteMin
      let sendFee = deliveryFee
      if (type === 'delivery') {
        try {
          const q = await quoteDeliveryFromAddress(address.trim(), pickDeliveryBranchId(state.branches))
          lat = q.lat
          lng = q.lng
          dist = q.distanceKm
          mins = q.timeMin
          sendFee = q.fee
          setAddressLat(q.lat)
          setAddressLng(q.lng)
          setQuotedFee(q.fee)
          setQuoteKm(q.distanceKm)
          setQuoteMin(q.timeMin)
          setQuoteInfo(formatDeliveryQuote(q))
        } catch (e) {
          alert((e as Error).message || 'No se pudo calcular el delivery. Revisa la dirección o la ubicación del local.')
          return
        }
      }
      const orderItems =
        type === 'delivery' && sendFee > 0
          ? [...items, { productId: 'delivery', name: 'Delivery', qty: 1, price: sendFee }]
          : items

      let customerId: string | undefined
      let customerPhone = phone
      if (phoneOk && nameOk) {
        const { customer } = await apiUpsertCustomer({
          name,
          phone,
          address: type === 'delivery' ? address || undefined : undefined,
        })
        customerId = customer.id
        customerPhone = customer.phone || phone
      }
      const order = await createOrder({
        type,
        items: orderItems,
        customerName: name,
        customerPhone: customerPhone || undefined,
        customerId,
        address: type === 'delivery' ? address : undefined,
        addressLat: type === 'delivery' && lat != null ? lat : undefined,
        addressLng: type === 'delivery' && lng != null ? lng : undefined,
        deliveryFee: type === 'delivery' ? sendFee : 0,
        branchId: type === 'delivery' ? pickDeliveryBranchId(state.branches) : undefined,
        deliveryDistanceKm: type === 'delivery' ? dist ?? undefined : undefined,
        deliveryTimeMin: type === 'delivery' ? mins ?? undefined : undefined,
        tableId: type === 'salon' ? tableId : undefined,
        discount: 0,
        paymentMethod: paid && mayCharge ? payMethod : 'pendiente',
        paid: paid && mayCharge,
        notes: notes || undefined,
        createdBy: user?.name ?? 'POS',
        createdByUserId: user?.id,
        source: 'pos',
        codPaymentMethod: type === 'delivery' ? (payMethod === 'yape' ? 'yape' : 'efectivo') : undefined,
      })
      if (paid && mayCharge) await payOrder(order.id, payMethod)
      const kitchenItems = filterKitchenItems(order.items, state.products)
      if (kitchenItems.length > 0) {
        printTicket({ ...order, items: kitchenItems }, state.settings, 'cocina', state.users)
      }
      if (paid && mayCharge) setTimeout(() => printTicket(order, state.settings, 'caja', state.users), 400)
      navigate(type === 'salon' ? '/mesas' : '/pedidos-web')
    } catch (e) {
      alert((e as Error).message || 'No se pudo crear el pedido')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const askSend = () => {
    if (!canSubmit || sendingRef.current) return
    setConfirmSend(true)
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
        {type === 'delivery' ? (
          <div className="flex justify-between text-ink/45">
            <span>Delivery{quoteInfo ? ` · ${quoteInfo}` : ''}</span>
            <span className="font-semibold text-ink">{deliveryFee > 0 ? soles(deliveryFee) : '—'}</span>
          </div>
        ) : null}
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
          disabled={!canSubmit || sending}
          onClick={askSend}
          className="min-h-12 rounded-2xl bg-ink py-3 font-bold text-cream disabled:opacity-40"
        >
          {isAppendMode
            ? 'Agregar (comanda solo lo nuevo de cocina)'
            : 'Enviar e imprimir cocina'}
        </button>
        {!isAppendMode && mayCharge && (
          <button
            disabled={!canSubmit || sending}
            onClick={() => setPayOpen(true)}
            className="btn-primary disabled:opacity-40"
          >
            Cobrar, imprimir y enviar
          </button>
        )}
        {!isAppendMode && !mayCharge ? (
          <p className="text-center text-[11px] text-ink/40">El cobro lo hace caja.</p>
        ) : null}
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
          title={
            isAppendMode
              ? `Agregar a ${padOrder(appendOrder!.number)}`
              : salonFlow
                ? `Mesa ${selectedTable?.number ?? ''}`
                : 'Para llevar'
          }
          hint={
            isAppendMode
              ? `${appendOrder!.customerName} ya tiene ${appendOrder!.items.length} platos. Agrega más y envía a cocina.`
              : salonFlow
                ? 'Toca los platos y envía a cocina. El cobro lo hace caja.'
                : 'Piden y se lo llevan. Elige platos y envía. El cobro lo hace caja.'
          }
        />

        {!salonFlow ? (
          <div className="seg mt-5">
            {(
              [
                { id: 'llevar' as const, label: 'Para llevar' },
                { id: 'delivery' as const, label: 'Delivery' },
              ]
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setType(t.id)}
                className={`seg-btn ${type === t.id ? 'seg-btn-on' : ''}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <input
              className={inputClass}
              placeholder="Nombre del cliente *"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value)
                setCustOpen(true)
              }}
              onFocus={() => setCustOpen(true)}
              onBlur={() => window.setTimeout(() => setCustOpen(false), 180)}
              required
              disabled={isAppendMode}
              autoComplete="off"
            />
          </div>
          <div className="relative">
            <input
              className={inputClass}
              placeholder="Celular *"
              value={phone}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, 9)
                setPhone(next)
                if (next.length < 9) {
                  appliedPhoneRef.current = ''
                  setMatchedCustomer(null)
                }
                setCustOpen(true)
              }}
              onFocus={() => setCustOpen(true)}
              onBlur={() => window.setTimeout(() => setCustOpen(false), 180)}
              inputMode="numeric"
              required
              disabled={isAppendMode}
              autoComplete="off"
              maxLength={9}
            />
          </div>
          {!isAppendMode && matchedCustomer && phoneOk ? (
            <p className="sm:col-span-2 rounded-2xl bg-emerald-500/12 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Celular de {matchedCustomer.name} · {prettyPhone(matchedCustomer.phone)}. El nombre se rellena solo; al enviar se actualiza si lo cambias. No se duplica.
            </p>
          ) : !isAppendMode ? (
            <p className="sm:col-span-2 text-[11px] font-semibold text-ink/40">
              Nombre y celular son obligatorios. Escribe el nombre para ver el teléfono, o el celular para rellenar el nombre.
            </p>
          ) : null}
          {!isAppendMode && custOpen && custHits.length > 0 ? (
            <div className="sm:col-span-2 z-30 overflow-hidden rounded-2xl border border-ink/10 bg-surface shadow-lg">
              <p className="px-3 pt-2 text-[11px] font-bold tracking-wide text-ink/40 uppercase">
                Coincidencias
              </p>
              <ul className="max-h-52 overflow-y-auto py-1">
                {custHits.map((c) => (
                  <li key={`${c.id}-${c.phone}`}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-ember/8"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const last9 = phoneLast9(c.phone)
                        setCustomerName(c.name)
                        setPhone(last9)
                        appliedPhoneRef.current = last9
                        setMatchedCustomer(c)
                        if (c.address) setAddress(c.address)
                        setCustHits([])
                        setCustOpen(false)
                      }}
                    >
                      <span>
                        <span className="block text-sm font-semibold">{c.name}</span>
                        <span className="text-xs font-bold text-ember">{prettyPhone(c.phone) || 'Sin celular'}</span>
                      </span>
                      {c.address ? <span className="max-w-[40%] truncate text-[11px] text-ink/35">{c.address}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
            <div className="sm:col-span-2 space-y-2">
              <input
                className={inputClass}
                placeholder="Dirección de entrega"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value)
                  setQuotedFee(null)
                  setQuoteInfo(null)
                }}
              />
              <button
                type="button"
                disabled={quoteBusy || !address.trim()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-semibold text-cream disabled:opacity-40"
                onClick={() => {
                  void (async () => {
                    setQuoteBusy(true)
                    try {
                      const q = await quoteDeliveryFromAddress(address.trim(), pickDeliveryBranchId(state.branches))
                      setAddressLat(q.lat)
                      setAddressLng(q.lng)
                      if (q.address) setAddress(q.address)
                      setQuotedFee(q.fee)
                      setQuoteKm(q.distanceKm)
                      setQuoteMin(q.timeMin)
                      setQuoteInfo(formatDeliveryQuote(q))
                    } catch (e) {
                      setQuoteInfo((e as Error).message)
                    } finally {
                      setQuoteBusy(false)
                    }
                  })()
                }}
              >
                <MapPin size={14} /> {quoteBusy ? 'Calculando…' : 'Calcular distancia y tiempo'}
              </button>
              {quoteInfo ? (
                <p className="text-sm font-semibold text-teal-800">
                  {quoteInfo}
                  {deliveryFee > 0 ? ` · envío ${soles(deliveryFee)}` : ''}
                </p>
              ) : (
                <p className="text-xs text-ink/45">
                  Se calcula desde la ubicación del local (Configuración) y los rangos de delivery.
                </p>
              )}
            </div>
          ) : null}
          {!isAppendMode && type === 'delivery' && (!nameOk || !phoneOk) ? (
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

        <div className={`mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4 ${qty > 0 ? 'pb-24 xl:pb-0' : ''}`}>
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
          className="safe-bottom fixed inset-x-3 z-20 flex min-h-[3.25rem] items-center justify-between rounded-2xl bg-gold px-4 py-3.5 text-[#1a3d1a] shadow-xl shadow-yellow-500/25 xl:hidden"
          style={{ bottom: '4.75rem' }}
        >
          <span className="inline-flex items-center gap-2 font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1a3d1a] text-sm text-gold">
              {qty}
            </span>
            Ver ticket
          </span>
          <span className="text-lg font-black tracking-tight">{soles(total)}</span>
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
        <button
          className="btn-primary mt-5 w-full disabled:opacity-40"
          disabled={sending}
          onClick={() => void submit(true, method)}
        >
          Confirmar, imprimir y enviar
        </button>
      </Modal>

      <Modal
        open={confirmSend}
        title={isAppendMode ? '¿Agregar a la comanda?' : '¿Enviar este pedido?'}
        onClose={() => {
          if (!sending) setConfirmSend(false)
        }}
      >
        <p className="text-sm text-ink/60">
          {isAppendMode
            ? `Se agregará a ${padOrder(appendOrder!.number)}. Cocina solo recibe lo nuevo.`
            : salonFlow
              ? `Mesa ${selectedTable?.number ?? ''} · ${customerName.trim() || 'cliente'}`
              : `${type === 'delivery' ? 'Delivery' : 'Para llevar'} · ${customerName.trim()}`}
        </p>
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-sm">
          {items.map((i, idx) => (
            <li key={`${i.productId}-${idx}`}>
              {i.qty}× {i.name}
            </li>
          ))}
        </ul>
        <p className="mt-3 font-display text-2xl tracking-tight text-ember">{soles(total)}</p>
        <p className="mt-1 text-xs text-ink/40">Confirma para no mandar el pedido dos veces.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="min-h-11 rounded-2xl bg-ink/[0.06] text-sm font-semibold"
            disabled={sending}
            onClick={() => setConfirmSend(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="min-h-11 rounded-2xl bg-ink text-sm font-bold text-cream disabled:opacity-40"
            disabled={sending}
            onClick={() => void submit(false, 'pendiente')}
          >
            Sí, enviar
          </button>
        </div>
      </Modal>

      {sending ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/55 px-6">
          <div className="w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-2xl">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-ember" />
            <p className="mt-4 font-display text-xl tracking-tight">Enviando pedido…</p>
            <p className="mt-1 text-sm text-ink/50">Espera. No pulses otra vez.</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-gold" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
