import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bike,
  CheckCircle2,
  LogOut,
  MapPinned,
  Navigation,
  Package,
  Phone,
  RefreshCw,
} from 'lucide-react'
import { PhoneOtpLogin } from '../components/PhoneOtpLogin'
import { ConfirmLogout } from '../components/ConfirmLogout'
import { defaultAvatarUrl, shortAccountId } from '../lib/avatar'
import {
  apiDriverClaim,
  apiDriverDelivered,
  apiDriverLocation,
  apiDriverMyOrders,
  apiDriverRelease,
  apiDriverRoute,
  setApiToken,
  type DriverDeliveryOrder,
} from '../lib/apiClient'
import { connectRealtime, onRealtimeEvent } from '../lib/realtime'
import { padOrder, soles } from '../lib/format'
import { APP_VERSION } from '../lib/version'
import { ensureWebNotifications, notifyWeb } from '../lib/webNotify'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { buildMultiStopUrl, openNavigation } from '../lib/mapsNav'
import { getPlataforma, mapsAppLabel, platformLabel } from '../lib/platform'

const DRIVER_KEY = 'polleria-driver-session'

type DriverSession = {
  id: string
  name: string
  phone: string
  vehicleInfo?: string
  photoUrl?: string
}

function loadSession(): DriverSession | null {
  try {
    const raw = localStorage.getItem(DRIVER_KEY)
    return raw ? (JSON.parse(raw) as DriverSession) : null
  } catch {
    return null
  }
}

export function ConductorApp() {
  const [driver, setDriver] = useState<DriverSession | null>(() => loadSession())
  const [mine, setMine] = useState<DriverDeliveryOrder[]>([])
  const [available, setAvailable] = useState<DriverDeliveryOrder[]>([])
  const [routeUrl, setRouteUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [notifyOn, setNotifyOn] = useState(false)
  const knownAvailable = useRef<Set<string>>(new Set())
  const primedAvail = useRef(false)
  const plataforma = getPlataforma()
  const mapsLabel = mapsAppLabel()

  const lastPush = useRef(0)
  const { coords, status: locStatus, error: locError, startWatch } = useDeviceLocation({
    auto: Boolean(driver),
    watch: Boolean(driver),
    enableHighAccuracy: true,
    onUpdate: (c) => {
      const now = Date.now()
      if (now - lastPush.current < 8000) return
      lastPush.current = now
      void apiDriverLocation(c.lat, c.lng)
    },
  })
  const locOk = locStatus === 'granted' && Boolean(coords)

  const logout = () => {
    localStorage.removeItem(DRIVER_KEY)
    setApiToken(null, 'driver')
    setDriver(null)
    setMine([])
    setAvailable([])
    setRouteUrl(null)
    setLogoutOpen(false)
  }

  const refresh = useCallback(async () => {
    if (!driver) return
    setLoading(true)
    setErr(null)
    try {
      const [orders, route] = await Promise.all([apiDriverMyOrders(), apiDriverRoute()])
      const avail = orders.available || []
      setMine(orders.mine || [])
      setAvailable(avail)
      const origin = {
        lat: route.origin?.lat,
        lng: route.origin?.lng,
        address: route.origin?.address,
      }
      const stops = (orders.mine || []).map((o) => ({
        lat: o.addressLat,
        lng: o.addressLng,
        address: o.address,
      }))
      setRouteUrl(buildMultiStopUrl(origin, stops) || route.googleMapsUrl)

      const ids = new Set(avail.map((o) => o.id))
      if (!primedAvail.current) {
        knownAvailable.current = ids
        primedAvail.current = true
      } else {
        for (const o of avail) {
          if (!knownAvailable.current.has(o.id)) {
            notifyWeb('Nueva entrega', `Pedido ${padOrder(o.number)} · ${o.customerName || 'cliente'}`, {
              tag: `driver-avail-${o.id}`,
            })
            break
          }
        }
        knownAvailable.current = ids
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [driver])

  useEffect(() => {
    if (!driver) return
    void refresh()
    connectRealtime(['delivery'])
    const off = onRealtimeEvent((event) => {
      if (
        event === 'order:created' ||
        event === 'order:status' ||
        event === 'order:driver' ||
        event === 'order:updated'
      ) {
        void refresh()
      }
    })
    const onReplaced = (ev: Event) => {
      const detail = (ev as CustomEvent<{ scope?: string; message?: string }>).detail
      if (detail?.scope && detail.scope !== 'driver') return
      alert(detail?.message || 'Sesión de conductor cerrada: iniciaste en otro dispositivo')
      localStorage.removeItem(DRIVER_KEY)
      setApiToken(null, 'driver')
      setDriver(null)
    }
    window.addEventListener('polleria-session-replaced', onReplaced)
    const t = window.setInterval(() => void refresh(), 30000)
    return () => {
      window.clearInterval(t)
      off()
      window.removeEventListener('polleria-session-replaced', onReplaced)
    }
  }, [driver, refresh])

  const enableNotify = async () => {
    const ok = await ensureWebNotifications()
    setNotifyOn(ok)
    if (ok) notifyWeb('Conductor listo', 'Te avisamos cuando haya entregas nuevas')
  }

  if (!driver) {
    return (
      <div className="min-h-dvh bg-[#0b1f17] px-4 py-10 text-white">
        <div className="mx-auto max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-600/30">
              <Bike size={32} className="text-teal-300" />
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">App Conductor</h1>
            <p className="mt-2 text-sm text-teal-100/70">
              Entra con tu celular · GPS en vivo · abre {mapsLabel} · el cliente ve tu ubicación.
            </p>
            <p className="mt-2 font-mono text-xs text-teal-200/50">
              /polleria/conductor · detectado: {platformLabel(plataforma)}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-5 text-gray-900 shadow-xl">
            <PhoneOtpLogin
              accountType="driver"
              purpose="login"
              title="Entrar"
              hint="Usa el celular registrado en Conductores. Te llega el código por WhatsApp."
              onSuccess={async (data) => {
                if (!data.token || !data.driver) throw new Error('Respuesta inválida')
                setApiToken(data.token, 'driver')
                const session: DriverSession = {
                  id: data.driver.id,
                  name: data.driver.name,
                  phone: data.driver.phone,
                  vehicleInfo: data.driver.vehicleInfo,
                  photoUrl: data.driver.photoUrl || defaultAvatarUrl(data.driver.name, 'driver'),
                }
                localStorage.setItem(DRIVER_KEY, JSON.stringify(session))
                setDriver(session)
              }}
            />
            <p className="mt-4 text-center text-sm text-gray-500">
              <Link to="/login" className="font-semibold text-teal-800 hover:underline">
                Volver al sistema del local
              </Link>
            </p>
          </div>
          <p className="mt-6 text-center text-[10px] text-teal-100/40">v{APP_VERSION}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#f3f6f4]">
      <ConfirmLogout
        open={logoutOpen}
        name={driver.name}
        roleLabel={driver.vehicleInfo || 'Conductor'}
        accountId={driver.id}
        photoUrl={driver.photoUrl || defaultAvatarUrl(driver.name, 'driver')}
        tone="driver"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={logout}
      />
      <header className="sticky top-0 z-20 border-b border-black/5 bg-[#0b1f17] px-4 py-3 text-white">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={driver.photoUrl || defaultAvatarUrl(driver.name, 'driver')}
              alt={driver.name}
              className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-teal-400/40"
            />
            <div className="min-w-0">
              <p className="truncate font-bold">{driver.name}</p>
              <p className="truncate font-mono text-[10px] tracking-wider text-teal-100/60">
                ID · {shortAccountId(driver.id)} · {driver.phone}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              className="rounded-xl p-2 text-teal-100/80 hover:bg-white/10"
              onClick={() => void refresh()}
              aria-label="Actualizar"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              className="rounded-xl p-2 text-teal-100/80 hover:bg-white/10"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 py-5 pb-28">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-teal-900 ring-1 ring-teal-200">
            {platformLabel(plataforma)}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold ${
              locOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }`}
          >
            {locOk
              ? `GPS OK · ${coords!.lat.toFixed(4)}, ${coords!.lng.toFixed(4)}`
              : locStatus === 'prompting'
                ? 'Pidiendo GPS…'
                : 'GPS pendiente'}
          </span>
          {!locOk ? (
            <button
              type="button"
              onClick={() => startWatch()}
              className="rounded-full bg-amber-500 px-3 py-1 text-[11px] font-bold text-white"
            >
              Activar ubicación
            </button>
          ) : null}
          {!notifyOn ? (
            <button
              type="button"
              onClick={() => void enableNotify()}
              className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-cream"
            >
              Activar avisos web
            </button>
          ) : (
            <span className="rounded-full bg-teal-100 px-3 py-1 text-[11px] font-bold text-teal-800">
              Avisos ON
            </span>
          )}
        </div>
        {locError ? <p className="text-xs text-amber-700">{locError}</p> : null}

        {err ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{err}</div>
        ) : null}

        {mine.length > 0 && routeUrl ? (
          <a
            href={routeUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 font-bold text-white shadow-lg shadow-teal-700/25"
          >
            <Navigation size={20} />
            Abrir ruta en {mapsLabel} ({mine.length})
          </a>
        ) : null}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Package size={18} className="text-teal-800" />
            <h2 className="font-bold text-gray-900">Mis entregas</h2>
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-800">
              {mine.length}
            </span>
          </div>
          {mine.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm text-gray-500 shadow-sm">
              Aún no tienes pedidos. Cuando cocina marque listo, aparecen abajo para tomar.
            </p>
          ) : (
            <div className="space-y-3">
              {mine.map((o, idx) => (
                <DeliveryCard
                  key={o.id}
                  order={o}
                  badge={`#${idx + 1}`}
                  busy={busyId === o.id}
                  onNavigate={() => {
                    openNavigation(
                      { lat: o.addressLat, lng: o.addressLng, address: o.address },
                      {
                        origin: coords
                          ? { lat: coords.lat, lng: coords.lng }
                          : undefined,
                        label: `Pedido ${padOrder(o.number)}`,
                      },
                    )
                  }}
                  navLabel={mapsLabel}
                  onRelease={async () => {
                    setBusyId(o.id)
                    try {
                      await apiDriverRelease(o.id)
                      await refresh()
                    } catch (e) {
                      alert((e as Error).message)
                    } finally {
                      setBusyId(null)
                    }
                  }}
                  onDelivered={async () => {
                    setBusyId(o.id)
                    try {
                      await apiDriverDelivered(o.id)
                      await refresh()
                    } catch (e) {
                      alert((e as Error).message)
                    } finally {
                      setBusyId(null)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <MapPinned size={18} className="text-amber-700" />
            <h2 className="font-bold text-gray-900">Disponibles para tomar</h2>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {available.length}
            </span>
          </div>
          {available.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm text-gray-500 shadow-sm">
              No hay encomiendas libres ahora.
            </p>
          ) : (
            <div className="space-y-3">
              {available.map((o) => (
                <article key={o.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl text-gray-900">{padOrder(o.number)}</p>
                      <p className="font-semibold">{o.customerName}</p>
                      <p className="mt-1 text-sm text-gray-500">{o.address}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {o.status === 'listo' ? 'Listo para salir' : 'En cocina'} · {soles(o.total)}
                        {o.paid ? '' : ' · cobrar'}
                      </p>
                    </div>
                    <button
                      disabled={busyId === o.id}
                      className="shrink-0 rounded-xl bg-amber-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                      onClick={async () => {
                        setBusyId(o.id)
                        try {
                          await apiDriverClaim(o.id)
                          await refresh()
                        } catch (e) {
                          alert((e as Error).message)
                        } finally {
                          setBusyId(null)
                        }
                      }}
                    >
                      Tomar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function DeliveryCard({
  order,
  badge,
  busy,
  onNavigate,
  onRelease,
  onDelivered,
  navLabel = 'Maps',
}: {
  order: DriverDeliveryOrder
  badge: string
  busy: boolean
  onNavigate: () => void
  onRelease: () => void
  onDelivered: () => void
  navLabel?: string
}) {
  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-teal-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white">
              {badge}
            </span>
            <p className="font-display text-xl">{padOrder(order.number)}</p>
          </div>
          <p className="mt-1 font-semibold">{order.customerName}</p>
          <p className="mt-1 text-sm text-gray-500">{order.address}</p>
          <p className="mt-1 text-xs text-gray-400">
            {soles(order.total)}
            {order.paid ? ' · pagado' : ' · cobrar en puerta'}
            {order.codPaymentMethod ? ` · ${order.codPaymentMethod}` : ''}
          </p>
        </div>
        {order.customerPhone ? (
          <a
            href={`tel:${order.customerPhone}`}
            className="rounded-xl bg-gray-100 p-2 text-gray-700"
            aria-label="Llamar"
          >
            <Phone size={18} />
          </a>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          disabled={busy}
          onClick={onNavigate}
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-teal-700 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Navigation size={16} /> {navLabel}
        </button>
        <button
          disabled={busy}
          onClick={onDelivered}
          className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-ink text-sm font-semibold text-cream disabled:opacity-50"
        >
          <CheckCircle2 size={16} /> Entregado
        </button>
      </div>
      <button
        disabled={busy}
        onClick={onRelease}
        className="mt-2 w-full text-center text-xs font-medium text-gray-400 hover:text-red-600"
      >
        Soltar pedido
      </button>
    </article>
  )
}
