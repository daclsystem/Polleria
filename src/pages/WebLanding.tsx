import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Clock,
  Flame,
  MapPin,
  Menu,
  Phone,
  Plus,
  Star,
  Truck,
  Utensils,
  X,
} from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { soles } from '../lib/format'
import { APP_VERSION } from '../lib/version'
import { BottomSheet } from '../components/BottomSheet'
import { PhoneOtpLogin } from '../components/PhoneOtpLogin'
import type { Customer, OrderItem } from '../types'
import {
  apiDeliveryQuote,
  apiGetBanners,
  apiGetWebsite,
  apiSaveCustomerAddress,
  apiValidateCoupon,
} from '../lib/apiClient'
import { CustomerAddressesPanel } from '../components/CustomerAddressesPanel'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { getPlataforma, platformLabel } from '../lib/platform'
import { getCustomerSession, setCustomerHome, setCustomerSession } from '../lib/customerSession'
import {
  DEFAULT_WEB_BANNERS,
  DEFAULT_WEB_SITE,
  mergeWebSite,
  normalizeBanners,
  type WebBanner,
  type WebHighlight,
  type WebSiteContent,
} from '../lib/webSite'
import { customerMenuUrl, withBase } from '../lib/paths'

function HighlightIcon({ icon }: { icon: WebHighlight['icon'] }) {
  const cls = 'text-[#1a3d1a]'
  if (icon === 'truck') return <Truck size={22} className={cls} />
  if (icon === 'clock') return <Clock size={22} className={cls} />
  if (icon === 'star') return <Star size={22} className={cls} />
  if (icon === 'flame') return <Flame size={22} className={cls} />
  if (icon === 'utensils') return <Utensils size={22} className={cls} />
  return <MapPin size={22} className={cls} />
}

export function WebLanding() {
  const { state, createOrder } = useStore()
  const navigate = useNavigate()
  const [banners, setBanners] = useState<WebBanner[]>(DEFAULT_WEB_BANNERS)
  const [site, setSite] = useState<WebSiteContent>(DEFAULT_WEB_SITE)

  useEffect(() => {
    void Promise.all([apiGetBanners(false), apiGetWebsite(false)])
      .then(([b, w]) => {
        setBanners(normalizeBanners(b.banners))
        setSite(mergeWebSite(w.site))
      })
      .catch(() => undefined)
  }, [])
  const [currentBanner, setCurrentBanner] = useState(0)
  const whatsappHref = `https://wa.me/${site.whatsappNumber.replace(/\D/g, '')}`
  const phoneHref = `tel:+${site.whatsappNumber.replace(/\D/g, '')}`
  const [activeCat, setActiveCat] = useState('Todos')
  const [items, setItems] = useState<OrderItem[]>([])
  const [, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [mode, setMode] = useState<'llevar' | 'delivery'>('delivery')
  const [name, setName] = useState('')
  const [phone, setPhoneVal] = useState('')
  const [address, setAddress] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [couponDiscount, setCouponDiscount] = useState(0)
  const [couponMsg, setCouponMsg] = useState<string | null>(null)
  const [addrReload, setAddrReload] = useState(0)
  const [saveAddrMsg, setSaveAddrMsg] = useState<string | null>(null)
  const [addressLat, setAddressLat] = useState<number | null>(null)
  const [addressLng, setAddressLng] = useState<number | null>(null)
  const [quotedFee, setQuotedFee] = useState<number | null>(null)
  const [quoteInfo, setQuoteInfo] = useState<string | null>(null)
  const [locBusy, setLocBusy] = useState(false)
  const [note, setNote] = useState('')
  const [pay, setPay] = useState<'yape' | 'efectivo'>('yape')
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authPurpose, setAuthPurpose] = useState<'login' | 'register'>('login')
  const menuRef = useRef<HTMLDivElement>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const plataforma = getPlataforma()
  const { requestOnce, reverseGeocode, error: locError } = useDeviceLocation({ auto: false })

  const applyCustomer = (cust: Customer) => {
    setCustomer(cust)
    setName(cust.name || '')
    setPhoneVal(cust.phone || '')
    if (cust.address) setAddress(cust.address)
  }

  useEffect(() => {
    const sess = getCustomerSession()
    if (sess) {
      setCustomerHome('web')
      applyCustomer(sess)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Pedidos solo en /cliente (app tipo PedidosYa). La web es vitrina. */
  const goToClienteApp = (productId?: string) => {
    window.location.assign(customerMenuUrl(productId ? { productId } : undefined))
  }

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
  const deliveryFee =
    mode === 'delivery' ? (quotedFee != null ? quotedFee : state.settings.deliveryFee) : 0
  const total = Math.max(0, subtotal + deliveryFee - couponDiscount)

  const detectMyLocation = async () => {
    setLocBusy(true)
    setQuoteInfo(null)
    try {
      const c = await requestOnce(false)
      setAddressLat(c.lat)
      setAddressLng(c.lng)
      const addr = await reverseGeocode(c.lat, c.lng)
      if (addr) setAddress(addr)
      else setAddress((prev) => prev || `Ubicación GPS (${c.lat.toFixed(5)}, ${c.lng.toFixed(5)})`)
      try {
        const q = (await apiDeliveryQuote({ lat: c.lat, lng: c.lng })) as {
          fee?: number
          distanceKm?: number
          timeMin?: number
          error?: string
        }
        if (typeof q.fee === 'number') {
          setQuotedFee(q.fee)
          setQuoteInfo(
            `${q.distanceKm?.toFixed(1) ?? '?'} km · ~${q.timeMin ?? '?'} min · ${platformLabel(plataforma)}`,
          )
        }
      } catch (e) {
        setQuotedFee(null)
        setQuoteInfo((e as Error).message || 'No se pudo cotizar delivery; se usa tarifa fija')
      }
    } catch {
      /* error en locError del hook */
    } finally {
      setLocBusy(false)
    }
  }

  /** Pedir: la web solo manda a /cliente. Login o sesión se resuelven allá. */
  const openProductModal = (id: string) => {
    goToClienteApp(id)
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
    let customerId = customer?.id
    try {
      if (!customerId) customerId = getCustomerSession()?.id
    } catch {}
    if (!customerId) {
      setAuthPurpose('login')
      setAuthOpen(true)
      return
    }
    try {
      const order = await createOrder({
        type: mode === 'delivery' ? 'delivery' : 'llevar',
        items: orderItems,
        customerName: name.trim() || customer?.name || 'Cliente',
        customerPhone: phone || customer?.phone,
        customerId,
        address: mode === 'delivery' ? address : undefined,
        addressLat: mode === 'delivery' && addressLat != null ? addressLat : undefined,
        addressLng: mode === 'delivery' && addressLng != null ? addressLng : undefined,
        discount: couponDiscount,
        couponCode: couponCode.trim() || undefined,
        paymentMethod: 'pendiente',
        paid: false,
        codPaymentMethod: pay,
        codCashAmount: pay === 'efectivo' ? total : undefined,
        notes: note || undefined,
        createdBy: 'Web',
        source: 'web',
        deliveryFee: mode === 'delivery' ? deliveryFee : 0,
        deliveryDistanceKm: undefined,
      })
      setItems([])
      setCheckoutOpen(false)
      setCartOpen(false)
      const tel = (phone || customer?.phone || '').replace(/\D/g, '').slice(-9)
      navigate(`/seguimiento/${order.id}${tel ? `?tel=${tel}` : ''}`)
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
              onClick={() => navigate(`/cuenta?track=${orderSuccess}`)}
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
      <nav className="web-nav fixed top-0 z-50 w-full border-b border-white/10 bg-[#0c2210]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="#inicio" className="flex items-center gap-3">
            <img
              src={withBase('logo-lopez.png')}
              alt={site.brandName}
              className="h-12 w-auto drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)] sm:h-14"
            />
          </a>
          <div className="hidden items-center gap-8 text-[0.8125rem] font-semibold tracking-wide text-white/70 lg:flex">
            <a href="#inicio" className="transition hover:text-[#ffd700]">Inicio</a>
            {site.sections.about ? <a href="#nosotros" className="transition hover:text-[#ffd700]">Nosotros</a> : null}
            {site.sections.menu ? (
              <button type="button" onClick={scrollToMenu} className="transition hover:text-[#ffd700]">
                Carta
              </button>
            ) : null}
            <button type="button" onClick={() => navigate('/reservar')} className="transition hover:text-[#ffd700]">
              Reservar
            </button>
            {site.sections.schedule ? <a href="#horarios" className="transition hover:text-[#ffd700]">Horarios</a> : null}
            {site.sections.locales ? <a href="#locales" className="transition hover:text-[#ffd700]">Locales</a> : null}
            {site.sections.contact ? <a href="#contacto" className="transition hover:text-[#ffd700]">Contacto</a> : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToClienteApp()}
              className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-sm font-bold text-white transition hover:bg-white/15"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <span className="hidden sm:inline">{customer ? customer.name.split(' ')[0] : 'Mi Cuenta'}</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white lg:hidden"
              aria-label="Menú"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </nav>

      {/* MOBILE NAV DRAWER */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Cerrar menú"
          />
          <div className="absolute right-0 top-0 flex h-full w-72 flex-col bg-[#0c2210] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
              <p className="font-display text-lg font-semibold text-[#ffd700]">{site.brandName}</p>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
              <a href="#inicio" onClick={() => setMobileNavOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                Inicio
              </a>
              {site.sections.about ? (
                <a href="#nosotros" onClick={() => setMobileNavOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                  Nosotros
                </a>
              ) : null}
              {site.sections.menu ? (
                <button type="button" onClick={() => { scrollToMenu(); setMobileNavOpen(false) }} className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                  Carta
                </button>
              ) : null}
              <button type="button" onClick={() => { navigate('/reservar'); setMobileNavOpen(false) }} className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                Reservar mesa
              </button>
              {site.sections.schedule ? (
                <a href="#horarios" onClick={() => setMobileNavOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                  Horarios
                </a>
              ) : null}
              {site.sections.locales ? (
                <a href="#locales" onClick={() => setMobileNavOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                  Locales
                </a>
              ) : null}
              {site.sections.contact ? (
                <a href="#contacto" onClick={() => setMobileNavOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                  Contacto
                </a>
              ) : null}
            </nav>
            <div className="border-t border-white/10 p-4">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false)
                  goToClienteApp()
                }}
                className="w-full rounded-xl bg-[#ffd700] py-3 text-sm font-bold text-[#0c2210]"
              >
                {customer ? `Hola, ${customer.name.split(' ')[0]}` : 'Mi Cuenta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HERO — marca primero, full-bleed */}
      <section id="inicio" className="relative min-h-[min(100dvh,920px)] overflow-hidden pt-[4.5rem]">
        <div
          className={`absolute inset-0 bg-gradient-to-br ${banners[currentBanner]?.bgGradient ?? 'from-[#0b2a0b] via-[#1a3d1a] to-[#0f4d2e]'} transition-all duration-1000`}
        />
        <div className="web-hero-grid absolute inset-0 opacity-40" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,215,0,0.14),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent" />
        <div className="absolute -left-24 bottom-10 h-72 w-72 rounded-full bg-[#ffd700]/10 blur-3xl web-float" />
        <div className="absolute -right-16 top-28 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl web-float-delayed" />

        <div className="relative z-10 mx-auto flex min-h-[calc(min(100dvh,920px)-4.5rem)] max-w-7xl flex-col items-center justify-center px-6 py-16 text-center sm:py-20">
          <img
            src={withBase('logo-lopez.png')}
            alt=""
            className="web-hero-logo mb-6 h-24 w-auto rounded-2xl shadow-[0_20px_50px_-20px_rgba(0,0,0,0.65)] sm:h-28"
          />
          <p className="font-display text-[clamp(2.35rem,6.5vw,4.25rem)] font-semibold leading-[1.05] tracking-normal text-[#ffd700]">
            {site.brandName}
          </p>
          <p className="mt-3 max-w-xl text-base font-medium text-white/70 sm:text-lg">{site.slogan}</p>
          <div className="mt-8 h-px w-16 bg-[#ffd700]/50" />
          <p className="mt-6 text-[0.7rem] font-bold tracking-[0.28em] text-[#ffd700]/90 uppercase">
            {site.heroEyebrow.replace(/^⭐\s*/, '')}
          </p>
          <h1 className="mt-3 max-w-4xl font-display text-[clamp(1.65rem,4vw,2.85rem)] font-semibold leading-snug text-white">
            {banners[currentBanner]?.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base text-white/65 sm:text-lg">
            {banners[currentBanner]?.subtitle}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            <button
              onClick={scrollToMenu}
              className="inline-flex items-center gap-2 rounded-full bg-[#ffd700] px-8 py-4 text-base font-extrabold text-[#0c2210] shadow-[0_12px_40px_-12px_rgba(255,215,0,0.55)] transition hover:scale-[1.03] hover:bg-[#ffe44d] sm:text-lg"
            >
              {banners[currentBanner]?.cta ?? 'Ver carta'}
              <ArrowRight size={20} />
            </button>
            <button
              onClick={() => navigate('/reservar')}
              className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-white/5 px-8 py-4 text-base font-bold text-white backdrop-blur-sm transition hover:border-white/55 hover:bg-white/15 sm:text-lg"
            >
              Reservar mesa
            </button>
          </div>
        </div>

        {banners.length > 1 ? (
          <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {banners.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Banner ${i + 1}`}
                onClick={() => setCurrentBanner(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === currentBanner ? 'w-10 bg-[#ffd700]' : 'w-2 bg-white/35 hover:bg-white/55'}`}
              />
            ))}
          </div>
        ) : null}
      </section>

      {/* INFO — franja tipográfica, sin chips */}
      <section className="border-b border-[#1a3d1a]/10 bg-[#f3f7f3]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-5 text-sm text-[#1a3d1a]/80 sm:justify-between sm:px-6">
          <p className="flex items-center gap-2 font-semibold">
            <Truck size={16} className="text-[#1a3d1a]" /> Delivery a domicilio
          </p>
          <p className="flex items-center gap-2 font-semibold">
            <Clock size={16} className="text-[#1a3d1a]" /> {site.schedule[0]?.hours || state.settings.hours}
          </p>
          <p className="flex items-center gap-2 font-semibold">
            <MapPin size={16} className="text-[#1a3d1a]" /> {site.branches.find((b) => b.active !== false)?.address || state.settings.address}
          </p>
          <p className="flex items-center gap-2 font-semibold">
            <Phone size={16} className="text-[#1a3d1a]" /> {site.phoneDisplay || state.settings.phone}
          </p>
        </div>
      </section>

      {/* QUÉ VENDEMOS */}
      {site.sections.highlights && site.highlights.length > 0 ? (
        <section className="relative overflow-hidden bg-white py-16 sm:py-20">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#1a3d1a]/15 to-transparent" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-[0.7rem] font-bold tracking-[0.22em] text-[#1a3d1a]/55 uppercase">En la mesa</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-normal text-[#0c2210] sm:text-4xl">
                Lo que nos pide Cañete
              </h2>
            </div>
            <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {site.highlights.map((h, idx) => (
                <div key={h.id} className="web-reveal group relative border-t border-[#1a3d1a]/15 pt-5" style={{ animationDelay: `${idx * 80}ms` }}>
                  <div className="mb-3 text-[#1a3d1a]/80 transition group-hover:text-[#1a3d1a]">
                    <HighlightIcon icon={h.icon} />
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#0c2210]">{h.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#1a3d1a]/65">{h.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* NOSOTROS */}
      {site.sections.about ? (
        <section id="nosotros" className="relative overflow-hidden bg-[#0f2410] py-20 text-white sm:py-24">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(255,215,0,0.12),transparent_50%)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="text-[0.7rem] font-bold tracking-[0.22em] text-[#ffd700]/80 uppercase">Nosotros</p>
              <h2 className="mt-3 font-display text-4xl font-semibold tracking-normal sm:text-5xl">{site.aboutTitle}</h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-green-100/85">{site.aboutText}</p>
              <p className="mt-5 font-display text-xl font-semibold text-[#ffd700]">{site.slogan}</p>
              <div className="mt-9 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={scrollToMenu}
                  className="inline-flex items-center gap-2 rounded-full bg-[#ffd700] px-6 py-3 text-sm font-extrabold text-[#0c2210]"
                >
                  Ver carta <ArrowRight size={16} />
                </button>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/10"
                >
                  WhatsApp
                </a>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-10 backdrop-blur-sm">
                <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-[#ffd700]/15 blur-2xl" />
                <img src={withBase('logo-lopez.png')} alt={site.brandName} className="relative h-28 w-auto rounded-2xl" />
                <p className="relative mt-8 font-display text-3xl font-semibold text-[#ffd700]">{site.brandName}</p>
                <div className="relative mt-4 flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} size={18} className="text-[#ffd700]" fill="currentColor" />
                  ))}
                </div>
                <p className="relative mt-4 text-sm text-green-100/70">Sazón de casa · Cañete</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* MENU */}
      {site.sections.menu ? (
      <section ref={menuRef} id="menu" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[0.7rem] font-bold tracking-[0.22em] text-[#1a3d1a]/55 uppercase">Nuestra carta</p>
          <h2 className="mt-2 font-display text-4xl font-semibold tracking-normal text-[#0c2210] sm:text-5xl">{site.menuTitle}</h2>
          <p className="mt-3 text-lg text-[#1a3d1a]/65">{site.menuSubtitle}</p>
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
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {products.map((p) => {
            const cartQty = items.filter((i) => i.productId === p.id).reduce((s, i) => s + i.qty, 0)
            return (
              <article
                key={p.id}
                onClick={() => openProductModal(p.id)}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                {p.tags && p.tags.length > 0 && (
                  <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
                    {p.tags.slice(0, 1).map((tag) => (
                      <span
                        key={tag}
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase shadow-sm ${
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
                {cartQty > 0 && (
                  <div className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#1a3d1a] text-[10px] font-bold text-white shadow-lg">
                    {cartQty}
                  </div>
                )}
                <div
                  className="flex aspect-[4/3] w-full items-center justify-center text-4xl transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `linear-gradient(135deg, ${p.tone}15, ${p.tone}08)` }}
                >
                  {p.emoji}
                </div>
                <div className="p-2.5">
                  <h3 className="line-clamp-1 text-[13px] font-bold text-gray-900">{p.name}</h3>
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-gray-500">{p.description || '\u00A0'}</p>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-sm font-black text-[#1a3d1a]">{soles(p.price)}</span>
                    {p.originalPrice && (
                      <span className="text-[10px] text-gray-400 line-through">{soles(p.originalPrice)}</span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openProductModal(p.id) }}
                    className="mt-1.5 flex h-8 w-full items-center justify-center gap-1 rounded-lg bg-[#1a3d1a] text-[11px] font-bold text-white shadow-sm transition hover:bg-green-800"
                  >
                    <Plus size={12} /> Pedir
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
      ) : null}


      {/* HORARIOS */}
      {site.sections.schedule ? (
      <section id="horarios" className="relative bg-[#f3f7f3] py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-[0.7rem] font-bold tracking-[0.22em] text-[#1a3d1a]/55 uppercase">Atención</p>
            <h2 className="mt-2 font-display text-4xl font-semibold tracking-normal text-[#0c2210] sm:text-5xl">
              {site.scheduleTitle}
            </h2>
            <p className="mt-3 text-lg text-[#1a3d1a]/65">{site.scheduleSubtitle}</p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[1.5rem] bg-[#1a3d1a]/10 sm:grid-cols-3">
            {site.schedule.map((row) => {
              const hoursText = row.closed ? 'Cerrado' : row.hours
              const waLink = !row.closed && row.linkWhatsApp
              return (
              <div key={row.id} className="bg-[#f3f7f3] px-6 py-8 text-center sm:bg-white">
                <p className="text-xs font-bold tracking-[0.18em] text-[#1a3d1a]/50 uppercase">{row.label}</p>
                {waLink ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block font-display text-2xl font-semibold text-[#1a3d1a] underline decoration-[#25D366]/50 underline-offset-4 transition hover:text-[#128C7E]"
                  >
                    {hoursText}
                  </a>
                ) : (
                  <p className={`mt-3 font-display text-2xl font-semibold ${row.closed ? 'text-red-600' : 'text-[#0c2210]'}`}>
                    {hoursText}
                  </p>
                )}
              </div>
              )
            })}
          </div>
        </div>
      </section>
      ) : null}

      {/* LOCALES */}
      {site.sections.locales ? (
      <section id="locales" className="relative overflow-hidden bg-[#0a1a0c] py-20 text-white sm:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_0%,rgba(255,215,0,0.12),transparent_45%)]" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-[0.7rem] font-bold tracking-[0.22em] text-[#ffd700]/75 uppercase">Visítanos</p>
            <h2 className="mt-2 font-display text-4xl font-semibold tracking-normal sm:text-5xl">{site.localesTitle}</h2>
            <p className="mt-3 text-lg text-green-200/80">{site.localesSubtitle}</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {site.branches.filter((b) => b.active !== false).map((br) => (
              <article
                key={br.id}
                className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-white/[0.07] to-transparent p-8 transition hover:border-[#ffd700]/35"
              >
                <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-[#ffd700]/10 blur-2xl transition group-hover:bg-[#ffd700]/20" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-2xl font-semibold text-[#ffd700]">{br.name}</h3>
                    <p className="mt-4 flex items-start gap-2 text-green-100/90">
                      <MapPin size={18} className="mt-0.5 shrink-0 text-[#ffd700]" />
                      {br.address}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-green-100/90">
                      <Clock size={18} className="text-[#ffd700]" />
                      {br.hours}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-green-100/90">
                      <Phone size={18} className="text-[#ffd700]" />
                      {br.phone}
                    </p>
                  </div>
                  <img src={withBase('logo-lopez.png')} alt="" className="h-14 w-auto rounded-xl opacity-90" />
                </div>
                <div className="relative mt-7 flex flex-wrap gap-3">
                  {br.mapUrl ? (
                    <a
                      href={br.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full bg-[#ffd700] px-5 py-2.5 text-sm font-extrabold text-[#0c2210]"
                    >
                      Cómo llegar
                    </a>
                  ) : null}
                  <a
                    href={`https://wa.me/${site.whatsappNumber.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/25 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
                  >
                    WhatsApp
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      ) : null}

      {/* CONTACTO */}
      {site.sections.contact ? (
      <section id="contacto" className="relative overflow-hidden bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="text-[0.7rem] font-bold tracking-[0.22em] text-[#1a3d1a]/55 uppercase">Contacto</p>
          <h2 className="mt-2 font-display text-4xl font-semibold tracking-normal text-[#0c2210] sm:text-5xl">
            {site.contactTitle}
          </h2>
          <p className="mt-3 text-lg text-[#1a3d1a]/65">{site.contactSubtitle}</p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-full bg-[#1a3d1a] px-8 py-4 text-base font-extrabold text-[#ffd700] shadow-[0_16px_40px_-16px_rgba(26,61,26,0.55)] transition hover:scale-[1.03]"
            >
              WhatsApp
            </a>
            <a
              href={phoneHref}
              className="inline-flex items-center gap-3 rounded-full border border-[#1a3d1a]/20 bg-[#f3f7f3] px-8 py-4 text-base font-extrabold text-[#0c2210] transition hover:border-[#1a3d1a]/40"
            >
              <Phone size={20} /> {site.phoneDisplay || 'Llamar'}
            </a>
          </div>
          {(site.facebookUrl || site.instagramUrl || site.tiktokUrl) ? (
            <div className="mt-8 flex flex-wrap items-center justify-center gap-5 text-sm font-semibold text-[#1a3d1a]/55">
              {site.facebookUrl ? (
                <a href={site.facebookUrl} target="_blank" rel="noopener noreferrer" className="transition hover:text-[#1a3d1a]">
                  Facebook
                </a>
              ) : null}
              {site.instagramUrl ? (
                <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer" className="transition hover:text-[#1a3d1a]">
                  Instagram
                </a>
              ) : null}
              {site.tiktokUrl ? (
                <a href={site.tiktokUrl} target="_blank" rel="noopener noreferrer" className="transition hover:text-[#1a3d1a]">
                  TikTok
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-[#0a1a0c] py-12">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
          <img src={withBase('logo-lopez.png')} alt="" className="mx-auto h-14 w-auto rounded-xl" />
          <p className="mt-5 font-display text-xl font-semibold text-[#ffd700]">{site.brandName}</p>
          <p className="mt-1 text-sm text-green-200/70">{site.slogan || state.settings.slogan}</p>
          <p className="mt-4 text-sm text-green-200/50">
            {state.settings.address} · {site.phoneDisplay || state.settings.phone}
          </p>
          <p className="mt-6 text-xs text-green-200/35">
            © {new Date().getFullYear()} {site.brandName}. Todos los derechos reservados. · v{APP_VERSION}
          </p>
        </div>
      </footer>

      <button
        type="button"
        onClick={() => navigate('/reservar')}
        className="fixed bottom-6 right-4 z-40 flex h-14 items-center gap-2 rounded-2xl bg-[#ffd700] px-5 text-sm font-black text-[#1a3d1a] shadow-2xl shadow-yellow-500/40 transition hover:scale-105 lg:hidden"
      >
        📅 Reservar Mesa
      </button>

      <BottomSheet open={authOpen} onClose={() => setAuthOpen(false)} z={60}>
        <button
          type="button"
          onClick={() => setAuthOpen(false)}
          className="absolute right-3 top-3 rounded-full p-2 hover:bg-gray-100"
        >
          <X size={20} />
        </button>
        <PhoneOtpLogin
          accountType="customer"
          purpose={authPurpose}
          showName={authPurpose === 'register'}
          title={authPurpose === 'register' ? 'Crea tu cuenta' : 'Ingresa con tu celular'}
          hint={
            authPurpose === 'register'
              ? 'Te registramos con tu número. Así guardamos tu historial de pedidos.'
              : 'Si aún no tienes cuenta, regístrate. El login es tu celular + código.'
          }
          onSwitchPurpose={() => setAuthPurpose((p) => (p === 'login' ? 'register' : 'login'))}
          onSuccess={(data) => {
            const src = data.customer
            if (!src) return
            const cust: Customer = {
              id: src.id,
              name: src.name,
              phone: src.phone,
              email: src.email,
              password: '',
              address: src.address,
              photoUrl: src.photoUrl,
              createdAt: src.createdAt,
            }
            try {
              setCustomerSession(cust, data.token, 'cliente')
              applyCustomer(cust)
            } finally {
              setAuthOpen(false)
              setCheckoutOpen(false)
              window.location.assign(customerMenuUrl())
            }
          }}
        />
      </BottomSheet>

      {/* CHECKOUT */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCheckoutOpen(false)} />
          <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
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

              <div className="rounded-2xl bg-gray-50 p-4 ring-1 ring-gray-100">
                <p className="text-xs font-bold tracking-wide text-gray-400 uppercase">Cuenta</p>
                <p className="mt-1 font-bold text-gray-900">{name || customer?.name}</p>
                <p className="text-sm text-gray-600">Celular · {phone || customer?.phone}</p>
                <p className="mt-1 text-xs text-gray-400">Tu historial queda ligado a este número.</p>
              </div>
              {mode === 'delivery' && (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-bold text-gray-700">Dirección de entrega *</label>
                    <span className="text-[10px] font-semibold text-gray-400">
                      {platformLabel(plataforma)}
                    </span>
                  </div>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value)
                      setAddressLat(null)
                      setAddressLng(null)
                      setQuotedFee(null)
                    }}
                    required
                    placeholder="Av. Principal 123, Distrito"
                  />
                  <button
                    type="button"
                    disabled={locBusy}
                    onClick={() => void detectMyLocation()}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1a3d1a] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                  >
                    <MapPin size={16} />
                    {locBusy ? 'Detectando ubicación…' : 'Usar mi ubicación GPS'}
                  </button>
                  {addressLat != null && addressLng != null ? (
                    <p className="mt-1.5 text-xs text-emerald-700">
                      GPS listo · {addressLat.toFixed(5)}, {addressLng.toFixed(5)}
                      {quoteInfo ? ` · ${quoteInfo}` : ''}
                    </p>
                  ) : null}
                  {locError ? <p className="mt-1 text-xs text-amber-700">{locError}</p> : null}
                  {customer && address.trim() ? (
                    <button
                      type="button"
                      className="mt-2 w-full rounded-xl border border-dashed border-green-700/40 py-2.5 text-sm font-bold text-green-800 hover:bg-green-50"
                      onClick={() => {
                        void (async () => {
                          try {
                            await apiSaveCustomerAddress({
                              label: 'Favorita',
                              address: address.trim(),
                              lat: addressLat,
                              lng: addressLng,
                              isDefault: true,
                            })
                            setAddrReload((n) => n + 1)
                            setSaveAddrMsg('Dirección guardada en favoritas')
                          } catch (e) {
                            setSaveAddrMsg((e as Error).message || 'No se pudo guardar')
                          }
                        })()
                      }}
                    >
                      ☆ Guardar como favorita
                    </button>
                  ) : null}
                  {saveAddrMsg ? <p className="mt-1 text-xs text-green-700">{saveAddrMsg}</p> : null}
                  {customer ? (
                    <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-gray-100">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Favoritas</p>
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

                  {quoteInfo && addressLat == null ? (
                    <p className="mt-1 text-xs text-amber-700">{quoteInfo}</p>
                  ) : null}
                </div>
              )}
              <div>
                <label className="text-sm font-bold text-gray-700">Indicaciones (opcional)</label>
                <input className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tocar timbre, dejar en portería..." />
              </div>

              <div>
                <label className="text-sm font-bold text-gray-700">Cupón de descuento</label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm uppercase focus:border-green-500 focus:outline-none"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponDiscount(0); setCouponMsg(null) }}
                    placeholder="BIENVENIDO10"
                  />
                  <button
                    type="button"
                    className="rounded-xl bg-[#1a3d1a] px-4 py-3 text-sm font-bold text-white"
                    onClick={async () => {
                      try {
                        const r = await apiValidateCoupon(couponCode, subtotal)
                        setCouponDiscount(r.discount)
                        setCouponMsg(`Descuento: ${soles(r.discount)}`)
                      } catch (e) {
                        setCouponDiscount(0)
                        setCouponMsg((e as Error).message || 'Cupón inválido')
                      }
                    }}
                  >
                    Aplicar
                  </button>
                </div>
                {couponMsg ? <p className="mt-1 text-xs text-green-700">{couponMsg}</p> : null}
                {couponDiscount > 0 ? (
                  <p className="mt-1 text-sm font-bold text-green-800">− {soles(couponDiscount)}</p>
                ) : null}
              </div>
              <div>
                <label className="text-sm font-bold text-gray-700">Pago al repartidor</label>
                <p className="mt-1 text-xs text-gray-500">
                  El pedido queda pendiente de liquidación; el repartidor cobrará en la entrega.
                </p>
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
