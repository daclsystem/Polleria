import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Navigation, RefreshCw } from 'lucide-react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  apiDriverArrived,
  apiDriverDelivered,
  apiDriverLocation,
  apiDriverMyOrders,
  apiDriverSettle,
  type DriverDeliveryOrder,
} from '../lib/apiClient'
import { OSM_TILE, STORE_COORDS, loadDriverSession } from '../lib/driverFlow'
import { padOrder } from '../lib/format'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { openInApp } from '../lib/mapsNav'
import { DeliveryCard } from './ConductorApp'

function pin(emoji: string) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:34px;line-height:1;filter:drop-shadow(0 4px 8px rgba(0,0,0,.25))">${emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
  })
}

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], 16)
      return
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 })
  }, [map, points])
  return null
}

export function DriverDeliveryMap() {
  const { orderId } = useParams()
  const driver = loadDriverSession()
  const [order, setOrder] = useState<DriverDeliveryOrder | null>(null)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)

  const lastPush = useRef(0)
  const { coords, startWatch } = useDeviceLocation({
    auto: Boolean(driver),
    watch: Boolean(driver),
    enableHighAccuracy: true,
    maximumAge: 20000,
    onUpdate: (c) => {
      const now = Date.now()
      if (now - lastPush.current < 20_000) return
      lastPush.current = now
      void apiDriverLocation(c.lat, c.lng, orderId)
    },
  })

  const load = useCallback(async () => {
    if (!orderId) return
    try {
      const r = await apiDriverMyOrders()
      const found = (r.mine || []).find((o) => o.id === orderId)
      if (!found) {
        setMissing(true)
        setOrder(null)
        return
      }
      setOrder(found)
    } catch {
      setMissing(true)
    }
  }, [orderId])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(t)
  }, [load])

  const dest: [number, number] | null =
    order?.addressLat != null && order?.addressLng != null
      ? [order.addressLat, order.addressLng]
      : null
  const me: [number, number] | null = coords ? [coords.lat, coords.lng] : null
  const points = useMemo(() => {
    const p: [number, number][] = [STORE_COORDS]
    if (dest) p.push(dest)
    if (me) p.push(me)
    return p
  }, [dest, me])

  if (!driver) return <Navigate to="/" replace />
  if (missing) return <Navigate to="/" replace />

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      await load()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-[#0b1f1c] text-white">
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={dest || me || STORE_COORDS}
          zoom={15}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer url={OSM_TILE} attribution="&copy; OpenStreetMap" />
          <Fit points={points} />
          <Marker position={STORE_COORDS} icon={pin('🍗')}>
            <Popup>Local Lopez</Popup>
          </Marker>
          {dest ? (
            <Marker position={dest} icon={pin('🏠')}>
              <Popup>{order?.address || 'Cliente'}</Popup>
            </Marker>
          ) : null}
          {me ? (
            <Marker position={me} icon={pin('🛵')}>
              <Popup>Tú</Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/55 to-transparent px-4 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center justify-between">
          <Link
            to="/"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-bold text-[#0b1f1c] shadow-lg"
          >
            <ArrowLeft size={16} /> Pedidos
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#0b1f1c] shadow-lg"
            aria-label="Actualizar"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {order ? (
          <div className="pointer-events-none mx-auto mt-3 max-w-lg">
            <p className="text-[11px] font-bold tracking-[0.18em] text-teal-200 uppercase">En ruta</p>
            <p className="font-display text-2xl tracking-tight">{padOrder(order.number)}</p>
            <p className="text-sm text-white/80">{order.customerName}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-white/70">Cargando pedido…</p>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 max-h-[58dvh] overflow-y-auto rounded-t-[1.75rem] bg-[#f4f5f7] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-ink shadow-[0_-16px_40px_rgba(0,0,0,.22)]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/15" />
        {order ? (
          <div className="mx-auto max-w-lg space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  openInApp(
                    'google',
                    { lat: order.addressLat, lng: order.addressLng, address: order.address },
                    { origin: coords ? { lat: coords.lat, lng: coords.lng } : undefined },
                  )
                }
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-[#0b1f1c] text-sm font-bold text-white"
              >
                <Navigation size={15} /> Maps
              </button>
              <button
                type="button"
                onClick={() =>
                  openInApp('waze', {
                    lat: order.addressLat,
                    lng: order.addressLng,
                    address: order.address,
                  })
                }
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-white text-sm font-bold text-[#0b1f1c] ring-1 ring-black/8"
              >
                <Navigation size={15} /> Waze
              </button>
            </div>
            <DeliveryCard
              order={order}
              badge="Ahora"
              busy={busy}
              compact
              onGoogle={() =>
                openInApp(
                  'google',
                  { lat: order.addressLat, lng: order.addressLng, address: order.address },
                  { origin: coords ? { lat: coords.lat, lng: coords.lng } : undefined },
                )
              }
              onWaze={() =>
                openInApp('waze', {
                  lat: order.addressLat,
                  lng: order.addressLng,
                  address: order.address,
                })
              }
              onArrived={() =>
                void run(async () => {
                  await apiDriverArrived(order.id)
                })
              }
              onDelivered={(photoUrl) =>
                void run(async () => {
                  await apiDriverDelivered(order.id, photoUrl)
                })
              }
              onSettle={(method, amount) =>
                void run(async () => {
                  await apiDriverSettle(order.id, { method, amount })
                })
              }
            />
          </div>
        ) : null}
        <button type="button" className="sr-only" onClick={() => startWatch()}>
          GPS
        </button>
      </div>
    </div>
  )
}
