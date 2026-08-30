import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  Bike,
  Building2,
  CalendarCheck,
  Camera,
  ChefHat,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Contact,
  ExternalLink,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Palette,
  Settings,
  ShoppingBag,
  Table2,
  TicketPercent,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { ROLE_LABEL, type ModuleId, type Role } from '../types'
import { customerMenuUrl } from '../lib/paths'
import { APP_VERSION } from '../lib/version'
import { LiveToasts } from './LiveToasts'
import { unlockSounds } from '../lib/sounds'
import { ConfirmLogout } from './ConfirmLogout'
import { defaultAvatarUrl, shortAccountId } from '../lib/avatar'
import { uploadAvatar } from '../lib/minio'
import { apiUpdateStaffProfile } from '../lib/apiClient'
import { ThemeToggle } from './ThemeToggle'

const NAV: { to: string; label: string; hint: string; icon: LucideIcon; module: ModuleId }[] = [
  { to: '/', label: 'Inicio', hint: 'Resumen del día', icon: LayoutDashboard, module: 'dashboard' },
  { to: '/pos', label: 'Tomar pedido', hint: 'Nueva comanda', icon: UtensilsCrossed, module: 'pos' },
  { to: '/comandas', label: 'Ver pedidos', hint: 'Seguimiento y cobro', icon: ClipboardList, module: 'comandas' },
  { to: '/cocina', label: 'Cocina', hint: 'Preparar platos', icon: ChefHat, module: 'cocina' },
  { to: '/mesas', label: 'Mesas', hint: 'Salón y terraza', icon: Table2, module: 'mesas' },
  { to: '/reservas', label: 'Reservas', hint: 'Clientes por llegar', icon: CalendarCheck, module: 'reservas' },
  { to: '/pedidos-web', label: 'Pedidos online', hint: 'Lo que pide el cliente', icon: Globe, module: 'pedidos-web' },
  { to: '/menu', label: 'Carta', hint: 'Precios y platos', icon: ShoppingBag, module: 'menu' },
  { to: '/inventario', label: 'Inventario', hint: 'Insumos y stock', icon: Package, module: 'inventario' },
  { to: '/usuarios', label: 'Equipo', hint: 'Usuarios y roles', icon: Users, module: 'usuarios' },
  { to: '/clientes', label: 'Clientes', hint: 'Agenda de clientes', icon: Contact, module: 'clientes' },
  { to: '/conductores', label: 'Conductores', hint: 'Repartidores delivery', icon: Bike, module: 'conductores' },
  { to: '/reportes', label: 'Reportes', hint: 'Ventas e impresión', icon: BarChart3, module: 'reportes' },
  {
    to: '/sucursales',
    label: 'Sucursales',
    hint: 'Locales operativos (POS, cocina)',
    icon: Building2,
    module: 'sucursales',
  },
  { to: '/facturacion', label: 'Facturación', hint: 'Boletas y facturas SUNAT', icon: FileText, module: 'facturacion' },
  { to: '/whatsapp', label: 'WhatsApp', hint: 'Mensajes a clientes', icon: MessageCircle, module: 'whatsapp' },
  {
    to: '/web-config',
    label: 'Personalización web',
    hint: 'Horarios, locales, qué vende y textos de la web',
    icon: Palette,
    module: 'web-config',
  },
  { to: '/cupones', label: 'Cupones', hint: 'Descuentos y códigos', icon: TicketPercent, module: 'cupones' },
  { to: '/config', label: 'Ajustes', hint: 'Datos del local', icon: Settings, module: 'config' },
]

const GROUPS: { title: string; modules: ModuleId[] }[] = [
  { title: 'Trabajar ahora', modules: ['dashboard', 'pos', 'comandas', 'cocina', 'mesas', 'reservas', 'pedidos-web'] },
  {
    title: 'Administrar',
    modules: [
      'menu',
      'inventario',
      'usuarios',
      'clientes',
      'conductores',
      'reportes',
      'sucursales',
      'facturacion',
      'whatsapp',
      'config',
    ],
  },
  {
    title: 'Web pública',
    modules: ['web-config', 'cupones'],
  },
]

const BOTTOM: Record<Role, ModuleId[]> = {
  admin: ['dashboard', 'pos', 'comandas', 'cocina'],
  cajero: ['dashboard', 'comandas'],
  cocina: ['cocina'],
  mozo: ['mesas', 'pos', 'comandas'],
}

const SIDEBAR_KEY = 'polleria-sidebar-collapsed'

export function Layout() {
  const { user, can, logout } = useAuth()
  const { apiMode, apiLoading, apiError, live } = useStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  /** Desktop: contraído por defecto para dar espacio (cocina, etc.) */
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY)
      if (saved === '0') return false
      if (saved === '1') return true
    } catch {
      /* ignore */
    }
    return true
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const items = NAV.filter((i) => can(i.module))
  const bottomIds = user ? BOTTOM[user.role] : []
  const bottom = NAV.filter((i) => bottomIds.includes(i.module) && can(i.module))
  const bottomCount = Math.min(bottom.length, 3) + 1
  const [photo, setPhoto] = useState(() => user?.photoUrl || defaultAvatarUrl(user?.name || 'Usuario', 'staff'))
  const avatarRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const handleAvatarChange = async (file: File | null) => {
    if (!file || !user) return
    setUploadingAvatar(true)
    try {
      const url = await uploadAvatar(file)
      await apiUpdateStaffProfile({ photoUrl: url })
      setPhoto(url)
    } catch {
      /* ignore */
    } finally {
      setUploadingAvatar(false)
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-cream text-ink" onPointerDownCapture={() => unlockSounds()}>
      <LiveToasts />
      <ConfirmLogout
        open={logoutOpen}
        name={user?.name || ''}
        roleLabel={user ? ROLE_LABEL[user.role] : undefined}
        accountId={user?.id || ''}
        photoUrl={photo}
        tone="staff"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => {
          setLogoutOpen(false)
          logout()
          navigate('/login')
        }}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[min(18.5rem,88vw)] flame-bg text-white transition-[width,transform] duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-[4.25rem]' : 'lg:w-[17.5rem]'}`}
      >
        <div className="flex h-full flex-col">
          <div
            className={`flex items-center justify-between px-5 py-5 ${
              collapsed ? 'lg:justify-center lg:px-1.5' : ''
            }`}
          >
            <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="font-display text-[1.4rem] leading-none tracking-tight">Chifa-Pollería</p>
              <p className="mt-1 text-[11px] font-medium tracking-[0.18em] text-white/45 uppercase">Lopez</p>
            </div>
            {collapsed ? (
              <p className="hidden font-display text-lg text-gold lg:block" title="Chifa-Pollería Lopez">
                CL
              </p>
            ) : null}
            <button className="tap rounded-xl p-2 lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar">
              <X size={18} />
            </button>
            <button
              type="button"
              className="tap hidden rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white lg:inline-flex"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
              title={collapsed ? 'Expandir' : 'Contraer'}
            >
              {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            </button>
          </div>
          <nav className={`flex-1 space-y-5 overflow-y-auto px-3 pb-4 ${collapsed ? 'lg:px-1.5' : ''}`}>
            {GROUPS.map((group) => {
              const groupItems = items.filter((i) => group.modules.includes(i.module))
              if (groupItems.length === 0) return null
              return (
                <div key={group.title}>
                  <p
                    className={`mb-1.5 px-3 text-[10px] font-bold tracking-[0.16em] text-white/40 uppercase ${
                      collapsed ? 'lg:hidden' : ''
                    }`}
                  >
                    {group.title}
                  </p>
                  <div className="space-y-0.5">
                    {groupItems.map((item) => {
                      const Icon = item.icon
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/'}
                          title={`${item.label} · ${item.hint}`}
                          onClick={() => setOpen(false)}
                          className={({ isActive }) =>
                            `flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 transition ${
                              collapsed ? 'lg:justify-center lg:gap-0 lg:px-0 lg:py-2.5' : ''
                            } ${
                              isActive
                                ? 'bg-ember text-white shadow-lg shadow-ember/25'
                                : 'text-white/75 hover:bg-white/6 hover:text-white'
                            }`
                          }
                        >
                          <Icon size={18} className="shrink-0" />
                          <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
                            <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                            <span className="block text-[11px] opacity-70">{item.hint}</span>
                          </span>
                        </NavLink>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </nav>
          <input
              ref={avatarRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleAvatarChange(e.target.files?.[0] ?? null)}
            />
          <div className={`border-t border-white/10 p-4 ${collapsed ? 'lg:p-2' : ''}`}>
            <div className={`flex items-center gap-3 ${collapsed ? 'lg:justify-center lg:gap-0' : ''}`}>
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => avatarRef.current?.click()}
                className="relative shrink-0 disabled:opacity-50"
                title="Cambiar foto"
              >
                <img
                  src={photo}
                  alt={user?.name || ''}
                  className="h-12 w-12 rounded-full object-cover ring-2 ring-white/20"
                />
                <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ember text-white">
                  <Camera size={10} />
                </span>
              </button>
              <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-white/50">{user ? ROLE_LABEL[user.role] : ''}</p>
                <p className="mt-0.5 font-mono text-[10px] tracking-wider text-white/40">
                  ID · {shortAccountId(user?.id)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setLogoutOpen(true)}
              title="Cerrar sesión"
              className={`mt-3 flex min-h-11 w-full items-center gap-2 rounded-2xl bg-white/8 px-3 py-2 text-sm text-white/80 hover:bg-white/12 ${
                collapsed ? 'lg:justify-center lg:gap-0 lg:px-0' : ''
              }`}
            >
              <LogOut size={16} />
              <span className={collapsed ? 'lg:hidden' : ''}>Cerrar sesión</span>
            </button>
            <p className={`mt-3 text-center text-[10px] text-white/35 ${collapsed ? 'lg:hidden' : ''}`}>
              v{APP_VERSION}
            </p>
          </div>
        </div>
      </aside>
      {open ? (
        <button
          className="fixed inset-0 z-30 bg-ink/45 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-[4.75rem] lg:pb-0">
        <header className="surface-header sticky top-0 z-20 flex items-center gap-3 px-3 py-2.5 sm:px-5 lg:px-8">
          <button
            className="tap rounded-xl p-2 hover:bg-ink/[0.04] lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Menú"
          >
            <Menu size={20} />
          </button>
          <button
            type="button"
            className="tap hidden rounded-xl p-2 hover:bg-ink/[0.04] lg:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
            title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          >
            {collapsed ? <ChevronsRight size={20} /> : <ChevronsLeft size={20} />}
          </button>
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-none tracking-tight lg:hidden">
              Chifa-Pollería Lopez
            </p>
            <p className="hidden text-sm text-ink/40 capitalize sm:block">
              {new Date().toLocaleDateString('es-PE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <div className="hidden items-center gap-2 sm:flex">
                <img src={photo} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-ink/10" />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-xs font-bold text-ink">{user.name}</p>
                  <p className="font-mono text-[10px] text-ink/40">ID · {shortAccountId(user.id)}</p>
                </div>
              </div>
            ) : null}
            {apiMode ? (
              <span
                className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase sm:inline-flex ${
                  apiError
                    ? 'bg-red-100 text-red-700'
                    : live
                      ? 'bg-emerald-100 text-emerald-800'
                      : apiLoading
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-ink/[0.06] text-ink/45'
                }`}
                title={apiError || (live ? 'Socket en vivo + API/SQL' : 'API/SQL (sin socket)')}
              >
                {live ? (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </span>
                ) : null}
                {apiError ? 'API error' : live ? 'En vivo' : apiLoading ? 'Sync…' : 'API · SQL'}
              </span>
            ) : (
              <span className="hidden rounded-full bg-ink/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-ink/50 uppercase sm:inline">
                Demo local
              </span>
            )}
            <a
              href={customerMenuUrl()}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-white shadow-sm"
            >
              <ExternalLink size={13} />
              <span className="hidden sm:inline">Carta del cliente</span>
              <span className="sm:hidden">Carta</span>
            </a>
          </div>
        </header>
        {apiError ? (
          <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 sm:px-5 lg:px-8">
            No se pudo sincronizar con el API: {apiError}
          </div>
        ) : null}
        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-5 lg:p-8">
          <Outlet />
        </main>
      </div>

      <nav
        className={`bottom-nav safe-bottom fixed inset-x-0 bottom-0 z-30 grid px-1.5 pt-1.5 lg:hidden ${
          bottomCount === 2 ? 'grid-cols-2' : bottomCount === 3 ? 'grid-cols-3' : 'grid-cols-4'
        }`}
      >
        {bottom.slice(0, 3).map((item) => {
          const Icon = item.icon
          const short =
            item.module === 'dashboard'
              ? 'Inicio'
              : item.module === 'pos'
                ? 'Tomar'
                : item.module === 'comandas'
                  ? user?.role === 'cajero'
                    ? 'Cobrar'
                    : 'Ver'
                  : item.module === 'cocina'
                    ? 'Cocina'
                    : item.module === 'mesas'
                      ? 'Mesas'
                      : item.label.split(' ')[0]
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-bold tracking-wide ${
                  isActive ? 'text-ember' : 'text-ink/35'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                      isActive ? 'bg-ember/10' : ''
                    }`}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  {short}
                </>
              )}
            </NavLink>
          )
        })}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-bold tracking-wide text-ink/35"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl">
            <Menu size={20} />
          </span>
          Más
        </button>
      </nav>
    </div>
  )
}
