import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Clock,
  LogOut,
  MapPin,
  Package,
  ShoppingBag,
  Truck,
} from 'lucide-react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore } from '../store/StoreContext'
import { soles } from '../lib/format'
import type { Customer, Order } from '../types'
import { RecoverAccountForm } from '../components/RecoverAccountForm'
import { ConfirmLogout } from '../components/ConfirmLogout'
import { defaultAvatarUrl, shortAccountId } from '../lib/avatar'

/** Sesión independiente del cliente web (no mezcla con staff) */
const CUST_KEY = 'polleria-customer-session'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILE_ATTR = '&copy; CARTO &copy; OSM'

const STORE_LOCATION: [number, number] = [-13.1083, -76.0114]

const STATUS_STEPS = [
  { key: 'nuevo', label: 'Pedido recibido', icon: ShoppingBag },
  { key: 'en_cocina', label: 'Preparando', icon: Clock },
  { key: 'listo', label: 'Listo', icon: Package },
  { key: 'entregado', label: 'Entregado', icon: Truck },
] as const

function statusIndex(status: string): number {
  const idx = STATUS_STEPS.findIndex((s) => s.key === status)
  return idx >= 0 ? idx : 0
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, map.getZoom())
  }, [center, map])
  return null
}

function createIcon(emoji: string, size = 36) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:${size}px;line-height:1">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  })
}

const storeIcon = createIcon('📍', 32)
const driverIcon = createIcon('🛵', 38)
const homeIcon = createIcon('🏠', 32)

export function WebAccount() {
  const { state, registerCustomer, loginCustomer, saveCustomerPassword } = useStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [tab, setTab] = useState<'orders' | 'tracking'>('orders')
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recover'>('login')
  const [form, setForm] = useState({ name: '', phone: '937493214', password: '', email: '', address: '' })
  const [error, setError] = useState('')
  const [logoutOpen, setLogoutOpen] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CUST_KEY) || localStorage.getItem('chifa-lopez-customer')
      if (raw) {
        const parsed = JSON.parse(raw) as Customer
        const fresh = (state.customers || []).find((c) => c.id === parsed.id)
        if (fresh) {
          setCustomer(fresh)
          localStorage.setItem(CUST_KEY, JSON.stringify(fresh))
          localStorage.removeItem('chifa-lopez-customer')
        }
      }
    } catch {}
  }, [state.customers])

  useEffect(() => {
    const orderId = searchParams.get('track')
    if (orderId) {
      setTrackingOrderId(orderId)
      setTab('tracking')
    }
  }, [searchParams])

  const myOrders = useMemo(() => {
    if (!customer) return []
    return state.orders
      .filter((o) => o.customerId === customer.id || o.customerPhone === customer.phone)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [customer, state.orders])

  const activeOrder = useMemo(() => {
    if (trackingOrderId) return state.orders.find((o) => o.id === trackingOrderId)
    return myOrders.find((o) => o.status !== 'entregado' && o.status !== 'cancelado')
  }, [trackingOrderId, myOrders, state.orders])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const cust = await loginCustomer(form.phone, form.password)
      if (cust) {
        setCustomer(cust)
        localStorage.setItem(CUST_KEY, JSON.stringify(cust))
      } else {
        setError('Teléfono o contraseña incorrectos')
      }
    } catch (err) {
      setError((err as Error).message || 'No se pudo iniciar sesión')
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.phone.trim() || !form.password.trim()) {
      setError('Completa los campos obligatorios')
      return
    }
    try {
      const cust = await registerCustomer({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        address: form.address.trim() || undefined,
      })
      setCustomer(cust)
      localStorage.setItem(CUST_KEY, JSON.stringify(cust))
    } catch (err) {
      setError((err as Error).message || 'No se pudo registrar')
    }
  }

  const logout = () => {
    setCustomer(null)
    localStorage.removeItem(CUST_KEY)
    setLogoutOpen(false)
  }

  if (!customer) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-green-50 via-white to-yellow-50 p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <button onClick={() => navigate('/web')} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-green-700 hover:underline">
              <ArrowLeft size={16} /> Volver a la tienda
            </button>
            <img src="/polleria/logo-lopez.png" alt="Logo" className="mx-auto h-20 w-auto rounded-2xl shadow-lg" />
            <h1 className="mt-4 text-2xl font-black text-gray-900">Mi Cuenta</h1>
            <p className="mt-1 text-sm text-gray-500">Inicia sesión para ver tus pedidos y hacer seguimiento</p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-xl ring-1 ring-gray-100">
            {authMode === 'recover' ? (
              <RecoverAccountForm
                accountType="customer"
                defaultPhone={form.phone}
                onBack={() => setAuthMode('login')}
                onLocalReset={(identifier, newPassword) =>
                  saveCustomerPassword(identifier, newPassword)
                }
              />
            ) : (
              <>
            <div className="mb-6 flex rounded-2xl bg-gray-100 p-1">
              <button
                onClick={() => { setAuthMode('login'); setError('') }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${authMode === 'login' ? 'bg-[#1a3d1a] text-[#ffd700] shadow' : 'text-gray-600'}`}
              >
                Iniciar Sesión
              </button>
              <button
                onClick={() => { setAuthMode('register'); setError('') }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition ${authMode === 'register' ? 'bg-[#1a3d1a] text-[#ffd700] shadow' : 'text-gray-600'}`}
              >
                Registrarme
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-gray-700">Número de celular</label>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    placeholder="999 111 222"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700">Contraseña</label>
                  <input
                    type="password"
                    className="mt-1.5 w-full rounded-xl border border-gray-200 px-4 py-3.5 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    placeholder="••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                </div>
                <button type="submit" className="w-full rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400">
                  Ingresar
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('recover')}
                  className="w-full text-center text-sm font-semibold text-green-800 hover:underline"
                >
                  ¿Olvidaste tu contraseña? Código por WhatsApp
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3">
                <div>
                  <label className="text-sm font-bold text-gray-700">Nombre completo *</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    placeholder="Juan Pérez"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700">Celular *</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    placeholder="999 111 222"
                    inputMode="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700">Contraseña *</label>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    placeholder="Mínimo 6 caracteres"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700">Email (opcional)</label>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    placeholder="correo@ejemplo.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700">Dirección (opcional)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    placeholder="Av. Principal 123"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
                <button type="submit" className="w-full rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400">
                  Crear Cuenta
                </button>
              </form>
            )}

            <p className="mt-4 text-center text-xs text-gray-400">
              Demo: teléfono <strong>987654321</strong> / contraseña <strong>123456</strong>
            </p>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <ConfirmLogout
        open={logoutOpen}
        name={customer.name}
        roleLabel="Cliente"
        accountId={customer.id}
        photoUrl={customer.photoUrl || defaultAvatarUrl(customer.name, 'customer')}
        tone="customer"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={logout}
      />
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#1a3d1a] shadow-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/web')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <ArrowLeft size={18} />
            </button>
            <img
              src={customer.photoUrl || defaultAvatarUrl(customer.name, 'customer')}
              alt={customer.name}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-[#ffd700]/50"
            />
            <div>
              <p className="text-sm font-bold text-[#ffd700]">Hola, {customer.name.split(' ')[0]}</p>
              <p className="font-mono text-[10px] tracking-wider text-green-300/80">
                ID · {shortAccountId(customer.id)} · {customer.phone}
              </p>
            </div>
          </div>
          <button
            onClick={() => setLogoutOpen(true)}
            className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20"
          >
            <LogOut size={14} /> Salir
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="sticky top-16 z-30 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl">
          <button
            onClick={() => { setTab('orders'); setTrackingOrderId(null) }}
            className={`flex flex-1 items-center justify-center gap-2 border-b-3 py-4 text-sm font-bold transition ${tab === 'orders' ? 'border-[#1a3d1a] text-[#1a3d1a]' : 'border-transparent text-gray-400'}`}
          >
            <ShoppingBag size={16} /> Mis Pedidos
          </button>
          <button
            onClick={() => setTab('tracking')}
            className={`flex flex-1 items-center justify-center gap-2 border-b-3 py-4 text-sm font-bold transition ${tab === 'tracking' ? 'border-[#1a3d1a] text-[#1a3d1a]' : 'border-transparent text-gray-400'}`}
          >
            <MapPin size={16} /> Seguimiento
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6">
        {tab === 'orders' && (
          <div className="space-y-4">
            {myOrders.length === 0 ? (
              <div className="flex flex-col items-center py-20 text-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
                  <ShoppingBag size={32} className="text-gray-300" />
                </div>
                <p className="mt-4 text-lg font-semibold text-gray-400">Aún no tienes pedidos</p>
                <button onClick={() => navigate('/web')} className="mt-4 font-bold text-green-700 hover:underline">
                  Hacer mi primer pedido
                </button>
              </div>
            ) : (
              myOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onTrack={() => { setTrackingOrderId(order.id); setTab('tracking') }}
                />
              ))
            )}
          </div>
        )}

        {tab === 'tracking' && (
          <TrackingView order={activeOrder} />
        )}
      </div>
    </div>
  )
}

function OrderCard({ order, onTrack }: { order: Order; onTrack: () => void }) {
  const statusColors: Record<string, string> = {
    nuevo: 'bg-blue-100 text-blue-700',
    en_cocina: 'bg-orange-100 text-orange-700',
    listo: 'bg-green-100 text-green-700',
    entregado: 'bg-gray-100 text-gray-600',
    cancelado: 'bg-red-100 text-red-600',
  }

  const statusLabels: Record<string, string> = {
    nuevo: 'Recibido',
    en_cocina: 'Preparando',
    listo: 'Listo',
    entregado: 'Entregado',
    cancelado: 'Cancelado',
  }

  const isActive = order.status !== 'entregado' && order.status !== 'cancelado'

  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ${isActive ? 'ring-green-200' : 'ring-gray-100'}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-gray-900">Pedido #{order.number}</span>
            {isActive && (
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {new Date(order.createdAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusColors[order.status]}`}>
          {statusLabels[order.status]}
        </span>
      </div>

      <div className="mt-3 space-y-1">
        {order.items.slice(0, 3).map((item, i) => (
          <p key={i} className="text-sm text-gray-600">{item.qty}× {item.name}</p>
        ))}
        {order.items.length > 3 && (
          <p className="text-sm text-gray-400">+{order.items.length - 3} más...</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-lg font-black text-[#1a3d1a]">{soles(order.total)}</span>
        {isActive && (
          <button
            onClick={onTrack}
            className="flex items-center gap-2 rounded-full bg-[#1a3d1a] px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-green-800"
          >
            <MapPin size={14} /> Seguir Pedido
          </button>
        )}
      </div>
    </div>
  )
}

function TrackingView({ order }: { order?: Order }) {
  const [driverPos, setDriverPos] = useState<[number, number] | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!order || order.type !== 'delivery' || order.status === 'entregado' || order.status === 'cancelado') {
      setDriverPos(null)
      return
    }

    const baseLat = order.driverLat ?? STORE_LOCATION[0] + (Math.random() - 0.5) * 0.01
    const baseLng = order.driverLng ?? STORE_LOCATION[1] + (Math.random() - 0.5) * 0.01
    setDriverPos([baseLat, baseLng])

    intervalRef.current = setInterval(() => {
      setDriverPos((prev) => {
        if (!prev) return prev
        return [
          prev[0] + (Math.random() - 0.5) * 0.0005,
          prev[1] + (Math.random() - 0.5) * 0.0005,
        ]
      })
    }, 3000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [order])

  if (!order) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
          <Truck size={32} className="text-gray-300" />
        </div>
        <p className="mt-4 text-lg font-semibold text-gray-400">No tienes pedidos activos para rastrear</p>
        <p className="mt-2 text-sm text-gray-400">Cuando hagas un pedido de delivery, podrás ver su ubicación aquí</p>
      </div>
    )
  }

  const step = statusIndex(order.status)
  const isDelivery = order.type === 'delivery'
  const mapCenter: [number, number] = driverPos || STORE_LOCATION

  return (
    <div className="space-y-5">
      {/* Progress Steps */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-gray-900">Pedido #{order.number}</h3>
          <span className="rounded-full bg-[#ffd700]/20 px-3 py-1 text-xs font-bold text-[#1a3d1a]">
            {isDelivery ? '🛵 Delivery' : '🏪 Recojo'}
          </span>
        </div>

        <div className="relative">
          <div className="absolute left-5 top-7 h-[calc(100%-3.5rem)] w-0.5 bg-gray-200" />
          <div
            className="absolute left-5 top-7 w-0.5 bg-[#1a3d1a] transition-all duration-500"
            style={{ height: `${(step / (STATUS_STEPS.length - 1)) * 100}%`, maxHeight: 'calc(100% - 3.5rem)' }}
          />
          <div className="space-y-6">
            {STATUS_STEPS.map((s, i) => {
              const Icon = s.icon
              const done = i <= step
              const current = i === step
              return (
                <div key={s.key} className="flex items-center gap-4">
                  <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition ${
                    current ? 'bg-[#1a3d1a] text-white shadow-lg shadow-green-900/30 ring-4 ring-green-100' :
                    done ? 'bg-[#1a3d1a] text-white' : 'bg-gray-100 text-gray-400'
                  }`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className={`text-sm font-bold ${done ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
                    {current && (
                      <p className="text-xs text-green-600 font-medium">Estado actual</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Map */}
      {isDelivery && order.status !== 'cancelado' && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center gap-2 border-b px-5 py-3">
            <MapPin size={16} className="text-green-700" />
            <h3 className="font-bold text-gray-900">Ubicación del repartidor</h3>
            {(order.status === 'en_cocina' || order.status === 'listo') && (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium text-green-600">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                En vivo
              </span>
            )}
          </div>
          <div className="h-[350px] w-full">
            <MapContainer
              center={mapCenter}
              zoom={15}
              scrollWheelZoom={true}
              className="h-full w-full"
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
              <MapUpdater center={mapCenter} />

              <Marker position={STORE_LOCATION} icon={storeIcon}>
                <Popup>
                  <strong>Chifa-Pollería Lopez</strong><br />
                  Tu pedido sale de aquí
                </Popup>
              </Marker>

              {driverPos && (
                <Marker position={driverPos} icon={driverIcon}>
                  <Popup>
                    <strong>🛵 Repartidor en camino</strong><br />
                    Pedido #{order.number}
                  </Popup>
                </Marker>
              )}

              {order.address && (
                <Marker
                  position={[
                    STORE_LOCATION[0] + (Math.random() * 0.005 - 0.0025),
                    STORE_LOCATION[1] + (Math.random() * 0.005 - 0.0025),
                  ]}
                  icon={homeIcon}
                >
                  <Popup>
                    <strong>📍 Tu dirección</strong><br />
                    {order.address}
                  </Popup>
                </Marker>
              )}
            </MapContainer>
          </div>
        </div>
      )}

      {/* Order Details */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
        <h3 className="font-bold text-gray-900">Detalle del pedido</h3>
        <ul className="mt-3 space-y-2">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between text-sm">
              <div>
                <span className="text-gray-700">{item.qty}× {item.name}</span>
                {item.selectedOptions && item.selectedOptions.length > 0 && (
                  <p className="text-xs text-gray-400">{item.selectedOptions.map((o) => o.name).join(', ')}</p>
                )}
              </div>
              <span className="font-bold text-gray-900">{soles(item.qty * item.price)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t pt-3">
          <div className="flex justify-between text-lg font-black">
            <span>Total</span>
            <span className="text-[#1a3d1a]">{soles(order.total)}</span>
          </div>
        </div>
        {order.address && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-green-50 p-3">
            <MapPin size={14} className="mt-0.5 text-green-700" />
            <p className="text-sm text-green-800">{order.address}</p>
          </div>
        )}
        {order.notes && (
          <p className="mt-2 text-sm text-gray-500 italic">📝 {order.notes}</p>
        )}
      </div>
    </div>
  )
}
