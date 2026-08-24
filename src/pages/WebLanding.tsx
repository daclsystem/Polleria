import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Clock,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShoppingCart,
  Star,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { soles } from '../lib/format'
import { APP_VERSION } from '../lib/version'
import { ProductModal } from '../components/ProductModal'
import type { OrderItem, Product } from '../types'
import { apiGetBanners } from '../lib/apiClient'

interface Banner {
  id: string
  title: string
  subtitle: string
  cta: string
  bgGradient: string
  active: boolean
}

const DEFAULT_BANNERS: Banner[] = [
  { id: 'b1', title: 'El Mejor Pollo de Cañete', subtitle: '¡Buenazo y económico! Crujiente por fuera, jugoso por dentro. El sabor que todos aman.', cta: 'Ver Menú', bgGradient: 'from-green-900 via-green-800 to-emerald-900', active: true },
  { id: 'b2', title: 'Nuevo Local Más Amplio', subtitle: 'Ahora con 2 locales para atenderte mejor. Ven con toda la familia y disfruta.', cta: 'Hacer Pedido', bgGradient: 'from-yellow-900 via-amber-900 to-orange-900', active: true },
  { id: 'b3', title: 'Chifa & Pollería en Uno', subtitle: 'Arroz chaufa, tallarín saltado, pollo a la brasa y mucho más. Todo en un solo lugar.', cta: 'Pedir Ahora', bgGradient: 'from-green-950 via-emerald-950 to-green-900', active: true },
]

export function WebLanding() {
  const { state, createOrder } = useStore()
  const navigate = useNavigate()
  const [banners, setBanners] = useState<Banner[]>(DEFAULT_BANNERS)

  useEffect(() => {
    void apiGetBanners(false)
      .then((r) => {
        const list = (r.banners as Banner[]) || []
        if (list.length) setBanners(list)
      })
      .catch(() => undefined)
  }, [])
  const [currentBanner, setCurrentBanner] = useState(0)
  const [activeCat, setActiveCat] = useState('Todos')
  const [items, setItems] = useState<OrderItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [mode, setMode] = useState<'llevar' | 'delivery'>('delivery')
  const [name, setName] = useState('')
  const [phone, setPhoneVal] = useState('937493214')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [pay, setPay] = useState<'yape' | 'efectivo'>('yape')
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null)
  const [modalProduct, setModalProduct] = useState<Product | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('chifa-lopez-customer')
      if (raw) {
        const cust = JSON.parse(raw)
        if (cust?.name && !name) setName(cust.name)
        if (cust?.phone && !phone) setPhoneVal(cust.phone)
        if (cust?.address && !address) setAddress(cust.address)
      }
    } catch {}
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (banners.length <= 1) return
    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [banners.length])

  const categories = useMemo(
    () => ['Todos', ...new Set(state.products.filter((p) => p.available).map((p) => p.category))],
    [state.products],
  )

  const products = state.products.filter(
    (p) => p.available && (activeCat === 'Todos' || p.category === activeCat),
  )

  const qty = items.reduce((s, i) => s + i.qty, 0)
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const deliveryFee = mode === 'delivery' ? state.settings.deliveryFee : 0
  const total = subtotal + deliveryFee

  const openProductModal = (id: string) => {
    const p = state.products.find((x) => x.id === id)
    if (!p) return
    if (p.optionGroups && p.optionGroups.length > 0) {
      setModalProduct(p)
    } else {
      addDirectly(p)
    }
  }

  const addDirectly = (p: Product) => {
    setItems((prev) => {
      const f = prev.find((i) => i.productId === p.id && !i.selectedOptions)
      if (f) return prev.map((i) => (i.productId === p.id && !i.selectedOptions ? { ...i, qty: i.qty + 1 } : i))
      return [...prev, { productId: p.id, name: p.name, qty: 1, price: p.price }]
    })
  }

  const addFromModal = (item: OrderItem) => {
    setItems((prev) => [...prev, item])
  }

  const addSuggestion = (productId: string) => {
    const p = state.products.find((x) => x.id === productId)
    if (!p) return
    if (p.optionGroups && p.optionGroups.length > 0) {
      setModalProduct(p)
    } else {
      addDirectly(p)
    }
  }

  const getSuggestions = (product: Product): Product[] => {
    const sameCat = state.products.filter(
      (p) => p.available && p.id !== product.id && p.category === product.category,
    )
    const otherPopular = state.products.filter(
      (p) => p.available && p.id !== product.id && p.category !== product.category && p.tags?.includes('Popular'),
    )
    const drinks = state.products.filter(
      (p) => p.available && p.category === 'Bebidas' && p.id !== product.id,
    )
    const combined = [...sameCat.slice(0, 2), ...drinks.slice(0, 2), ...otherPopular.slice(0, 1)]
    const unique = Array.from(new Map(combined.map((p) => [p.id, p])).values())
    return unique.slice(0, 4)
  }

  const remove = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateQty = (idx: number, delta: number) => {
    setItems((prev) =>
      prev
        .map((item, i) => (i === idx ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0),
    )
  }

  const scrollToMenu = () => {
    menuRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || items.length === 0) return
    const orderItems =
      mode === 'delivery' && deliveryFee > 0
        ? [...items, { productId: 'delivery', name: 'Delivery', qty: 1, price: deliveryFee }]
        : items
    let customerId: string | undefined
    try {
      const raw = localStorage.getItem('polleria-customer-session') || localStorage.getItem('chifa-lopez-customer')
      if (raw) {
        const cust = JSON.parse(raw)
        customerId = cust?.id
      }
    } catch {}
    try {
      const order = await createOrder({
        type: mode === 'delivery' ? 'delivery' : 'llevar',
        items: orderItems,
        customerName: name.trim(),
        customerPhone: phone,
        customerId,
        address: mode === 'delivery' ? address : undefined,
        discount: 0,
        paymentMethod: pay,
        paid: pay === 'yape',
        notes: note || undefined,
        createdBy: 'Web',
        source: 'web',
        deliveryFee: mode === 'delivery' ? deliveryFee : 0,
      })
      setItems([])
      setCheckoutOpen(false)
      setCartOpen(false)
      const tel = phone.replace(/\D/g, '').slice(-9)
      navigate(`/web/seguimiento/${order.id}${tel ? `?tel=${tel}` : ''}`)
    } catch (err) {
      alert((err as Error).message || 'No se pudo crear el pedido')
    }
  }

  if (orderSuccess) {
    const order = state.orders.find((o) => o.id === orderSuccess)
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-green-50 to-white p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
            <svg className="h-12 w-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-gray-900">¡Pedido Confirmado!</h1>
          <p className="mt-3 text-lg text-gray-600">
            Gracias <strong>{order?.customerName}</strong>
          </p>
          <p className="mt-1 text-gray-500">Tu pedido <strong>#{order?.number}</strong> ha sido recibido y está siendo preparado.</p>
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={() => navigate(`/web/cuenta?track=${orderSuccess}`)}
              className="rounded-2xl bg-green-700 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-green-700/30 hover:bg-green-800"
            >
              🗺️ Seguir mi Pedido en Mapa
            </button>
            <button
              onClick={() => setOrderSuccess(null)}
              className="rounded-2xl bg-gray-100 px-6 py-4 font-semibold text-gray-700 hover:bg-gray-200"
            >
              Hacer otro Pedido
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-white">
      {/* NAVBAR */}
      <nav className="fixed top-0 z-50 w-full bg-[#1a3d1a]/97 shadow-xl shadow-black/20 backdrop-blur-lg">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center">
            <img src="/polleria/logo-lopez.png" alt="Chifa Pollería Lopez" className="h-14 w-auto" />
          </div>
          <div className="hidden items-center gap-8 text-sm font-semibold text-white/80 lg:flex">
            <a href="#inicio" className="transition hover:text-[#ffd700]">Inicio</a>
            <button onClick={scrollToMenu} className="transition hover:text-[#ffd700]">Menú</button>
            <button onClick={() => navigate('/web/reservar')} className="transition hover:text-[#ffd700]">Reservar</button>
            <a href="#locales" className="transition hover:text-[#ffd700]">Locales</a>
            <a href="#contacto" className="transition hover:text-[#ffd700]">Contacto</a>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/web/cuenta')}
              className="flex h-11 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <span className="hidden sm:inline">Mi Cuenta</span>
            </button>
            <button
              onClick={() => setCartOpen(true)}
              className="relative flex h-11 items-center gap-2 rounded-full bg-[#ffd700] px-5 text-sm font-bold text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:scale-105 hover:bg-yellow-400"
            >
              <ShoppingCart size={18} />
              <span className="hidden sm:inline">Mi Pedido</span>
              {qty > 0 && (
                <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow">
                  {qty}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* HERO BANNER */}
      <section id="inicio" className="relative pt-[72px]">
        <div className={`relative overflow-hidden bg-gradient-to-br ${banners[currentBanner]?.bgGradient ?? 'from-green-900 to-emerald-900'} transition-all duration-1000`}>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMS41IiBmaWxsPSJyZ2JhKDI1NSwyMTUsMCwwLjA0KSIvPjwvc3ZnPg==')] opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="relative mx-auto flex min-h-[480px] max-w-7xl flex-col items-center justify-center px-6 py-20 text-center sm:min-h-[560px] sm:py-28">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#ffd700]/30 bg-[#ffd700]/10 px-4 py-1.5 text-sm font-semibold text-[#ffd700]">
              <Star size={14} fill="currentColor" /> El mejor pollo de Cañete
            </span>
            <h2 className="max-w-4xl text-4xl font-black leading-tight text-white sm:text-6xl lg:text-7xl">
              {banners[currentBanner]?.title}
            </h2>
            <p className="mt-5 max-w-2xl text-lg text-white/75 sm:text-xl">
              {banners[currentBanner]?.subtitle}
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={scrollToMenu}
                className="inline-flex items-center gap-2 rounded-full bg-[#ffd700] px-8 py-4 text-lg font-black text-[#1a3d1a] shadow-xl shadow-yellow-500/30 transition hover:scale-105 hover:bg-yellow-400"
              >
                {banners[currentBanner]?.cta ?? 'Ver Menú'}
                <ArrowRight size={20} />
              </button>
              <button
                onClick={() => navigate('/web/reservar')}
                className="inline-flex items-center gap-2 rounded-full border-2 border-white/30 bg-white/10 px-8 py-4 text-lg font-bold text-white backdrop-blur-sm transition hover:border-white/50 hover:bg-white/20"
              >
                📅 Reservar Mesa
              </button>
            </div>
          </div>
          {/* Banner indicators */}
          <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-2">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentBanner(i)}
                className={`h-2 rounded-full transition-all duration-300 ${i === currentBanner ? 'w-10 bg-[#ffd700]' : 'w-2 bg-white/40 hover:bg-white/60'}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* INFO BAR */}
      <section className="border-b border-green-100 bg-gradient-to-r from-green-50 via-white to-green-50 py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-6 px-4 text-sm sm:gap-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
              <Truck size={16} className="text-green-700" />
            </div>
            <span className="font-semibold text-gray-700">Delivery rápido</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
              <Clock size={16} className="text-green-700" />
            </div>
            <span className="font-semibold text-gray-700">{state.settings.hours}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
              <MapPin size={16} className="text-green-700" />
            </div>
            <span className="font-semibold text-gray-700">{state.settings.address}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
              <Phone size={16} className="text-green-700" />
            </div>
            <span className="font-semibold text-gray-700">{state.settings.phone}</span>
          </div>
        </div>
      </section>

      {/* MENU */}
      <section ref={menuRef} id="menu" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="text-center">
          <span className="text-sm font-bold tracking-widest text-green-700 uppercase">Nuestra Carta</span>
          <h2 className="mt-2 text-4xl font-black text-gray-900 sm:text-5xl">¿Qué se te antoja hoy?</h2>
          <p className="mt-3 text-lg text-gray-500">Elige tus platos favoritos y te los preparamos al instante</p>
        </div>

        {/* Categories */}
        <div className="mt-10 flex gap-2 overflow-x-auto pb-2 sm:justify-center">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`shrink-0 rounded-full px-6 py-3 text-sm font-bold transition-all ${
                activeCat === cat
                  ? 'bg-[#1a3d1a] text-[#ffd700] shadow-lg shadow-green-900/30'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product grid */}
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => {
            const cartQty = items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0)
            return (
              <article
                key={p.id}
                onClick={() => openProductModal(p.id)}
                className="group relative cursor-pointer overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                {/* Tags */}
                {p.tags && p.tags.length > 0 && (
                  <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1">
                    {p.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase shadow-sm ${
                          tag === 'Oferta' ? 'bg-red-500 text-white' :
                          tag === 'Nuevo' ? 'bg-blue-500 text-white' :
                          tag === 'Popular' ? 'bg-[#ffd700] text-[#1a3d1a]' :
                          'bg-green-100 text-green-800'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* Cart badge */}
                {cartQty > 0 && (
                  <div className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[#1a3d1a] text-xs font-bold text-white shadow-lg">
                    {cartQty}
                  </div>
                )}
                <div
                  className="flex h-44 items-center justify-center text-7xl transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `linear-gradient(135deg, ${p.tone}15, ${p.tone}08)` }}
                >
                  {p.emoji}
                </div>
                <div className="p-5">
                  <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">{p.description}</p>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-[#1a3d1a]">{soles(p.price)}</span>
                    {p.originalPrice && (
                      <span className="text-sm text-gray-400 line-through">{soles(p.originalPrice)}</span>
                    )}
                    {p.originalPrice && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                        -{Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100)}%
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openProductModal(p.id) }}
                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#1a3d1a] text-sm font-bold text-white shadow-lg shadow-green-900/20 transition hover:scale-[1.02] hover:bg-green-800"
                  >
                    <Plus size={16} /> Agregar al pedido
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {/* LOCALES */}
      <section id="locales" className="bg-[#1a3d1a] py-20 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <span className="text-sm font-bold tracking-widest text-[#ffd700] uppercase">Visítanos</span>
              <h2 className="mt-3 text-4xl font-black">Nuestros Locales</h2>
              <p className="mt-3 text-lg text-green-200">2 locales en Cañete para atenderte mejor</p>
              <div className="mt-8 space-y-5">
                <div className="flex items-start gap-4 rounded-2xl bg-white/5 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ffd700]/20">
                    <MapPin size={20} className="text-[#ffd700]" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Dirección</p>
                    <p className="text-green-200">{state.settings.address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 rounded-2xl bg-white/5 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ffd700]/20">
                    <Clock size={20} className="text-[#ffd700]" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Horario</p>
                    <p className="text-green-200">{state.settings.hours}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 rounded-2xl bg-white/5 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ffd700]/20">
                    <Phone size={20} className="text-[#ffd700]" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Teléfono / WhatsApp</p>
                    <p className="text-green-200">{state.settings.phone}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 rounded-2xl bg-white/5 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#ffd700]/20">
                    <Truck size={20} className="text-[#ffd700]" />
                  </div>
                  <div>
                    <p className="font-bold text-white">Delivery</p>
                    <p className="text-green-200">Envío: {soles(state.settings.deliveryFee)} · Pedidos por WhatsApp o Web</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-3xl bg-white/5 p-10 backdrop-blur-sm">
              <img src="/polleria/logo-lopez.png" alt="Chifa Pollería Lopez" className="h-32 w-auto rounded-2xl" />
              <h3 className="mt-6 text-center text-2xl font-black text-[#ffd700]">CHIFA - POLLERÍA LOPEZ</h3>
              <p className="mt-2 text-center text-green-200">El mejor pollo de Cañete</p>
              <div className="mt-6 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star key={s} size={20} className="text-[#ffd700]" fill="currentColor" />
                ))}
              </div>
              <p className="mt-2 text-sm text-green-300">La preferida de Cañete</p>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACTO */}
      <section id="contacto" className="py-20">
        <div className="mx-auto max-w-4xl px-4 text-center">
          <span className="text-sm font-bold tracking-widest text-green-700 uppercase">Contáctanos</span>
          <h2 className="mt-3 text-4xl font-black text-gray-900">¿Tienes alguna consulta?</h2>
          <p className="mt-3 text-lg text-gray-500">Escríbenos o llámanos. ¡Estamos para servirte!</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://wa.me/51937493214"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-2xl bg-green-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-green-600/30 transition hover:scale-105 hover:bg-green-700"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
            <a
              href={`tel:+51937493214`}
              className="inline-flex items-center gap-3 rounded-2xl bg-[#1a3d1a] px-8 py-4 text-lg font-bold text-white shadow-lg shadow-green-900/30 transition hover:scale-105 hover:bg-green-900"
            >
              <Phone size={22} /> Llamar
            </a>
            <a
              href="https://www.facebook.com/profile.php?id=61586064026668"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-2xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg shadow-blue-600/30 transition hover:scale-105 hover:bg-blue-700"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Facebook
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#1a3d1a] py-10">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <img src="/polleria/logo-lopez.png" alt="Logo" className="mx-auto h-16 w-auto rounded-lg" />
          <p className="mt-4 text-lg font-black text-[#ffd700]">CHIFA - POLLERÍA LOPEZ</p>
          <p className="mt-1 text-green-300">{state.settings.slogan}</p>
          <p className="mt-4 text-sm text-green-400">{state.settings.address} | {state.settings.phone}</p>
          <p className="mt-4 text-xs text-green-500">© {new Date().getFullYear()} Chifa-Pollería Lopez. Todos los derechos reservados. · v{APP_VERSION}</p>
        </div>
      </footer>

      {/* FLOATING CART (mobile) */}
      {qty > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-6 left-1/2 z-40 flex h-14 w-[min(90vw,22rem)] -translate-x-1/2 items-center justify-between rounded-2xl bg-[#1a3d1a] px-5 text-white shadow-2xl shadow-green-900/50 transition hover:scale-[1.02] sm:left-auto sm:right-6 sm:w-auto sm:translate-x-0"
        >
          <span className="inline-flex items-center gap-2 font-bold">
            <ShoppingCart size={18} className="text-[#ffd700]" />
            {qty} {qty === 1 ? 'ítem' : 'ítems'}
          </span>
          <span className="ml-4 rounded-full bg-[#ffd700] px-4 py-1.5 text-sm font-black text-[#1a3d1a]">{soles(subtotal)}</span>
        </button>
      )}

      {/* FLOATING RESERVE BUTTON (mobile, when cart is empty) */}
      {qty === 0 && !cartOpen && (
        <button
          onClick={() => navigate('/web/reservar')}
          className="fixed bottom-6 right-4 z-40 flex h-14 items-center gap-2 rounded-2xl bg-[#ffd700] px-5 text-sm font-black text-[#1a3d1a] shadow-2xl shadow-yellow-500/40 transition hover:scale-105 lg:hidden"
        >
          📅 Reservar Mesa
        </button>
      )}

      {/* CART DRAWER */}
      {cartOpen && (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-6 py-5">
              <h2 className="text-2xl font-black text-gray-900">Tu Pedido</h2>
              <button onClick={() => setCartOpen(false)} className="rounded-full p-2 hover:bg-gray-100">
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                    <ShoppingCart size={32} className="text-gray-300" />
                  </div>
                  <p className="mt-5 text-lg font-semibold text-gray-400">Tu carrito está vacío</p>
                  <button onClick={() => setCartOpen(false)} className="mt-4 font-bold text-green-700 hover:underline">
                    Explorar Menú
                  </button>
                </div>
              ) : (
                <ul className="space-y-3">
                  {items.map((item, idx) => (
                    <li key={idx} className="rounded-2xl bg-gray-50 p-4">
                      <div className="flex gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-gray-900">{item.name}</p>
                          {item.selectedOptions && item.selectedOptions.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.selectedOptions.map((opt) => (
                                <span key={`${opt.groupId}-${opt.optionId}`} className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                                  {opt.name}{opt.price > 0 ? ` +${soles(opt.price)}` : ''}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.notes && (
                            <p className="mt-1 text-xs text-gray-500 italic">📝 {item.notes}</p>
                          )}
                          <p className="mt-1 text-sm font-semibold text-green-700">{soles(item.price * item.qty)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQty(idx, -1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow hover:bg-gray-100">
                            <Minus size={13} />
                          </button>
                          <span className="w-5 text-center font-bold">{item.qty}</span>
                          <button onClick={() => updateQty(idx, 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a3d1a] text-white hover:bg-green-800">
                            <Plus size={13} />
                          </button>
                          <button onClick={() => remove(idx)} className="ml-1 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {items.length > 0 && (
              <div className="border-t px-6 py-5">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span>
                  <span className="font-semibold">{soles(subtotal)}</span>
                </div>
                <div className="mt-3 flex justify-between text-xl font-black">
                  <span>Total</span>
                  <span className="text-[#1a3d1a]">{soles(subtotal)}</span>
                </div>
                <button
                  onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}
                  className="mt-5 w-full rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400"
                >
                  Continuar con el Pedido →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {modalProduct && (
        <ProductModal
          product={modalProduct}
          suggestions={getSuggestions(modalProduct)}
          onAdd={addFromModal}
          onAddSuggestion={addSuggestion}
          onClose={() => setModalProduct(null)}
        />
      )}


      {/* CHECKOUT */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCheckoutOpen(false)} />
          <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-black">Finalizar Pedido</h2>
              <button onClick={() => setCheckoutOpen(false)} className="rounded-full p-2 hover:bg-gray-100">
                <X size={22} />
              </button>
            </div>

            <div className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-100">
              <p className="text-sm font-bold text-green-800">Resumen · {qty} productos</p>
              <ul className="mt-3 space-y-2">
                {items.map((i, idx) => (
                  <li key={idx} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">{i.qty}× {i.name}</span>
                      <span className="font-bold text-gray-900">{soles(i.qty * i.price)}</span>
                    </div>
                    {i.selectedOptions && i.selectedOptions.length > 0 && (
                      <p className="mt-0.5 pl-4 text-xs text-gray-500">
                        {i.selectedOptions.map((o) => o.name).join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {mode === 'delivery' && deliveryFee > 0 && (
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-gray-600">Delivery</span>
                  <span className="font-bold">{soles(deliveryFee)}</span>
                </div>
              )}
              <div className="mt-3 border-t border-green-200 pt-3">
                <div className="flex justify-between text-lg font-black">
                  <span>Total</span>
                  <span className="text-[#1a3d1a]">{soles(total)}</span>
                </div>
              </div>
            </div>

            <form onSubmit={send} className="mt-6 space-y-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setMode('delivery')}
                  className={`flex-1 rounded-2xl py-3.5 text-sm font-bold transition ${mode === 'delivery' ? 'bg-[#1a3d1a] text-[#ffd700] shadow-md' : 'bg-gray-100 text-gray-600'}`}
                >
                  🛵 Delivery (+{soles(state.settings.deliveryFee)})
                </button>
                <button type="button" onClick={() => setMode('llevar')}
                  className={`flex-1 rounded-2xl py-3.5 text-sm font-bold transition ${mode === 'llevar' ? 'bg-[#1a3d1a] text-[#ffd700] shadow-md' : 'bg-gray-100 text-gray-600'}`}
                >
                  🏪 Recojo en Local
                </button>
              </div>

              <div>
                <label className="text-sm font-bold text-gray-700">Tu nombre *</label>
                <input className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nombre completo" />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700">Celular *</label>
                <input className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" value={phone} onChange={(e) => setPhoneVal(e.target.value)} required inputMode="tel" placeholder="937493214" />
              </div>
              {mode === 'delivery' && (
                <div>
                  <label className="text-sm font-bold text-gray-700">Dirección de entrega *</label>
                  <input className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="Av. Principal 123, Distrito" />
                </div>
              )}
              <div>
                <label className="text-sm font-bold text-gray-700">Indicaciones (opcional)</label>
                <input className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tocar timbre, dejar en portería..." />
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700">Método de pago</label>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => setPay('yape')}
                    className={`flex-1 rounded-xl py-3.5 text-sm font-bold transition ${pay === 'yape' ? 'bg-purple-600 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}
                  >
                    💜 Yape / Plin
                  </button>
                  <button type="button" onClick={() => setPay('efectivo')}
                    className={`flex-1 rounded-xl py-3.5 text-sm font-bold transition ${pay === 'efectivo' ? 'bg-green-700 text-white shadow-md' : 'bg-gray-100 text-gray-600'}`}
                  >
                    💵 Efectivo
                  </button>
                </div>
              </div>
              <button type="submit" className="w-full rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:scale-[1.02] hover:bg-yellow-400">
                Confirmar Pedido · {soles(total)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
