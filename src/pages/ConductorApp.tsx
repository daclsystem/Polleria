import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
import { AuthSplitLayout } from '../components/AuthSplitLayout'
import { ConfirmLogout } from '../components/ConfirmLogout'
import { SessionReplacedDialog } from '../components/SessionReplacedDialog'
import {
  DevicePermissionsPrompt,
  askDevicePermissions,
  notificationsGranted,
  permissionsPromptSkipped,
  skipPermissionsPrompt,
} from '../components/DevicePermissionsPrompt'
import { defaultAvatarUrl } from '../lib/avatar'
import {
  apiDriverLocation,
  apiDriverMyOrders,
  apiDriverRoute,
  apiDriverUpdateProfile,
  apiLogout,
  setApiToken,
  type DriverDeliveryOrder,
} from '../lib/apiClient'
import { uploadAvatar } from '../lib/minio'
import { connectRealtime, onRealtimeEvent } from '../lib/realtime'
import { padOrder, soles } from '../lib/format'
import { notifyWeb } from '../lib/webNotify'
import { useDeviceLocation } from '../hooks/useDeviceLocation'
import { uploadDeliveryPhoto } from '../lib/minio'
import {
  DRIVER_KEY,
  FLOW_STEPS,
  digitsPhone,
  driverAction,
  loadDriverSession,
  whatsappPhone,
  type DriverSession,
} from '../lib/driverFlow'
import { ThemeToggle } from '../components/ThemeToggle'

const PERMS_SKIP_KEY = 'polleria-perms-skip-driver'

type EarningsData = { trips: number; total: number }

export function ConductorApp() {
  const navigate = useNavigate()
  const bootNav = useRef(false)
  const [driver, setDriver] = useState<DriverSession | null>(() => loadDriverSession())
  const [mine, setMine] = useState<DriverDeliveryOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [replacedMsg, setReplacedMsg] = useState<string | null>(null)
  const [permsOpen, setPermsOpen] = useState(false)
  const [, setNotifyOn] = useState(() => notificationsGranted())
  const knownMine = useRef<Set<string>>(new Set())
  const primedMine = useRef(false)
  const [tab, setTab] = useState<'entregas' | 'ganancias'>('entregas')
  const [earnings, setEarnings] = useState<{
    rate?: number
    today: EarningsData
    week: EarningsData
    month: EarningsData
  } | null>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const lastPush = useRef(0)
  const { coords, status: locStatus, error: locError, startWatch, requestOnce } = useDeviceLocation({
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
    void apiLogout('driver')
    localStorage.removeItem(DRIVER_KEY)
    setApiToken(null, 'driver')
    setDriver(null)
    setMine([])
    setLogoutOpen(false)
  }

  const loadEarnings = useCallback(async () => {
    if (!driver) return
    try {
      const r = await apiDriverMyOrders()
      if (r.earnings) {
        setEarnings(r.earnings)
        return
      }
    } catch {
      /* ignore */
    }
    const delivered = mine.filter((o) => o.status === 'entregado' || o.driverSettledAt)
    const rate = 5
    const fee = (o: DriverDeliveryOrder) => {
      const n = o.deliveryFee ?? 0
      return n > 0 ? n : rate
    }
    const pack = (arr: DriverDeliveryOrder[]) => ({
      trips: arr.length,
      total: arr.reduce((s, o) => s + fee(o), 0),
    })
    setEarnings({ rate, today: pack(delivered), week: pack(delivered), month: pack(delivered) })
  }, [driver, mine])

  const handleAvatarChange = async (file: File | null) => {
    if (!file || !driver) return
    setUploadingAvatar(true)
    try {
      const url = await uploadAvatar(file)
      const r = await apiDriverUpdateProfile({ photoUrl: url })
      const updated = { ...driver, photoUrl: r.driver.photoUrl }
      setDriver(updated)
      localStorage.setItem(DRIVER_KEY, JSON.stringify(updated))
    } catch {
      /* ignore */
    } finally {
      setUploadingAvatar(false)
    }
  }

  const refresh = useCallback(async () => {
    if (!driver) return
    setLoading(true)
    setErr(null)
    try {
      const [orders] = await Promise.all([apiDriverMyOrders(), apiDriverRoute()])
      const assigned = orders.mine || []
      setMine(assigned)
      if (orders.earnings) setEarnings(orders.earnings)
      if (!bootNav.current) {
        bootNav.current = true
        const first = assigned.find((o) => o.status !== 'entregado' && o.status !== 'cancelado')
        if (first) navigate(`/pedido/${first.id}`, { replace: true })
      }
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
  }, [driver, navigate])

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
      localStorage.removeItem(DRIVER_KEY)
      setApiToken(null, 'driver')
      setDriver(null)
      setReplacedMsg(detail?.message || 'Iniciaste sesión en otro celular. Esta queda cerrada.')
    }
    window.addEventListener('polleria-session-replaced', onReplaced)
    const t = window.setInterval(() => void refresh(), 30000)
    return () => {
      window.clearInterval(t)
      off()
      window.removeEventListener('polleria-session-replaced', onReplaced)
    }
  }, [driver, refresh])

  useEffect(() => {
    if (!driver) {
      setPermsOpen(false)
      return
    }
    if (permissionsPromptSkipped(PERMS_SKIP_KEY)) return
    if (notificationsGranted() && locStatus === 'granted') {
      skipPermissionsPrompt(PERMS_SKIP_KEY)
      setNotifyOn(true)
      setPermsOpen(false)
      return
    }
    if (locStatus === 'prompting') return
    setPermsOpen(true)
  }, [driver, locStatus])

  if (!driver) {
    return (
      <AuthSplitLayout
        kicker="Chifa-Pollería Lopez"
        title="En ruta"
        subtitle="Tus entregas, el mapa y el cobro. Entra con el celular registrado como conductor."
        highlights={[
          { icon: Bike, title: 'Tus entregas', desc: 'Pedidos asignados al instante.' },
          { icon: MapPin, title: 'Ruta y GPS', desc: 'El local y el cliente te ven.' },
          { icon: Wallet, title: 'Cobro en destino', desc: 'Efectivo, Yape o ya pagado.' },
        ]}
        footer="Solo conductores autorizados · una sesión a la vez"
      >
        <SessionReplacedDialog
          open={Boolean(replacedMsg)}
          message={replacedMsg || undefined}
          onAck={() => setReplacedMsg(null)}
        />
        <PhoneOtpLogin
          accountType="driver"
          purpose="login"
          title="Entrar a entregas"
          hint="Usa el celular registrado como conductor. Te enviamos el código por WhatsApp."
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
            setPermsOpen(true)
          }}
        />
      </AuthSplitLayout>
    )
  }

  return (
    <div className="min-h-dvh bg-cream text-ink">
      <DevicePermissionsPrompt
        open={permsOpen}
        title="Activa ubicación y avisos"
        hint="Necesitamos tu GPS para que el local y el cliente vean el pedido, y avisos cuando te asignen una entrega."
        onSkip={() => {
          skipPermissionsPrompt(PERMS_SKIP_KEY)
          setPermsOpen(false)
        }}
        onActivate={async () => {
          const r = await askDevicePermissions({
            requestLocation: async () => {
              startWatch()
              return requestOnce(false)
            },
            notifyTitle: 'Conductor listo',
            notifyBody: 'Te avisamos cuando el mozo te asigne una entrega.',
          })
          setNotifyOn(r.notifyOk)
          skipPermissionsPrompt(PERMS_SKIP_KEY)
          setPermsOpen(false)
        }}
      />
      <SessionReplacedDialog
        open={Boolean(replacedMsg)}
        message={replacedMsg || undefined}
        onAck={() => setReplacedMsg(null)}
      />
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
      <input
        ref={avatarRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleAvatarChange(e.target.files?.[0] ?? null)}
      />
      <header className="sticky top-0 z-20 bg-[#0b1f1c] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => avatarRef.current?.click()}
              className="relative shrink-0 disabled:opacity-50"
            >
              <img
                src={driver.photoUrl || defaultAvatarUrl(driver.name, 'driver')}
                alt={driver.name}
                className="h-12 w-12 rounded-full object-cover ring-2 ring-white/20"
              />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-teal-400 text-[#0b1f1c]">
                <Camera size={10} />
              </span>
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-[0.16em] text-teal-300 uppercase">Repartidor</p>
              <p className="truncate font-display text-xl leading-tight">{driver.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle tone="dark" className="h-10 w-10" />
            <button
              type="button"
              className="tap rounded-full p-2.5 text-white/70 hover:bg-white/10"
              onClick={() => void refresh()}
              aria-label="Actualizar"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              className="tap rounded-full p-2.5 text-white/70 hover:bg-white/10"
              onClick={() => setLogoutOpen(true)}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <div className="mx-auto mt-3 grid max-w-lg grid-cols-2 rounded-2xl bg-white/10 p-1">
          <button
            type="button"
            onClick={() => setTab('entregas')}
            className={`rounded-xl py-2.5 text-sm font-bold ${tab === 'entregas' ? 'bg-white text-[#0b1f1c]' : 'text-white/60'}`}
          >
            Entregas
          </button>
          <button
            type="button"
            onClick={() => { setTab('ganancias'); void loadEarnings() }}
            className={`rounded-xl py-2.5 text-sm font-bold ${tab === 'ganancias' ? 'bg-white text-[#0b1f1c]' : 'text-white/60'}`}
          >
            Ganancias
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-5 px-4 py-5 pb-28">
        {tab === 'ganancias' ? (
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-bold tracking-[0.16em] text-teal-700 uppercase">Vas ganando</p>
              <h2 className="font-display text-2xl tracking-tight">Mis ganancias</h2>
              <p className="mt-1 text-sm text-ink/45">
                Servicios entregados
                {earnings?.rate ? ` · ${soles(earnings.rate)} por envío` : ''}.
              </p>
            </div>
            {earnings ? (
              <>
                <div className="rounded-[1.5rem] bg-[#0b1f1c] p-5 text-white shadow-sm">
                  <p className="text-xs font-bold tracking-wide text-teal-200 uppercase">Hoy</p>
                  <p className="mt-1 font-display text-4xl">{soles(earnings.today.total)}</p>
                  <p className="mt-1 text-sm text-white/65">
                    {earnings.today.trips} {earnings.today.trips === 1 ? 'servicio' : 'servicios'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-ink/8">
                    <p className="text-xs font-semibold text-ink/50">Semana</p>
                    <p className="font-display text-2xl text-teal-800">{soles(earnings.week.total)}</p>
                    <p className="text-xs text-ink/40">{earnings.week.trips} servicios</p>
                  </div>
                  <div className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-ink/8">
                    <p className="text-xs font-semibold text-ink/50">Mes</p>
                    <p className="font-display text-2xl text-teal-800">{soles(earnings.month.total)}</p>
                    <p className="text-xs text-ink/40">{earnings.month.trips} servicios</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-ink/50">Cargando…</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold tracking-[0.16em] text-teal-700 uppercase">Hoy</p>
                <h2 className="font-display text-2xl tracking-tight">Tus entregas</h2>
              </div>
              <button
                type="button"
                onClick={() => (locOk ? undefined : startWatch())}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
                  locOk ? 'bg-teal-100 text-teal-800' : 'bg-[#0b1f1c] text-white'
                }`}
              >
                {locOk ? 'GPS activo' : 'Activar GPS'}
              </button>
            </div>
            {locError ? <p className="text-xs text-ember">{locError}</p> : null}
            {err ? (
              <div className="rounded-2xl bg-ember/10 px-4 py-3 text-sm font-medium text-ember">{err}</div>
            ) : null}

            {mine.length === 0 ? (
              <div className="rounded-[1.75rem] bg-surface px-6 py-14 text-center shadow-sm ring-1 ring-ink/8">
                <Bike size={36} className="mx-auto text-teal-700/40" />
                <p className="mt-4 font-display text-xl">Sin entregas</p>
                <p className="mt-1 text-sm text-ink/45">Cuando te asignen un pedido, toca la tarjeta y se abre el mapa.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {mine.map((o, idx) => {
                  const action = driverAction(o)
                  const step =
                    action === 'ubicado'
                      ? 'En camino'
                      : action === 'entregado'
                        ? 'Llegaste · foto'
                        : action === 'liquidar'
                          ? 'Cobrar'
                          : 'Listo'
                  return (
                    <Link
                      key={o.id}
                      to={`/pedido/${o.id}`}
                      className="card card-press block p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold text-teal-700">
                            #{idx + 1} · {padOrder(o.number)}
                          </p>
                          <p className="mt-0.5 font-display text-xl">{o.customerName}</p>
                          <p className="mt-1 text-sm text-ink/50">{o.address}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#0b1f1c] px-2.5 py-1 text-[10px] font-bold text-white">
                          {step}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="font-extrabold text-teal-800">{soles(o.total)}</span>
                        <span className="inline-flex items-center gap-1 font-bold text-[#0b1f1c]">
                          Abrir mapa <Navigation size={14} />
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

export function DeliveryCard({
  order,
  badge,
  busy,
  compact = false,
  onGoogle,
  onWaze,
  onArrived,
  onDelivered,
  onSettle,
}: {
  order: DriverDeliveryOrder
  badge: string
  busy: boolean
  compact?: boolean
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

      {!compact && action !== 'liquidar' && action !== 'listo' && canNav ? (
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
