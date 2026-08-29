import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bike,
  Camera,
  CheckCircle2,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquare,
  Navigation,
  Phone,
  RefreshCw,
  Wallet,
} from 'lucide-react'
import { PhoneOtpLogin } from '../components/PhoneOtpLogin'
import { ConfirmLogout } from '../components/ConfirmLogout'
import { Empty, PageTitle } from '../components/ui'
import { defaultAvatarUrl, shortAccountId } from '../lib/avatar'
import {
  apiDriverArrived,
  apiDriverDelivered,
  apiDriverLocation,
  apiDriverMyOrders,
  apiDriverRoute,
  apiDriverSettle,
  setApiToken,
  type DriverDeliveryOrder,
} from '../lib/apiClient'
import { connectRealtime, onRealtimeEvent } from '../lib/realtime'
import { padOrder, soles } from '../lib/format'
import { APP_VERSION } from '../lib/version'
import { ensureWebNotifications, notifyWeb } from '../lib/webNotify'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { buildMultiStopUrl, buildWazeForStops, openInApp } from '../lib/mapsNav'
import { getPlataforma, platformLabel } from '../lib/platform'
import { uploadDeliveryPhoto } from '../lib/minio'

const DRIVER_KEY = 'polleria-driver-session'

function digitsPhone(phone?: string | null) {
  return String(phone || '').replace(/\D/g, '')
}

function whatsappPhone(phone?: string | null) {
  let d = digitsPhone(phone)
  if (d.length === 9 && d.startsWith('9')) d = `51${d}`
  return d
}

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

type DriverAction = 'ubicado' | 'entregado' | 'liquidar' | 'listo'

function driverAction(o: DriverDeliveryOrder): DriverAction {
  if (o.driverSettledAt) return 'listo'
  // Si ya estaba pagado (web), repartidor no liquida - lo hace caja
  if (o.status === 'entregado' && o.paid) return 'listo'
  if (o.status === 'entregado') return 'liquidar'
  if (o.driverArrivedAt) return 'entregado'
  return 'ubicado'
}

const FLOW_STEPS = [
  { key: 'en_camino', label: 'En camino' },
  { key: 'ubicado', label: 'Ubicado' },
  { key: 'entregado', label: 'Entregado' },
  { key: 'liquidar', label: 'Liquidar' },
] as const

export function ConductorApp() {
  const [driver, setDriver] = useState<DriverSession | null>(() => loadSession())
  const [mine, setMine] = useState<DriverDeliveryOrder[]>([])
  const [routeUrl, setRouteUrl] = useState<string | null>(null)
  const [wazeUrl, setWazeUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [notifyOn, setNotifyOn] = useState(false)
  const knownMine = useRef<Set<string>>(new Set())
  const primedMine = useRef(false)
  const plataforma = getPlataforma()

  const lastPush = useRef(0)
  const { coords, status: locStatus, error: locError, startWatch } = useDeviceLocation({
    auto: Boolean(driver),
    watch: Boolean(driver),
    enableHighAccuracy: true,
    maximumAge: 20000,
    onUpdate: (c) => {
      const now = Date.now()
      if (now - lastPush.current < 20_000) return
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
    setRouteUrl(null)
    setWazeUrl(null)
    setLogoutOpen(false)
  }

  const refresh = useCallback(async () => {
    if (!driver) return
    setLoading(true)
    setErr(null)
    try {
      const [orders, route] = await Promise.all([apiDriverMyOrders(), apiDriverRoute()])
      const assigned = orders.mine || []
      setMine(assigned)
      const activeNav = assigned.filter((o) => o.status !== 'entregado')
      const origin = {
        lat: route.origin?.lat,
        lng: route.origin?.lng,
        address: route.origin?.address,
      }
      const stops = activeNav.map((o) => ({
        lat: o.addressLat,
        lng: o.addressLng,
        address: o.address,
      }))
      setRouteUrl(buildMultiStopUrl(origin, stops) || route.googleMapsUrl)
      setWazeUrl(buildWazeForStops(stops))

      const ids = new Set(assigned.map((o) => o.id))
      if (!primedMine.current) {
        knownMine.current = ids
        primedMine.current = true
      } else {
        for (const o of assigned) {
          if (!knownMine.current.has(o.id)) {
            notifyWeb('Pedido asignado', `${padOrder(o.number)} · ${o.customerName || 'cliente'}`, {
              tag: `driver-mine-${o.id}`,
            })
            break
          }
        }
        knownMine.current = ids
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
        event === 'order:updated' ||
        event === 'order:paid'
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
    if (ok) notifyWeb('Conductor listo', 'Te avisamos cuando el mozo te asigne una entrega')
  }

  const runBusy = async (orderId: string, fn: () => Promise<void>) => {
    setBusyId(orderId)
    try {
      await fn()
      await refresh()
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  if (!driver) {
    return (
      <div className="min-h-dvh bg-cream px-4 py-10 text-ink">
        <div className="mx-auto max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-cream">
              <Bike size={32} />
            </div>
            <p className="mt-4 text-[11px] font-bold tracking-[0.18em] text-ember uppercase">Repartidor</p>
            <h1 className="mt-1 font-display text-3xl tracking-tight">App Conductor</h1>
            <p className="mt-2 text-sm text-ink/50">
              En camino → Ubicado → Entregado (foto) → Liquidar cobro en base.
            </p>
            <p className="mt-2 font-mono text-xs text-ink/35">
              /polleria/conductor · {platformLabel(plataforma)}
            </p>
          </div>
          <div className="card p-5">
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
            <p className="mt-4 text-center text-sm text-ink/45">
              <Link to="/login" className="font-semibold text-ember hover:underline">
                Volver al sistema del local
              </Link>
            </p>
          </div>
          <p className="mt-6 text-center text-[10px] text-ink/30">v{APP_VERSION}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-cream text-ink">
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
      <header className="surface-header sticky top-0 z-20 px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src={driver.photoUrl || defaultAvatarUrl(driver.name, 'driver')}
              alt={driver.name}
              className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-ink/10"
            />
            <div className="min-w-0">
              <p className="truncate font-bold">{driver.name}</p>
              <p className="truncate font-mono text-[10px] tracking-wider text-ink/40">
                ID · {shortAccountId(driver.id)} · {driver.phone}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="tap rounded-xl p-2 text-ink/60 hover:bg-ink/5"
              onClick={() => void refresh()}
              aria-label="Actualizar"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="tap rounded-xl p-2 text-ink/60 hover:bg-ink/5"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 py-5 pb-28">
        <PageTitle
          kicker="Entregas"
          title="Mis pedidos"
          hint="Secuencia obligatoria: En camino → Ubicado → Entregado con foto → Liquidar en base."
        />

        <div className="flex flex-wrap gap-2">
          <span className="chip chip-off">{platformLabel(plataforma)}</span>
          <span className={`chip ${locOk ? 'chip-on' : 'chip-off'}`}>
            {locOk
              ? `GPS OK · ${coords!.lat.toFixed(4)}, ${coords!.lng.toFixed(4)}`
              : locStatus === 'prompting'
                ? 'Pidiendo GPS…'
                : 'GPS pendiente'}
          </span>
          {!locOk ? (
            <button type="button" onClick={() => startWatch()} className="chip chip-on">
              Activar ubicación
            </button>
          ) : null}
          {!notifyOn ? (
            <button type="button" onClick={() => void enableNotify()} className="chip chip-off">
              Activar avisos
            </button>
          ) : (
            <span className="chip chip-on">Avisos ON</span>
          )}
        </div>
        {locError ? <p className="text-xs text-ember">{locError}</p> : null}

        {err ? (
          <div className="rounded-2xl bg-ember/10 px-4 py-3 text-sm font-medium text-ember">{err}</div>
        ) : null}

        {mine.filter((o) => o.status !== 'entregado').length > 0 && (routeUrl || wazeUrl) ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {routeUrl ? (
              <a
                href={routeUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary gap-2"
              >
                <Navigation size={18} />
                Google Maps
              </a>
            ) : null}
            {wazeUrl ? (
              <a
                href={wazeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-4 font-bold text-cream"
              >
                <Navigation size={18} />
                Waze
              </a>
            ) : null}
          </div>
        ) : null}

        {mine.length === 0 ? (
          <Empty
            title="No hay entregas asignadas"
            hint="El mozo o caja te asigna el delivery desde Ver pedidos."
          />
        ) : (
          <div className="space-y-3">
            {mine.map((o, idx) => (
              <DeliveryCard
                key={o.id}
                order={o}
                badge={`#${idx + 1}`}
                busy={busyId === o.id}
                onGoogle={() => {
                  openInApp(
                    'google',
                    { lat: o.addressLat, lng: o.addressLng, address: o.address },
                    {
                      origin: coords ? { lat: coords.lat, lng: coords.lng } : undefined,
                    },
                  )
                }}
                onWaze={() => {
                  openInApp('waze', {
                    lat: o.addressLat,
                    lng: o.addressLng,
                    address: o.address,
                  })
                }}
                onArrived={() =>
                  runBusy(o.id, async () => {
                    await apiDriverArrived(o.id)
                  })
                }
                onDelivered={(photoUrl) =>
                  runBusy(o.id, async () => {
                    await apiDriverDelivered(o.id, photoUrl)
                  })
                }
                onSettle={(method, amount) =>
                  runBusy(o.id, async () => {
                    await apiDriverSettle(o.id, { method, amount })
                  })
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function DeliveryCard({
  order,
  badge,
  busy,
  onGoogle,
  onWaze,
  onArrived,
  onDelivered,
  onSettle,
}: {
  order: DriverDeliveryOrder
  badge: string
  busy: boolean
  onGoogle: () => void
  onWaze: () => void
  onArrived: () => void
  onDelivered: (photoUrl: string) => void
  onSettle: (method: 'efectivo' | 'yape' | 'plin' | 'ya_pagado', amount?: number) => void
}) {
  const action = driverAction(order)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(order.deliveryPhotoUrl || null)
  const [settleMethod, setSettleMethod] = useState<'efectivo' | 'yape' | 'plin'>(
    order.codPaymentMethod === 'yape' || order.codPaymentMethod === 'plin'
      ? (order.codPaymentMethod as 'yape' | 'plin')
      : 'efectivo',
  )
  const canNav = Boolean(
    (order.addressLat != null && order.addressLng != null) || order.address?.trim(),
  )

  // Pasos: 0=En camino, 1=Ubicado, 2=Entregado, 3=Liquidar
  // action='ubicado' → en camino hacia cliente
  // action='entregado' → llegó, pendiente tomar foto
  // action='liquidar' → entregado, pendiente cobrar
  // action='listo' → todo completado
  const doneCount =
    action === 'ubicado' ? 0 :      // nada completado, en camino
    action === 'entregado' ? 2 :    // En camino + Ubicado completados
    action === 'liquidar' ? 3 :     // + Entregado completado
    4                               // todo
  const activeIdx =
    action === 'ubicado' ? 0 :      // "En camino" activo → botón: Ubicado
    action === 'entregado' ? 2 :    // "Entregado" activo → botón: foto
    action === 'liquidar' ? 3 :     // "Liquidar" activo → botón: cobrar
    -1                              // ninguno

  const pickPhoto = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Solo imágenes')
      return
    }
    setUploading(true)
    try {
      const url = await uploadDeliveryPhoto(file)
      setPreview(url)
      onDelivered(url)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <article className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-bold text-cream">
              {badge}
            </span>
            <p className="font-display text-xl">{padOrder(order.number)}</p>
          </div>
          <p className="mt-1 font-semibold">{order.customerName}</p>
          <p className="mt-1 text-sm text-ink/45">{order.address}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="font-extrabold text-ember">{soles(order.total)}</span>
            {order.paid ? (
              <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sage">
                Pagado
                {order.codPaymentMethod ? ` · ${order.codPaymentMethod}` : ''}
              </span>
            ) : (
              <span className="rounded-full bg-gold/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink">
                Pendiente · cobrar
                {order.codPaymentMethod ? ` · ${order.codPaymentMethod}` : ''}
              </span>
            )}
          </div>
        </div>
        {order.customerPhone ? (
          <a
            href={`tel:${digitsPhone(order.customerPhone)}`}
            className="rounded-xl bg-cream-dark p-2 text-ink sm:hidden"
            aria-label="Llamar"
          >
            <Phone size={18} />
          </a>
        ) : null}
      </div>

      <ol className="mt-3 grid grid-cols-4 gap-1">
        {FLOW_STEPS.map((s, i) => {
          const filled = i < doneCount || (action === 'listo' && i <= 3)
          const active = i === activeIdx
          return (
            <li
              key={s.key}
              className={`rounded-xl px-1 py-1.5 text-center text-[10px] font-bold leading-tight ${
                filled
                  ? 'bg-sage/15 text-sage'
                  : active
                    ? 'bg-ink text-cream'
                    : 'bg-cream-dark text-ink/35'
              }`}
            >
              {s.label}
            </li>
          )
        })}
      </ol>

      {order.customerPhone ? (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
          <a
            href={`tel:${digitsPhone(order.customerPhone)}`}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-ink px-3 text-xs font-bold text-cream"
          >
            <Phone size={13} /> Llamar
          </a>
          <a
            href={`sms:${digitsPhone(order.customerPhone)}`}
            className="chip chip-off gap-1"
          >
            <MessageSquare size={13} /> SMS
          </a>
          <a
            href={`https://wa.me/${whatsappPhone(order.customerPhone)}?text=${encodeURIComponent(
              `Hola ${order.customerName || ''}, soy el repartidor de Chifa-Pollería Lopez con tu pedido ${padOrder(order.number)}.`,
            )}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-sage px-3 text-xs font-bold text-white"
          >
            <MessageCircle size={13} /> Wsp
          </a>
        </div>
      ) : null}

      {action !== 'liquidar' && action !== 'listo' && canNav ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onGoogle}
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-ink text-sm font-semibold text-cream disabled:opacity-50"
          >
            <Navigation size={16} /> Google Maps
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onWaze}
            className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-cream-dark text-sm font-semibold text-ink disabled:opacity-50"
          >
            <Navigation size={16} /> Waze
          </button>
        </div>
      ) : null}

      {action === 'ubicado' ? (
        <button
          type="button"
          disabled={busy}
          onClick={onArrived}
          className="btn-primary mt-2 w-full gap-2"
        >
          <MapPin size={18} /> Ubicado en domicilio
        </button>
      ) : null}

      {action === 'entregado' ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs font-medium text-ink/55">
            Ya estás ubicado. Toma la foto de entrega para marcar Entregado.
          </p>
          {preview ? (
            <img src={preview} alt="Entrega" className="h-28 w-full rounded-xl object-cover" />
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void pickPhoto(e.target.files?.[0] || null)}
          />
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => fileRef.current?.click()}
            className="btn-primary w-full gap-2 disabled:opacity-50"
          >
            <Camera size={18} />
            {uploading ? 'Subiendo foto…' : 'Entregado · tomar foto'}
          </button>
        </div>
      ) : null}

      {action === 'liquidar' || action === 'listo' ? (
        <div className="mt-2 space-y-2 rounded-2xl border border-dashed border-ink/12 bg-cream px-3 py-3">
          {action === 'listo' ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-sage">
              <CheckCircle2 size={16} /> Liquidado
              {order.driverCollectedMethod ? ` · ${order.driverCollectedMethod}` : ''}
            </p>
          ) : (
            <>
              <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink/60">
                <Wallet size={14} /> En base · reportar cobro del cliente
              </p>
              {order.deliveryPhotoUrl ? (
                <img
                  src={order.deliveryPhotoUrl}
                  alt="Foto entrega"
                  className="h-20 w-full rounded-xl object-cover"
                />
              ) : null}
              {order.paid ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSettle('ya_pagado')}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  Confirmar liquidación (ya pagado)
                </button>
              ) : (
                <>
                  <div className="seg w-full">
                    {(['efectivo', 'yape', 'plin'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSettleMethod(m)}
                        className={`seg-btn flex-1 capitalize ${
                          settleMethod === m ? 'seg-btn-on' : ''
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSettle(settleMethod, order.total)}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    Liquidar {soles(order.total)} · {settleMethod}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      ) : null}
    </article>
  )
}
