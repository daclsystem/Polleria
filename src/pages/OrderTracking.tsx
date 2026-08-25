import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChefHat,
  Clock,
  MapPin,
  Navigation,
  Package,
  ShoppingBag,
  Truck,
} from 'lucide-react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { API_URL } from '../lib/api'
import { soles } from '../lib/format'
import { ensureWebNotifications, notifyWeb } from '../lib/webNotify'
import { connectRealtime, onRealtimeEvent } from '../lib/realtime'
import { buildNavigationUrl } from '../lib/mapsNav'
import { getPlataforma, mapsAppLabel, platformLabel } from '../lib/platform'
import { useDeviceLocation } from '../hooks/useDeviceLocation'

const STORE: [number, number] = [-13.1083, -76.0114]
const TILE = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'

type TrackOrder = {
  id: string
  number: number
  type: string
  status: string
  customerName: string
  address?: string
  addressLat?: number
  addressLng?: number
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

const STATUS_NOTIFY: Record<string, string> = {
  en_cocina: 'Tu pedido se está preparando',
  listo: 'Tu pedido está listo / en camino',
  entregado: 'Pedido entregado. ¡Buen provecho!',
  cancelado: 'Tu pedido fue cancelado',
}

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

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 15)
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [36, 36] })
  }, [map, points])
  return null
}

export function OrderTracking() {
  const { orderId } = useParams()
  const [params] = useSearchParams()
  const tel = params.get('tel') || ''
  const [order, setOrder] = useState<TrackOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notifyOn, setNotifyOn] = useState(false)
  const [liveDriver, setLiveDriver] = useState<{ lat: number; lng: number } | null>(null)
  const plataforma = getPlataforma()
  const mapsLabel = mapsAppLabel()
  const { coords: myCoords, requestOnce, status: myLocStatus } = useDeviceLocation({ auto: false })

  const load = async () => {
    if (!orderId) {
      setError('Pedido no válido')
      setLoading(false)
      return
    }
    if (!API_URL) {
      setError('API no configurada')
      setLoading(false)
      return
    }
    try {
      const q = tel ? `?tel=${encodeURIComponent(tel.replace(/\D/g, ''))}` : ''
      const res = await fetch(`${API_URL}/api/orders/track/${orderId}${q}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      const next = data.order as TrackOrder
      setOrder((prev) => {
        if (prev && prev.status !== next.status && STATUS_NOTIFY[next.status]) {
          notifyWeb(`Pedido #${next.number}`, STATUS_NOTIFY[next.status], {
            tag: `track-${next.id}-${next.status}`,
          })
        }
        return next
      })
      if (next.driverLat != null && next.driverLng != null) {
        setLiveDriver({ lat: next.driverLat, lng: next.driverLng })
      }
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

  useEffect(() => {
    if (!orderId) return
    connectRealtime([`track:${orderId}`, 'delivery'])
    return onRealtimeEvent((event, payload) => {
      if (event !== 'driver:location') return
      const p = payload as { lat?: number; lng?: number; orderIds?: string[] }
      if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return
      if (p.orderIds && orderId && !p.orderIds.includes(orderId)) return
      setLiveDriver({ lat: p.lat, lng: p.lng })
      setOrder((prev) => (prev ? { ...prev, driverLat: p.lat, driverLng: p.lng } : prev))
    })
  }, [orderId])

  const enableNotify = async () => {
    const ok = await ensureWebNotifications()
    setNotifyOn(ok)
    if (ok) notifyWeb('Notificaciones activas', 'Te avisamos cuando cambie el estado del pedido')
  }

  const idx = useMemo(() => (order ? stepIndex(order.status) : 0), [order])
  const isDelivery = order?.type === 'delivery' || order?.type === 'web'
  const driverPos: [number, number] | null = liveDriver
    ? [liveDriver.lat, liveDriver.lng]
    : order?.driverLat != null && order?.driverLng != null
      ? [order.driverLat, order.driverLng]
      : null
  const destPos: [number, number] | null =
    order?.addressLat != null && order?.addressLng != null
      ? [order.addressLat, order.addressLng]
      : myCoords
        ? [myCoords.lat, myCoords.lng]
        : null

  const mapPoints = useMemo(() => {
    const pts: [number, number][] = [STORE]
    if (driverPos) pts.push(driverPos)
    if (destPos) pts.push(destPos)
    return pts
  }, [driverPos, destPos])

  const storeNavUrl = buildNavigationUrl(
    { lat: STORE[0], lng: STORE[1], address: 'Chifa-Pollería Lopez' },
    { label: 'Local' },
  )

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
        <p className="max-w-sm text-sm text-gray-500">
          Revisa el enlace de WhatsApp o pide el número de pedido en el local.
        </p>
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
        <p className="text-xs font-bold tracking-widest text-[#ffd700] uppercase">Seguimiento en vivo</p>
        <h1 className="mt-1 text-2xl font-black">Pedido #{order.number}</h1>
        <p className="mt-1 text-sm text-green-100/80">Hola {order.customerName}</p>
        <p className="mt-2 text-[11px] text-green-100/55">Dispositivo: {platformLabel(plataforma)}</p>
        {!notifyOn ? (
          <button
            type="button"
            onClick={() => void enableNotify()}
            className="mt-4 rounded-full bg-white/15 px-4 py-2 text-xs font-bold text-white ring-1 ring-white/25"
          >
            Activar avisos en este celular
          </button>
        ) : (
          <p className="mt-3 text-xs text-green-100/70">Avisos del navegador activos</p>
        )}
      </header>

      <main className="-mt-4 space-y-4 px-4 pb-10">
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
            <Clock size={12} /> Actualizado{' '}
            {new Date(order.updatedAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </section>

        {isDelivery && order.status !== 'cancelado' && order.status !== 'entregado' ? (
          <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                <MapPin size={16} className="text-[#1a3d1a]" />
                {driverPos ? 'Conductor en camino' : 'Mapa del pedido'}
              </div>
              <button
                type="button"
                onClick={() => void requestOnce(false)}
                className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-bold text-gray-700"
              >
                {myLocStatus === 'granted' ? 'Mi ubicación OK' : 'Mostrar mi ubicación'}
              </button>
            </div>
            <div className="h-56">
              <MapContainer center={driverPos || destPos || STORE} zoom={14} className="h-full w-full" scrollWheelZoom={false}>
                <TileLayer url={TILE} attribution="&copy; OSM &copy; CARTO" />
                <FitBounds points={mapPoints} />
                <Marker position={STORE} icon={icon('📍')}>
                  <Popup>Chifa-Pollería Lopez</Popup>
                </Marker>
                {destPos ? (
                  <Marker position={destPos} icon={icon('🏠')}>
                    <Popup>Tu dirección</Popup>
                  </Marker>
                ) : null}
                {driverPos ? (
                  <Marker position={driverPos} icon={icon('🛵')}>
                    <Popup>Conductor</Popup>
                  </Marker>
                ) : null}
              </MapContainer>
            </div>
            {order.address ? (
              <p className="border-t border-gray-100 px-4 py-3 text-sm text-gray-600">📍 {order.address}</p>
            ) : null}
            {!driverPos ? (
              <p className="px-4 pb-3 text-xs text-gray-400">
                Cuando el conductor active el GPS, lo verás moverse aquí en vivo.
              </p>
            ) : null}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {storeNavUrl ? (
            <a
              href={storeNavUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#1a3d1a] px-4 text-sm font-bold text-white"
            >
              <Navigation size={16} /> Cómo llegar ({mapsLabel})
            </a>
          ) : null}
        </div>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="font-black text-gray-900">Detalle del pedido</h2>
          <ul className="mt-3 space-y-2">
            {order.items.map((i, idxItem) => (
              <li key={idxItem} className="flex justify-between text-sm">
                <span>
                  {i.qty}× {i.name}
                </span>
                <span className="font-semibold">{soles(i.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
            <span className="font-bold">Total</span>
            <span className="font-display text-xl text-[#1a3d1a]">{soles(order.total)}</span>
          </div>
          {order.codPaymentMethod ? (
            <p className="mt-2 text-xs text-gray-500">Pago: {order.codPaymentMethod}</p>
          ) : null}
        </section>
      </main>
    </div>
  )
}
