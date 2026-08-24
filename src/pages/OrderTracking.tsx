import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  MapPin,
  Package,
  ShoppingBag,
  Truck,
} from 'lucide-react'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { API_URL } from '../lib/api'
import { soles } from '../lib/format'

const STORE: [number, number] = [-13.1083, -76.0114]
const TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

type TrackOrder = {
  id: string
  number: number
  type: string
  status: string
  customerName: string
  address?: string
  items: Array<{ name: string; qty: number; price: number }>
  total: number
  paid: boolean
  driverLat?: number
  driverLng?: number
  createdAt: string
  updatedAt: string
  codPaymentMethod?: string
}

const STEPS = [
  { key: 'nuevo', label: 'Pedido recibido', desc: 'Ya lo tenemos', icon: ShoppingBag },
  { key: 'en_cocina', label: 'Preparando', desc: 'En cocina', icon: ChefHat },
  { key: 'listo', label: 'Listo / en camino', desc: 'Sale a delivery o recojo', icon: Package },
  { key: 'entregado', label: 'Entregado', desc: '¡Buen provecho!', icon: Truck },
] as const

function stepIndex(status: string) {
  if (status === 'cancelado') return -1
  const i = STEPS.findIndex((s) => s.key === status)
  return i >= 0 ? i : 0
}

function icon(emoji: string) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:32px;line-height:1">${emoji}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  })
}

export function OrderTracking() {
  const { orderId } = useParams()
  const [params] = useSearchParams()
  const tel = params.get('tel') || ''
  const [order, setOrder] = useState<TrackOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!orderId || !API_URL) return
    try {
      const q = tel ? `?tel=${encodeURIComponent(tel)}` : ''
      const res = await fetch(`${API_URL}/api/orders/track/${orderId}${q}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setOrder(data.order as TrackOrder)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 8000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, tel])

  const idx = useMemo(() => (order ? stepIndex(order.status) : 0), [order])
  const isDelivery = order?.type === 'delivery' || order?.type === 'web'
  const driverPos: [number, number] | null =
    order?.driverLat != null && order?.driverLng != null
      ? [order.driverLat, order.driverLng]
      : null

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f6f7f9]">
        <p className="font-semibold text-gray-500">Cargando seguimiento…</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f6f7f9] p-6 text-center">
        <p className="text-lg font-bold text-gray-800">{error || 'Pedido no encontrado'}</p>
        <Link to="/web" className="rounded-full bg-[#1a3d1a] px-5 py-2.5 text-sm font-bold text-white">
          Ir a la carta
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#f6f7f9]">
      <header className="bg-[#1a3d1a] px-4 pb-8 pt-5 text-white">
        <Link to="/web" className="mb-4 inline-flex items-center gap-2 text-sm text-green-100/80">
          <ArrowLeft size={16} /> Volver
        </Link>
        <p className="text-xs font-bold tracking-widest text-[#ffd700] uppercase">Seguimiento</p>
        <h1 className="mt-1 text-2xl font-black">Pedido #{order.number}</h1>
        <p className="mt-1 text-sm text-green-100/80">Hola {order.customerName}</p>
      </header>

      <main className="-mt-4 space-y-4 px-4 pb-10">
        {/* Timeline */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          {order.status === 'cancelado' ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">Pedido cancelado</p>
          ) : (
            <ol className="space-y-4">
              {STEPS.map((s, i) => {
                const done = i <= idx
                const current = i === idx
                const Icon = s.icon
                return (
                  <li key={s.key} className="flex gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        done ? 'bg-[#1a3d1a] text-white' : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {done && i < idx ? <Check size={18} /> : <Icon size={18} />}
                    </div>
                    <div className="min-w-0 pt-1">
                      <p className={`font-bold ${current ? 'text-[#1a3d1a]' : done ? 'text-gray-800' : 'text-gray-400'}`}>
                        {s.label}
                      </p>
                      <p className="text-xs text-gray-500">{s.desc}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={12} /> Actualizado {new Date(order.updatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </section>

        {/* Map for delivery */}
        {isDelivery && order.status !== 'cancelado' && order.status !== 'entregado' ? (
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-gray-800">
              <MapPin size={16} className="text-[#1a3d1a]" />
              {driverPos ? 'Conductor en camino' : 'Mapa del local'}
            </div>
            <div className="h-56">
              <MapContainer center={driverPos || STORE} zoom={14} className="h-full w-full" scrollWheelZoom={false}>
                <TileLayer url={TILE} />
                <Marker position={STORE} icon={icon('📍')}>
                  <Popup>Chifa-Pollería Lopez</Popup>
                </Marker>
                {driverPos ? (
                  <Marker position={driverPos} icon={icon('🛵')}>
                    <Popup>Tu pedido</Popup>
                  </Marker>
                ) : null}
              </MapContainer>
            </div>
            {order.address ? (
              <p className="border-t border-gray-100 px-4 py-3 text-sm text-gray-600">📍 {order.address}</p>
            ) : null}
          </section>
        ) : null}

        {/* Detail */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-black text-gray-900">Detalle del pedido</h2>
          <ul className="mt-3 space-y-2">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {it.qty}× {it.name}
                </span>
                <span className="font-semibold text-gray-900">{soles(it.qty * it.price)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="text-sm font-bold text-gray-500">Total</span>
            <span className="text-xl font-black text-[#1a3d1a]">{soles(order.total)}</span>
          </div>
          {order.codPaymentMethod ? (
            <p className="mt-2 text-xs text-gray-500">Pago: {order.codPaymentMethod} · {order.paid ? 'Pagado' : 'Contra entrega'}</p>
          ) : null}
        </section>

        <p className="text-center text-xs text-gray-400">
          También te enviamos el estado por WhatsApp
        </p>
      </main>
    </div>
  )
}
