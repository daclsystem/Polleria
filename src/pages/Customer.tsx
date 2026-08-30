import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Home,
  LogOut,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  TicketPercent,
  Trash2,
  User,
  X,
} from 'lucide-react'
import {
  apiGetWebsite,
  apiMyOrders,
  apiSaveCustomerAddress,
  apiUpdateCustomerProfile,
  apiValidateCoupon,
} from '../lib/apiClient'
import { ConfirmLogout } from '../components/ConfirmLogout'
import {
  DevicePermissionsPrompt,
  askDevicePermissions,
  notificationsGranted,
  permissionsPromptSkipped,
  skipPermissionsPrompt,
} from '../components/DevicePermissionsPrompt'
import { uploadAvatar } from '../lib/minio'
import { BottomSheet } from '../components/BottomSheet'
import { CustomerAddressesPanel } from '../components/CustomerAddressesPanel'
import { PhoneOtpLogin } from '../components/PhoneOtpLogin'
import { ProductModal } from '../components/ProductModal'
import { Field, PageTitle, inputClass } from '../components/ui'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import {
  clearCustomerSession,
  getCustomerSession,
  setCustomerHome,
  setCustomerSession,
} from '../lib/customerSession'
import { formatDeliveryQuote, quoteDeliveryAt, quoteDeliveryFromAddress } from '../lib/deliveryQuote'
import { pickDeliveryBranchId } from '../lib/deliveryRanges'
import { padOrder, soles } from '../lib/format'
import { withBase } from '../lib/paths'
import { platformLabel } from '../lib/platform'
import { useStore } from '../store/StoreContext'
import type { Customer, Order, OrderItem, OrderStatus, Product } from '../types'
import { TYPE_LABEL } from '../types'
import { DEFAULT_WEB_SITE, mergeWebSite } from '../lib/webSite'
import { ThemeToggle } from '../components/ThemeToggle'

const PERMS_SKIP_KEY = 'polleria-perms-skip-cliente'

const MODES: { id: 'llevar' | 'delivery'; label: string }[] = [
  { id: 'llevar', label: 'Recojo' },
  { id: 'delivery', label: 'Delivery' },
]

export function CustomerApp() {
  return <CustomerMenu />
}

function ProductCard({
  product: p,
  onOpen,
  compact = false,
}: {
  product: Product
  onOpen: (p: Product) => void
  compact?: boolean
}) {
  const hasDiscount = (p.tags || []).some((t) => 
    t.toLowerCase().includes('promo') || 
    t.toLowerCase().includes('descuento') || 
    t.toLowerCase().includes('oferta')
  )
  const discountPct = hasDiscount ? 20 : 0
  const originalPrice = hasDiscount ? Math.round(p.price / 0.8) : p.price

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onOpen(p)}
        className="w-[10.75rem] shrink-0 snap-start overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-black/5"
      >
        <div
          className="relative aspect-[4/3] w-full overflow-hidden"
          style={{ background: p.imageUrl ? '#f3f4f6' : `${p.tone || '#1a3d1a'}22` }}
        >
          {hasDiscount ? (
            <span className="absolute left-1.5 top-1.5 z-10 rounded bg-gold px-1.5 py-0.5 text-[10px] font-bold text-[#1a3d1a]">
              -{discountPct}%
            </span>
          ) : null}
          {p.imageUrl ? (
            <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl">{p.emoji}</span>
          )}
          <span className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-ember text-white shadow">
            <Plus size={16} />
          </span>
        </div>
        <div className="p-2.5">
          <p className="line-clamp-1 text-sm font-bold text-gray-900">{p.name}</p>
          <p className="line-clamp-1 text-[11px] text-gray-500">{p.description || ' '}</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-sm font-black text-ember">{soles(p.price)}</span>
            {hasDiscount ? (
              <span className="text-[10px] text-gray-400 line-through">{soles(originalPrice)}</span>
            ) : null}
          </div>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(p)}
      className="flex w-full min-w-0 items-center gap-3 rounded-2xl bg-white p-2.5 text-left shadow-sm ring-1 ring-black/5"
    >
      <div
        className="relative h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden rounded-xl"
        style={{ background: p.imageUrl ? '#f3f4f6' : `${p.tone || '#1a3d1a'}22` }}
      >
        {hasDiscount ? (
          <span className="absolute left-1 top-1 z-10 rounded bg-gold px-1 py-px text-[9px] font-bold text-[#1a3d1a]">
            -{discountPct}%
          </span>
        ) : null}
        {p.imageUrl ? (
          <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl">{p.emoji}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[15px] font-bold text-gray-900">{p.name}</p>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-gray-500">
          {p.description || ' '}
        </p>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-[15px] font-black text-ember">{soles(p.price)}</span>
          {hasDiscount ? (
            <span className="text-[11px] text-gray-400 line-through">{soles(originalPrice)}</span>
          ) : null}
        </div>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember text-white">
        <Plus size={18} />
      </span>
    </button>
  )
}

function ProductRail({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const skipClick = useRef(false)

  const scrollBy = (dir: number) => {
    ref.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })
  }

  return (
    <div className="relative min-w-0">
      <div
        ref={ref}
        className="flex cursor-grab gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden select-none active:cursor-grabbing"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
        onPointerDown={(e) => {
          const el = ref.current
          if (!el) return
          drag.current = { x: e.clientX, left: el.scrollLeft, moved: false }
          el.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const el = ref.current
          const d = drag.current
          if (!el || !d) return
          const dx = e.clientX - d.x
          if (Math.abs(dx) > 4) d.moved = true
          el.scrollLeft = d.left - dx
        }}
        onPointerUp={() => {
          skipClick.current = Boolean(drag.current?.moved)
          drag.current = null
        }}
        onPointerCancel={() => {
          drag.current = null
        }}
        onClickCapture={(e) => {
          if (!skipClick.current) return
          skipClick.current = false
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Anterior"
        onClick={() => scrollBy(-1)}
        className="absolute left-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink shadow ring-1 ring-black/10"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        type="button"
        aria-label="Siguiente"
        onClick={() => scrollBy(1)}
        className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-ink shadow ring-1 ring-black/10"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  nuevo: 'Recibido',
  en_cocina: 'Preparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
}

const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  nuevo: 'bg-blue-100 text-blue-700',
  en_cocina: 'bg-orange-100 text-orange-700',
  listo: 'bg-green-100 text-green-700',
  entregado: 'bg-gray-100 text-gray-600',
  cancelado: 'bg-red-100 text-red-600',
}

function isOrderInProgress(status: OrderStatus) {
  return status !== 'entregado' && status !== 'cancelado'
}

function MyOrderCard({ order, onOpen }: { order: Order; onOpen: (o: Order) => void }) {
  const active = isOrderInProgress(order.status)
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(order)}
        className={`w-full rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ${
          active ? 'ring-ember/20' : 'ring-ink/[0.04]'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-display text-xl tracking-tight">{padOrder(order.number)}</p>
              {active ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember/40" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-ember" />
                </span>
              ) : null}
            </div>
            <p className="text-xs text-ink/45">
              {new Date(order.createdAt).toLocaleString('es-PE')} · {TYPE_LABEL[order.type] || order.type}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${ORDER_STATUS_TONE[order.status]}`}>
            {ORDER_STATUS_LABEL[order.status]}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-xs text-ink/50">
          {order.items.map((i) => `${i.qty}× ${i.name}`).join(' · ')}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="font-extrabold text-ink">{soles(order.total)}</p>
          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-ember">
            Ver detalle <ChevronRight size={14} />
          </span>
        </div>
      </button>
    </li>
  )
}

function orderTrackPath(orderId: string, phone?: string) {
  const tel = (phone || '').replace(/\D/g, '').slice(-9)
  return `/seguimiento/${orderId}${tel ? `?tel=${encodeURIComponent(tel)}` : ''}`
}

function CustomerMenu() {
  const navigate = useNavigate()
  const { state, createOrder } = useStore()
  const [tab, setTab] = useState<'inicio' | 'promos' | 'pedidos' | 'perfil'>('inicio')
  const [cat, setCat] = useState('Todos')
  const [q, setQ] = useState('')
  const [items, setItems] = useState<OrderItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authPurpose, setAuthPurpose] = useState<'login' | 'register'>('login')
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [permsOpen, setPermsOpen] = useState(false)
  const [waNumber, setWaNumber] = useState(DEFAULT_WEB_SITE.whatsappNumber)
  const [customer, setCustomer] = useState<Customer | null>(() => getCustomerSession())
  const [modalProduct, setModalProduct] = useState<Product | null>(null)
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [ordersBusy, setOrdersBusy] = useState(false)
  const [mode, setMode] = useState<'llevar' | 'delivery'>('delivery')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [couponMsg, setCouponMsg] = useState<string | null>(null)
  const [addrReload, setAddrReload] = useState(0)
  const [saveAddrMsg, setSaveAddrMsg] = useState<string | null>(null)
  const [addressLat, setAddressLat] = useState<number | null>(null)
  const [addressLng, setAddressLng] = useState<number | null>(null)
  const [quotedFee, setQuotedFee] = useState<number | null>(null)
  const [quoteKm, setQuoteKm] = useState<number | null>(null)
  const [quoteMin, setQuoteMin] = useState<number | null>(null)
  const [quoteInfo, setQuoteInfo] = useState<string | null>(null)
  const [locBusy, setLocBusy] = useState(false)
  const [note, setNote] = useState('')
  const [pay, setPay] = useState<'yape' | 'efectivo'>('yape')
  const { requestOnce, addressHint, error: locError, status: locStatus } = useDeviceLocation({
    auto: Boolean(getCustomerSession()),
  })

  const loadMyOrders = async () => {
    if (!getCustomerSession()) {
      setMyOrders([])
      return
    }
    setOrdersBusy(true)
    try {
      const r = await apiMyOrders()
      setMyOrders((r.orders || []) as Order[])
    } catch {
      const sess = getCustomerSession()
      setMyOrders(
        sess
          ? state.orders
              .filter((o) => o.customerId === sess.id || o.customerPhone === sess.phone)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          : [],
      )
    } finally {
      setOrdersBusy(false)
    }
  }

  useEffect(() => {
    const sess = getCustomerSession()
    if (sess) {
      setCustomerHome('cliente')
      setCustomer(sess)
      setName(sess.name)
      setPhone(sess.phone)
      if (sess.address) setAddress(sess.address)
      void loadMyOrders()
    }
    const tabParam = new URLSearchParams(window.location.search).get('tab')
    if (tabParam === 'pedidos' || tabParam === 'perfil' || tabParam === 'promos') {
      setTab(tabParam)
    }
    void apiGetWebsite(false)
      .then((w) => {
        const n = mergeWebSite(w.site).whatsappNumber.replace(/\D/g, '')
        if (n) setWaNumber(n)
      })
      .catch(() => undefined)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (addressHint) setAddress(addressHint)
  }, [addressHint])

  useEffect(() => {
    if (mode !== 'delivery' || addressLat == null || addressLng == null) return
    let cancelled = false
    void quoteDeliveryAt(addressLat, addressLng, pickDeliveryBranchId(state.branches))
      .then((q) => {
        if (cancelled) return
        setQuotedFee(q.fee)
        setQuoteKm(q.distanceKm)
        setQuoteMin(q.timeMin)
        setQuoteInfo(formatDeliveryQuote(q))
      })
      .catch((e) => {
        if (cancelled) return
        setQuotedFee(null)
        setQuoteKm(null)
        setQuoteMin(null)
        setQuoteInfo((e as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [mode, addressLat, addressLng, state.branches])

  useEffect(() => {
    if (!customer) {
      setPermsOpen(false)
      return
    }
    if (permissionsPromptSkipped(PERMS_SKIP_KEY)) return
    if (notificationsGranted() && locStatus === 'granted') {
      skipPermissionsPrompt(PERMS_SKIP_KEY)
      setPermsOpen(false)
      return
    }
    if (locStatus === 'prompting') return
    setPermsOpen(true)
  }, [customer, locStatus])

  useEffect(() => {
    if (tab === 'pedidos') void loadMyOrders()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const openOrder = (order: Order) => {
    navigate(orderTrackPath(order.id, order.customerPhone || phone || customer?.phone))
  }

  /** Deep-link desde la web: /cliente/?producto=ID. Se guarda por si primero hay que loguearse. */
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('producto')
    if (fromUrl) {
      try {
        sessionStorage.setItem('polleria-pending-product', fromUrl)
      } catch {
        /* ignore */
      }
    }
  }, [])

  useEffect(() => {
    if (!customer || state.products.length === 0) return
    let id: string | null = null
    try {
      id = sessionStorage.getItem('polleria-pending-product')
    } catch {
      id = null
    }
    if (!id) id = new URLSearchParams(window.location.search).get('producto')
    if (!id) return
    const p = state.products.find((x) => x.id === id && x.available)
    if (!p) return
    try {
      sessionStorage.removeItem('polleria-pending-product')
    } catch {
      /* ignore */
    }
    setTab('inicio')
    setModalProduct(p)
    window.history.replaceState({}, '', `${window.location.pathname}`)
  }, [customer, state.products])

  const categories = useMemo(
    () => ['Todos', ...new Set(state.products.filter((p) => p.available).map((p) => p.category))],
    [state.products],
  )

  const bestsellers = useMemo(() => {
    const list = state.products.filter((p) => p.available)
    const ranked = [...list].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0))
    const top = ranked.filter((p) => (p.soldCount || 0) > 0).slice(0, 8)
    if (top.length >= 3) return top
    return list.filter((p) => p.tags?.includes('Popular')).slice(0, 8)
  }, [state.products])

  const products = state.products.filter((p) => {
    if (!p.available) return false
    if (cat !== 'Todos' && p.category !== cat) return false
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

  const qty = items.reduce((s, i) => s + i.qty, 0)
  const sub = items.reduce((s, i) => s + i.qty * i.price, 0)
  const fee = mode === 'delivery' ? (quotedFee != null ? quotedFee : 0) : 0
  const total = Math.max(0, sub + fee - couponDiscount)

  const openProduct = (p: Product) => setModalProduct(p)

  const addFromModal = (item: OrderItem) => setItems((prev) => [...prev, item])

  const suggestionsFor = (product: Product): Product[] => {
    const same = state.products.filter(
      (p) => p.available && p.id !== product.id && p.category === product.category,
    )
    const drinks = state.products.filter(
      (p) => p.available && p.category === 'Bebidas' && p.id !== product.id,
    )
    const popular = state.products.filter(
      (p) => p.available && p.id !== product.id && p.tags?.includes('Popular'),
    )
    return Array.from(
      new Map(
        [...same.slice(0, 2), ...drinks.slice(0, 2), ...popular.slice(0, 1)].map((p) => [p.id, p]),
      ).values(),
    ).slice(0, 4)
  }

  const openCart = () => {
    if (!getCustomerSession() && !customer) {
      setAuthPurpose('login')
      setAuthOpen(true)
      return
    }
    setCartOpen(true)
  }

  const logout = () => {
    clearCustomerSession()
    setCustomer(null)
    setItems([])
    setCartOpen(false)
    setAuthOpen(true)
  }

  const send = async () => {
    const sess = customer || getCustomerSession()
    if (!sess) {
      setAuthOpen(true)
      return
    }
    if (items.length === 0) return
    if (name.trim().length < 2 || phone.replace(/\D/g, '').length < 9) {
      alert('Nombre y celular son obligatorios')
      return
    }
    if (mode === 'delivery' && !address.trim()) {
      alert('Indica la dirección de entrega')
      return
    }
    let lat = addressLat
    let lng = addressLng
    let dist = quoteKm
    let mins = quoteMin
    let sendFee = fee
    if (mode === 'delivery' && (lat == null || lng == null || sendFee <= 0)) {
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
        alert((e as Error).message || 'No se pudo calcular distancia y tiempo. Usa tu ubicación o una dirección clara.')
        return
      }
    }
    const orderItems =
      mode === 'delivery' && sendFee > 0
        ? [...items, { productId: 'delivery', name: 'Delivery', qty: 1, price: sendFee }]
        : items
    try {
      const order = await createOrder({
        type: mode,
        items: orderItems,
        customerName: name.trim() || sess.name,
        customerPhone: phone || sess.phone,
        customerId: sess.id,
        address: mode === 'delivery' ? address : undefined,
        addressLat: mode === 'delivery' && lat != null ? lat : undefined,
        addressLng: mode === 'delivery' && lng != null ? lng : undefined,
        discount: couponDiscount,
        couponCode: couponCode.trim() || undefined,
        paymentMethod: 'pendiente',
        paid: false,
        codPaymentMethod: pay,
        codCashAmount: pay === 'efectivo' ? Math.max(0, sub + sendFee - couponDiscount) : undefined,
        notes: note || undefined,
        createdBy: 'Cliente',
        source: 'web',
        deliveryFee: mode === 'delivery' ? sendFee : 0,
        branchId: mode === 'delivery' ? pickDeliveryBranchId(state.branches) : undefined,
        deliveryDistanceKm: mode === 'delivery' ? dist ?? undefined : undefined,
        deliveryTimeMin: mode === 'delivery' ? mins ?? undefined : undefined,
      })
      setItems([])
      setCartOpen(false)
      navigate(orderTrackPath(order.id, phone || sess.phone))
    } catch (err) {
      alert((err as Error).message || 'No se pudo crear el pedido')
    }
  }

  const cartBody = (
    <>
      <ul className="max-h-[40vh] space-y-2.5 overflow-y-auto xl:max-h-72">
        {items.length === 0 ? <p className="text-sm text-ink/40">Agrega platos de la carta.</p> : null}
        {items.map((item, idx) => (
          <li key={`${item.productId}-${idx}`} className="rounded-2xl bg-cream px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold">{item.name}</p>
                {item.selectedOptions?.length ? (
                  <p className="text-[11px] text-ink/45">
                    {item.selectedOptions.map((o) => o.name).join(' · ')}
                  </p>
                ) : null}
                {item.notes ? <p className="text-[11px] text-amber-700">Nota: {item.notes}</p> : null}
                <p className="text-xs font-semibold text-ember">{soles(item.price)}</p>
              </div>
              <button
                type="button"
                className="tap"
                onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
              >
                <Trash2 size={16} className="text-ink/25" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
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
                type="button"
                className="tap rounded-xl bg-white p-1.5 shadow-sm"
                onClick={() =>
                  setItems((p) => p.map((it, i) => (i === idx ? { ...it, qty: it.qty + 1 } : it)))
                }
              >
                <Plus size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-3 border-t border-ink/[0.06] pt-4">
        <div className="seg">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`seg-btn ${mode === m.id ? 'seg-btn-on' : ''}`}
            >
              {m.label}
              {m.id === 'delivery' && fee > 0 ? ` (+${soles(fee)})` : ''}
            </button>
          ))}
        </div>

        <Field label="Tu nombre">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Celular">
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required />
        </Field>

        {mode === 'delivery' ? (
          <Field label={`Dirección · ${platformLabel()}`}>
            <input
              className={inputClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
            <button
              type="button"
              disabled={locBusy}
              className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-ink/10"
              onClick={() => {
                void (async () => {
                  setLocBusy(true)
                  try {
                    const pos = await requestOnce(true)
                    if (!pos) return
                    setAddressLat(pos.lat)
                    setAddressLng(pos.lng)
                  } finally {
                    setLocBusy(false)
                  }
                })()
              }}
            >
              <MapPin size={14} /> {locBusy ? 'Detectando…' : 'Usar mi ubicación'}
            </button>
            <button
              type="button"
              disabled={locBusy || !address.trim()}
              className="mt-2 ml-2 inline-flex min-h-10 items-center gap-2 rounded-xl bg-ink px-3 text-sm font-semibold text-cream disabled:opacity-40"
              onClick={() => {
                void (async () => {
                  setLocBusy(true)
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
                    setLocBusy(false)
                  }
                })()
              }}
            >
              Calcular ruta
            </button>
            {quoteInfo ? (
              <p className="mt-2 text-sm font-semibold text-teal-800">
                {quoteInfo}
                {fee > 0 ? ` · envío ${soles(fee)}` : ''}
              </p>
            ) : (
              <p className="mt-2 text-xs text-ink/45">Usa tu ubicación o calcula la ruta para ver km, tiempo y tarifa.</p>
            )}
            {locError ? <p className="mt-1 text-xs text-brick">{locError}</p> : null}
            <button
              type="button"
              className="mt-2 text-sm font-bold text-ink"
              onClick={() => {
                void (async () => {
                  if (!address.trim()) return
                  try {
                    await apiSaveCustomerAddress({
                      label: 'Favorita',
                      address: address.trim(),
                      lat: addressLat,
                      lng: addressLng,
                    })
                    setSaveAddrMsg('Guardada')
                    setAddrReload((n) => n + 1)
                  } catch (err) {
                    setSaveAddrMsg((err as Error).message)
                  }
                })()
              }}
            >
              Guardar como favorita
            </button>
            {saveAddrMsg ? <p className="text-xs">{saveAddrMsg}</p> : null}
            {customer ? (
              <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-ink/5">
                <p className="mb-2 text-[10px] font-bold tracking-wide text-ink/40 uppercase">Favoritas</p>
                <CustomerAddressesPanel
                  pickMode
                  reloadKey={addrReload}
                  onPick={(a) => {
                    setAddress(a.address)
                    setAddressLat(a.lat)
                    setAddressLng(a.lng)
                  }}
                />
              </div>
            ) : null}
          </Field>
        ) : null}

        <Field label="Indicaciones">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div>
          <label className="text-sm font-semibold">Cupón</label>
          <div className="mt-1 flex gap-2">
            <input
              className={`${inputClass} flex-1 uppercase`}
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase())
                setCouponDiscount(0)
                setCouponMsg(null)
              }}
              placeholder="CODIGO"
            />
            <button
              type="button"
              className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-cream"
              onClick={() => {
                void (async () => {
                  try {
                    const r = await apiValidateCoupon(couponCode, sub)
                    setCouponDiscount(r.discount)
                    setCouponMsg('Descuento aplicado')
                  } catch (err) {
                    setCouponDiscount(0)
                    setCouponMsg((err as Error).message)
                  }
                })()
              }}
            >
              Aplicar
            </button>
          </div>
          {couponMsg ? <p className="mt-1 text-xs">{couponMsg}</p> : null}
        </div>

        <div className="seg">
          <button
            type="button"
            onClick={() => setPay('yape')}
            className={`seg-btn ${pay === 'yape' ? 'seg-btn-on' : ''}`}
          >
            Yape / Plin
          </button>
          <button
            type="button"
            onClick={() => setPay('efectivo')}
            className={`seg-btn ${pay === 'efectivo' ? 'seg-btn-on' : ''}`}
          >
            Efectivo
          </button>
        </div>

        <div className="flex justify-between pt-1 font-display text-2xl tracking-tight">
          <span>Total</span>
          <span className="text-ember">{soles(total)}</span>
        </div>

        <button type="button" onClick={() => void send()} className="btn-primary w-full">
          Confirmar pedido
        </button>
      </div>
    </>
  )

  if (!customer) {
    return (
      <div className="relative flex h-dvh flex-col overflow-y-auto bg-[#f6f3ee] px-4 py-8">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-md">
          <img
            src={withBase('logo-lopez.png')}
            alt={state.settings.name}
            className="mx-auto h-24 w-auto rounded-2xl shadow-md sm:h-28"
          />
          <p className="mt-5 text-center text-[10px] font-bold tracking-[0.2em] text-ember uppercase">
            App de pedidos
          </p>
          <p className="mt-2 text-center text-sm text-ink/50">
            Ingresa con tu celular para ver la carta y pedir.
          </p>
          <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <PhoneOtpLogin
              accountType="customer"
              purpose={authPurpose}
              showName={authPurpose === 'register'}
              title={authPurpose === 'register' ? 'Crea tu cuenta' : 'Ingresa para pedir'}
              hint="Con tu celular guardamos pedido, direcciones y comentarios."
              onSwitchPurpose={() => setAuthPurpose((p) => (p === 'login' ? 'register' : 'login'))}
              onSuccess={(data) => {
                if (!data.customer) return
                const cust: Customer = {
                  id: data.customer.id,
                  name: data.customer.name,
                  phone: data.customer.phone,
                  email: data.customer.email,
                  password: '',
                  address: data.customer.address,
                  photoUrl: data.customer.photoUrl,
                  createdAt: data.customer.createdAt,
                }
                setCustomerSession(cust, data.token, 'cliente')
                setCustomer(cust)
                setName(cust.name)
                setPhone(cust.phone)
                if (cust.address) setAddress(cust.address)
                void loadMyOrders()
                setPermsOpen(true)
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#f6f3ee]">
      <DevicePermissionsPrompt
        open={permsOpen}
        title="Activa ubicación y avisos"
        hint="Así te ubicamos para el delivery y te avisamos cuando el pedido cambie de estado."
        onSkip={() => {
          skipPermissionsPrompt(PERMS_SKIP_KEY)
          setPermsOpen(false)
        }}
        onActivate={async () => {
          await askDevicePermissions({
            requestLocation: () => requestOnce(true),
            notifyTitle: 'Avisos activos',
            notifyBody: 'Te avisamos cuando tu pedido avance.',
          })
          skipPermissionsPrompt(PERMS_SKIP_KEY)
          setPermsOpen(false)
        }}
      />
      <ConfirmLogout
        open={logoutOpen}
        name={customer.name}
        roleLabel="Cliente"
        accountId={customer.id}
        photoUrl={customer.photoUrl}
        tone="customer"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false)
          logout()
        }}
      />
      <div className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-3 px-3 pt-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={withBase('logo-lopez.png')}
            alt={state.settings.name}
            className="h-12 w-auto shrink-0 rounded-xl shadow-sm"
          />
          <p className="text-[10px] font-bold tracking-[0.2em] text-ember uppercase">App de pedidos</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <a
            href={`https://wa.me/${waNumber.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, soy cliente de Chifa-Pollería Lopez')}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] text-white shadow-sm"
            aria-label="WhatsApp"
            title="Escribir por WhatsApp"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.148-.67.15-.198.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </a>
          <button
            type="button"
            onClick={openCart}
            className="relative flex h-11 w-11 items-center justify-center rounded-full bg-ember text-white"
            aria-label="Carrito"
          >
            <ShoppingCart size={20} />
            {qty > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-black text-[#1a3d1a]">
                {qty}
              </span>
            ) : null}
          </button>
          {customer ? (
            <>
              <span className="hidden max-w-[8rem] truncate text-sm font-semibold text-ink/60 sm:inline">
                {customer.name.split(' ')[0]}
              </span>
              <button
                type="button"
                onClick={() => setLogoutOpen(true)}
                className="tap flex h-10 w-10 items-center justify-center rounded-full bg-ink/5"
                title="Cerrar sesión"
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAuthPurpose('login')
                setAuthOpen(true)
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-ember px-4 text-sm font-bold text-white"
            >
              <User size={16} /> Entrar
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4 pt-3 sm:px-5">
      {tab === 'inicio' || tab === 'promos' ? (
      <div className="mx-auto grid min-w-0 max-w-6xl gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="mb-4 rounded-2xl bg-gradient-to-r from-[#1a3d1a] to-[#2d5a2d] p-4 text-white shadow-lg">
            <p className="text-xs font-medium text-white/70">Entregar en</p>
            <p className="truncate text-sm font-bold">{address || addressHint || 'Selecciona tu dirección'}</p>
          </div>

          {/* Barra de búsqueda */}
          <div className="relative mb-4">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-12 pr-4 text-sm shadow-sm placeholder:text-gray-400 focus:border-ember focus:outline-none focus:ring-2 focus:ring-ember/20"
              placeholder="🔍 ¿Qué te provoca hoy?"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* Chips de filtro - Carrusel horizontal */}
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              type="button"
              onClick={() => { setCat('Todos'); setTab('promos') }}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                tab === 'promos' 
                  ? 'bg-gold text-[#1a3d1a] shadow-lg shadow-gold/30' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              🔥 Ofertas
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setCat(c); setTab('inicio') }}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                  cat === c && tab === 'inicio' 
                    ? 'bg-ember text-white shadow-lg shadow-[#1a3d1a]/30' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          {bestsellers.length > 0 && cat === 'Todos' && !q && tab === 'inicio' ? (
            <section className="mt-5">
              <h2 className="mb-3 text-lg font-bold text-gray-900">Más vendidos</h2>
              <ProductRail>
                {bestsellers.slice(0, 8).map((p) => (
                  <ProductCard key={`best-${p.id}`} product={p} onOpen={openProduct} compact />
                ))}
              </ProductRail>
            </section>
          ) : null}

          {myOrders.length > 0 && cat === 'Todos' && !q && tab === 'inicio' ? (
            <section className="mt-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Repetí lo que pediste</h2>
                <button
                  type="button"
                  onClick={() => setTab('pedidos')}
                  className="text-sm font-semibold text-ember"
                >
                  Ver historial
                </button>
              </div>
              <ProductRail>
                {myOrders
                  .slice(0, 6)
                  .flatMap((order) =>
                    order.items.slice(0, 1).map((item, idx) => {
                      const prod = state.products.find((p) => p.name === item.name)
                      if (!prod) return null
                      return (
                        <ProductCard
                          key={`repeat-${order.id}-${idx}`}
                          product={prod}
                          onOpen={openProduct}
                          compact
                        />
                      )
                    }),
                  )
                  .filter(Boolean)}
              </ProductRail>
            </section>
          ) : null}

          {/* Sección "Los mejores descuentos" (tab promos) */}
          {tab === 'promos' ? (
            <section className="mt-5">
              <div className="mb-4 rounded-2xl bg-gradient-to-r from-gold to-amber-400 p-4 text-[#1a3d1a] shadow-lg">
                <p className="text-2xl font-black">🔥 OFERTAS</p>
                <p className="mt-1 text-sm opacity-90">Aprovecha nuestros descuentos especiales</p>
              </div>
            </section>
          ) : null}

          {/* Título de categoría */}
          {cat !== 'Todos' && tab === 'inicio' && (
            <h2 className="mt-5 text-lg font-bold text-gray-900">{cat}</h2>
          )}

          {/* Productos en Grid */}
          <div className={`mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 ${qty > 0 ? 'pb-28 xl:pb-0' : 'pb-6'}`}>
            {(tab === 'promos' ? bestsellers : products).map((p) => (
              <ProductCard key={p.id} product={p} onOpen={openProduct} />
            ))}
          </div>
        </div>

        <aside className="card hidden h-fit p-5 xl:sticky xl:top-24 xl:block">
          <p className="mb-3 font-display text-xl tracking-tight">Ticket</p>
          {cartBody}
        </aside>
      </div>
      ) : null}

      {tab === 'pedidos' ? (
        <div className="mx-auto max-w-2xl">
          <PageTitle title="Mis pedidos" hint="Separa lo que está en camino de lo que ya te entregaron." />
          {!customer ? (
            <button
              type="button"
              className="btn-primary mt-6"
              onClick={() => {
                setAuthPurpose('login')
                setAuthOpen(true)
              }}
            >
              Ingresa para ver tu historial
            </button>
          ) : ordersBusy && myOrders.length === 0 ? (
            <p className="mt-6 text-sm text-ink/50">Cargando…</p>
          ) : myOrders.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-white p-5 text-sm text-ink/50 shadow-sm">
              Aún no tienes pedidos. Ve a la carta y arma el tuyo.
            </p>
          ) : (
            <div className="mt-5 space-y-7">
              {(() => {
                const inProgress = myOrders.filter((o) => isOrderInProgress(o.status))
                const delivered = myOrders.filter((o) => o.status === 'entregado')
                const cancelled = myOrders.filter((o) => o.status === 'cancelado')
                return (
                  <>
                    <section>
                      <div className="mb-3 flex items-center gap-2">
                        <Clock size={16} className="text-ember" />
                        <h2 className="text-base font-bold text-gray-900">En curso</h2>
                        <span className="rounded-full bg-ember/10 px-2 py-0.5 text-[11px] font-bold text-ember">
                          {inProgress.length}
                        </span>
                      </div>
                      {inProgress.length === 0 ? (
                        <p className="rounded-2xl bg-white p-4 text-sm text-ink/45 shadow-sm">
                          No tienes pedidos en camino.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {inProgress.map((o) => (
                            <MyOrderCard key={o.id} order={o} onOpen={openOrder} />
                          ))}
                        </ul>
                      )}
                    </section>
                    <section>
                      <div className="mb-3 flex items-center gap-2">
                        <Check size={16} className="text-ink/50" />
                        <h2 className="text-base font-bold text-gray-900">Entregados</h2>
                        <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-bold text-ink/50">
                          {delivered.length}
                        </span>
                      </div>
                      {delivered.length === 0 ? (
                        <p className="rounded-2xl bg-white p-4 text-sm text-ink/45 shadow-sm">
                          Todavía no hay entregas cerradas.
                        </p>
                      ) : (
                        <ul className="space-y-3">
                          {delivered.map((o) => (
                            <MyOrderCard key={o.id} order={o} onOpen={openOrder} />
                          ))}
                        </ul>
                      )}
                    </section>
                    {cancelled.length > 0 ? (
                      <section>
                        <h2 className="mb-3 text-base font-bold text-gray-900">Cancelados</h2>
                        <ul className="space-y-3">
                          {cancelled.map((o) => (
                            <MyOrderCard key={o.id} order={o} onOpen={openOrder} />
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </>
                )
              })()}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'perfil' ? (
        <div className="mx-auto max-w-2xl space-y-5">
          <PageTitle title="Perfil" hint="Tus datos y direcciones favoritas." />
          {!customer ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setAuthPurpose('login')
                setAuthOpen(true)
              }}
            >
              Ingresa a tu cuenta
            </button>
          ) : (
            <>
              <ProfilePhotoEditor
                customer={customer}
                onUpdate={(updated) => {
                  setCustomer(updated)
                  setCustomerSession(updated)
                }}
              />
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink/[0.04]">
                <p className="font-display text-2xl tracking-tight">{customer.name}</p>
                <p className="mt-1 text-sm text-ink/50">{customer.phone}</p>
                {locError ? <p className="mt-2 text-xs text-red-600">{locError}</p> : null}
                {addressHint ? (
                  <p className="mt-2 flex items-start gap-2 text-xs text-ink/60">
                    <MapPin size={14} className="mt-0.5 shrink-0 text-ember" />
                    Ubicación aproximada: {addressHint}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-ink/5 px-3 text-sm font-semibold"
                  onClick={() => void requestOnce()}
                >
                  <MapPin size={16} /> Actualizar ubicación
                </button>
              </div>
              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink/[0.04]">
                <p className="mb-3 text-sm font-bold text-ink/70">Direcciones guardadas</p>
                <CustomerAddressesPanel
                  reloadKey={addrReload}
                  onPick={(a) => {
                    setAddress(a.address)
                    if (a.lat != null) setAddressLat(a.lat)
                    if (a.lng != null) setAddressLng(a.lng)
                    setTab('inicio')
                    setCartOpen(true)
                  }}
                />
              </div>
            </>
          )}
        </div>
      ) : null}
      </div>

      {(tab === 'inicio' || tab === 'promos') ? (
        <button
          type="button"
          onClick={openCart}
          className="mx-3 mb-2 flex min-h-[3.25rem] shrink-0 items-center justify-between rounded-2xl bg-ember px-4 py-3 text-white shadow-xl xl:hidden"
        >
          <span className="inline-flex items-center gap-2 font-bold">
            <ShoppingCart size={18} />
            {qty > 0 ? `Carrito · ${qty}` : 'Carrito'}
          </span>
          <span className="font-display text-lg tracking-tight">{qty > 0 ? soles(sub) : 'Vacío'}</span>
        </button>
      ) : null}

      <nav className="safe-bottom shrink-0 border-t border-ink/10 bg-white/95">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {(
            [
              { id: 'inicio' as const, label: 'Inicio', Icon: Home },
              { id: 'promos' as const, label: 'Promos', Icon: TicketPercent },
              { id: 'pedidos' as const, label: 'Pedidos', Icon: ClipboardList },
              { id: 'perfil' as const, label: 'Perfil', Icon: User },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                if ((id === 'pedidos' || id === 'perfil') && !getCustomerSession() && !customer) {
                  setAuthPurpose('login')
                  setAuthOpen(true)
                }
                setTab(id)
              }}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${
                tab === id ? 'text-ember' : 'text-ink/40'
              }`}
            >
              <Icon size={20} strokeWidth={tab === id ? 2.5 : 2} />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {cartOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            onClick={() => setCartOpen(false)}
            aria-label="Cerrar"
          />
          <div className="absolute inset-x-0 bottom-0 z-10 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-2xl tracking-tight">Ticket</h2>
              <button
                type="button"
                className="tap flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.04]"
                onClick={() => setCartOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            {cartBody}
          </div>
        </div>
      ) : null}

      {modalProduct ? (
        <ProductModal
          product={modalProduct}
          suggestions={suggestionsFor(modalProduct)}
          onAdd={addFromModal}
          onAddSuggestion={(id) => {
            const p = state.products.find((x) => x.id === id)
            if (p) setModalProduct(p)
          }}
          onClose={() => setModalProduct(null)}
        />
      ) : null}

      <BottomSheet open={authOpen} onClose={() => setAuthOpen(false)} z={70}>
        <PhoneOtpLogin
          accountType="customer"
          purpose={authPurpose}
          showName={authPurpose === 'register'}
          title={authPurpose === 'register' ? 'Crea tu cuenta' : 'Ingresa para pedir'}
          hint="Con tu celular guardamos pedido, direcciones y comentarios."
          onSwitchPurpose={() => setAuthPurpose((p) => (p === 'login' ? 'register' : 'login'))}
          onSuccess={(data) => {
            if (!data.customer) return
            const cust: Customer = {
              id: data.customer.id,
              name: data.customer.name,
              phone: data.customer.phone,
              email: data.customer.email,
              password: '',
              address: data.customer.address,
              photoUrl: data.customer.photoUrl,
              createdAt: data.customer.createdAt,
            }
            setCustomerSession(cust, data.token, 'cliente')
            setCustomer(cust)
            setName(cust.name)
            setPhone(cust.phone)
            if (cust.address) setAddress(cust.address)
            setAuthOpen(false)
            void loadMyOrders()
            if (items.length > 0) setCartOpen(true)
          }}
        />
      </BottomSheet>
    </div>
  )
}

function ProfilePhotoEditor({
  customer,
  onUpdate,
}: {
  customer: Customer
  onUpdate: (c: Customer) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.name || 'Cliente')}&background=1a3d1a&color=ffd700&size=128&bold=true`

  const handleFile = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadAvatar(file)
      const r = await apiUpdateCustomerProfile({ photoUrl: url })
      onUpdate({ ...customer, photoUrl: r.customer.photoUrl })
    } catch {
      /* ignore */
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink/[0.04]">
      <div className="relative">
        <img
          src={customer.photoUrl || defaultAvatar}
          alt={customer.name}
          className="h-24 w-24 rounded-full object-cover ring-4 ring-ember/20"
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-ember text-white shadow disabled:opacity-50"
        >
          <Camera size={14} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
        />
      </div>
      {uploading ? <p className="mt-2 text-xs text-ink/50">Subiendo…</p> : null}
      <p className="mt-3 text-xs text-ink/50">Toca el ícono para cambiar foto</p>
    </div>
  )
}

