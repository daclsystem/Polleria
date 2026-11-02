import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
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
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Palette,
  Settings,
  Search,
  RefreshCw,
  ShoppingBag,
  Table2,
  TicketPercent,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { ROLE_HOME, ROLE_LABEL, viewOptionsForUser, type ModuleId, type Role } from '../types'
import { withBase } from '../lib/paths'
import { APP_VERSION } from '../lib/version'
import { SkeletonBoot } from './Skeleton'
import { LiveToasts } from './LiveToasts'
import { unlockSounds } from '../lib/sounds'
import { ConfirmLogout } from './ConfirmLogout'
import { displayAvatarUrl } from '../lib/avatar'
import { uploadAvatar } from '../lib/minio'
import { apiUpdateStaffProfile } from '../lib/apiClient'
import { PersonAvatar } from './PersonAvatar'
import { ThemeToggle } from './ThemeToggle'
import { ModuleErrorBoundary } from './ModuleErrorBoundary'

const NAV: { to: string; label: string; hint: string; icon: LucideIcon; module: ModuleId }[] = [
  { to: '/', label: 'Inicio', hint: 'Resumen del día', icon: LayoutDashboard, module: 'dashboard' },
  { to: '/mesas', label: 'Mesas', hint: 'Salón y terraza', icon: Table2, module: 'mesas' },
  { to: '/pedidos-web', label: 'Pedidos', hint: 'En curso: mesa, recojo, delivery', icon: ClipboardList, module: 'pedidos-web' },
  { to: '/reservas', label: 'Reservas', hint: 'Clientes por llegar', icon: CalendarCheck, module: 'reservas' },
  { to: '/historial', label: 'Historial', hint: 'Pedidos cerrados por fecha', icon: History, module: 'historial' },
  { to: '/pos', label: 'Para llevar', hint: 'Piden y se lo llevan', icon: UtensilsCrossed, module: 'pos' },
  { to: '/comandas', label: 'Caja', hint: 'Cobrar y liquidar', icon: Wallet, module: 'comandas' },
  { to: '/cocina', label: 'Cocina', hint: 'Preparar platos', icon: ChefHat, module: 'cocina' },
  { to: '/menu', label: 'Carta', hint: 'Precios y platos', icon: ShoppingBag, module: 'menu' },
  { to: '/admin-mesas', label: 'Distribución de mesas', hint: 'Crear y editar mesas', icon: Table2, module: 'admin-mesas' },
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
  { to: '/imprimir-qr', label: 'Imprimir QR', hint: 'Códigos QR para mesas', icon: Camera, module: 'imprimir-qr' },
  { to: '/config', label: 'Ajustes', hint: 'Datos del local', icon: Settings, module: 'config' },
]

const GROUPS: { title: string; modules: ModuleId[] }[] = [
  { title: 'Operación', modules: ['dashboard', 'mesas', 'pedidos-web', 'reservas', 'historial', 'pos', 'comandas', 'cocina'] },
  {
    title: 'Gestión del negocio',
    modules: [
      'menu',
      'admin-mesas',
      'inventario',
      'usuarios',
      'clientes',
      'conductores',
      'reportes',
      'sucursales',
      'facturacion',
      'whatsapp',
      'imprimir-qr',
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
  cajero: ['mesas', 'pedidos-web', 'comandas', 'historial'],
  cocina: ['cocina'],
  mozo: ['mesas', 'pedidos-web', 'reservas', 'historial'],
}

const SIDEBAR_KEY = 'polleria-sidebar-collapsed'

export function Layout() {
  const { user, actingRole, setViewRole, patchSessionUser, can, logout } = useAuth()
  const { apiMode, apiLoading, apiReady, apiError, live, pushNotice, reloadFromApi } = useStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [navQuery, setNavQuery] = useState('')
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 1023px)').matches)
  const mainRef = useRef<HTMLElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const [logoutOpen, setLogoutOpen] = useState(false)
  /** Mantener la preferencia; mostrar los nombres en la primera visita. */
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_KEY)
      if (saved === '0') return false
      if (saved === '1') return true
    } catch {
      /* ignore */
    }
    return false
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  useEffect(() => {
    if (collapsed) setNavQuery('')
  }, [collapsed])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')
    const onChange = () => {
      setIsMobile(media.matches)
      if (!media.matches) setOpen(false)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => sidebarRef.current?.querySelector<HTMLButtonElement>('button[aria-label="Cerrar"]')?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key !== 'Tab' || !window.matchMedia('(max-width: 1023px)').matches) return
      const controls = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('a, button, input') || [])]
        .filter((el) => el.offsetParent !== null && !el.hasAttribute('disabled'))
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown)
      returnFocusRef.current?.focus()
    }
  }, [open])

  const viewOptions = viewOptionsForUser(user)
  const items = NAV.filter((i) => {
    if (!can(i.module)) return false
    if (actingRole === 'mozo' && i.module === 'pos') return false
    if (navQuery && !`${i.label} ${i.hint}`.toLocaleLowerCase('es').includes(navQuery.toLocaleLowerCase('es'))) return false
    return true
  })
  const currentPage = NAV.find((item) => item.to === pathname) || NAV[0]
  const bottomIds = user ? BOTTOM[actingRole] : []
  const bottom = NAV.filter((i) => bottomIds.includes(i.module) && can(i.module))
  const compactBottom = actingRole === 'mozo' || actingRole === 'cajero'
  const visibleBottom = compactBottom ? bottom : bottom.slice(0, 3)
  const bottomCount = visibleBottom.length + (compactBottom ? 0 : 1)
  const [photo, setPhoto] = useState(() =>
    displayAvatarUrl(user?.name || 'Usuario', user?.photoUrl, 'staff'),
  )

  useEffect(() => {
    setPhoto(displayAvatarUrl(user?.name || 'Usuario', user?.photoUrl, 'staff'))
  }, [user?.photoUrl, user?.name])
  const avatarRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const handleAvatarChange = async (file: File | null) => {
    if (!file || !user) return
    setUploadingAvatar(true)
    try {
      const url = await uploadAvatar(file)
      const r = await apiUpdateStaffProfile({ photoUrl: url })
      const next = r.user.photoUrl || url
      setPhoto(next)
      patchSessionUser({ photoUrl: next })
      pushNotice('Foto de perfil actualizada', 'ok')
    } catch (e) {
      pushNotice((e as Error).message || 'No se pudo cambiar la foto', 'warn')
    } finally {
      setUploadingAvatar(false)
    }
  }

  return (
    <div className="system-shell flex h-dvh overflow-hidden bg-cream text-ink" onPointerDownCapture={() => unlockSounds()}>
      <a href="#system-content" className="system-skip-link">Ir al contenido</a>
      <LiveToasts />
      <ConfirmLogout
        open={logoutOpen}
        name={user?.name || ''}
        roleLabel={user ? ROLE_LABEL[actingRole] : undefined}
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
        ref={sidebarRef}
        aria-label="Menú principal"
        role={open && isMobile ? 'dialog' : undefined}
        aria-modal={open && isMobile ? true : undefined}
        inert={!open && isMobile ? true : undefined}
        className={`system-sidebar fixed inset-y-0 left-0 z-40 w-[min(18.5rem,88vw)] shrink-0 text-white transition-[width,transform] duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-[4.75rem]' : 'lg:w-[15.5rem]'}`}
      >
        <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
          <div className={`px-4 pt-6 pb-4 ${collapsed ? 'lg:px-2' : ''}`}>
            <button
              type="button"
              onClick={() => collapsed && setCollapsed(false)}
              title={collapsed ? 'Expandir menú' : 'Chifa Pollería Lopez'}
              aria-label={collapsed ? 'Expandir menú' : 'Chifa Pollería Lopez'}
              className={
                collapsed
                  ? 'mx-auto hidden h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white p-0.5 shadow-sm lg:flex'
                  : 'hidden'
              }
            >
              <img
                src={withBase('logo-lopez.png')}
                alt=""
                className="h-full w-full object-contain"
              />
            </button>
            <div className={`flex items-center gap-3 ${collapsed ? 'lg:hidden' : ''}`}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1">
                <img src={withBase('logo-lopez.png')} alt="" className="h-full w-full object-contain" />
              </span>
              <div>
                <p className="text-lg font-extrabold tracking-tight">Lopez<span className="text-gold">.</span></p>
                <p className="text-[10px] font-medium tracking-[0.12em] text-white/50 uppercase">Chifa & pollería</p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-end gap-1">
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
          </div>
          <div className={`px-4 pb-5 ${collapsed ? 'lg:hidden' : ''}`}>
            <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-white/45 focus-within:border-gold/50">
              <Search size={15} className="shrink-0" />
              <input type="search" value={navQuery} onChange={(e) => setNavQuery(e.target.value)} placeholder="Buscar módulo…" aria-label="Buscar módulo" className="h-11 min-w-0 w-full bg-transparent text-xs text-white outline-none placeholder:text-white/40" />
            </label>
          </div>
          <nav aria-label="Módulos" className={`system-sidebar-nav flex-1 space-y-6 overflow-y-auto px-3 pb-4 ${collapsed ? 'lg:px-2' : ''}`}>
            {items.length === 0 ? <p className="px-3 text-xs text-white/60">No se encontraron módulos.</p> : null}
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
                            `system-nav-item flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                              collapsed ? 'lg:justify-center lg:gap-0 lg:px-0 lg:py-2.5' : ''
                            } ${
                              isActive
                                ? 'system-nav-active'
                                : 'text-white/75 hover:bg-white/10 hover:text-white'
                            }`
                          }
                        >
                          <Icon size={18} className="shrink-0" />
                          <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
                            <span className="block text-[13px] font-medium leading-tight">{item.label}</span>
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
                <span className="relative shrink-0">
                  <PersonAvatar
                    name={user?.name || 'Usuario'}
                    photoUrl={photo}
                    className="h-12 w-12 text-sm"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-[#1a3d1a] ring-2 ring-[#0c1c0e]">
                    <Camera size={10} strokeWidth={2.6} />
                  </span>
                </span>
              </button>
              <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
                <p className="truncate text-sm font-semibold">{user?.name}</p>
                <p className="text-xs text-white/50">{user ? ROLE_LABEL[actingRole] : ''}</p>
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-[5.25rem] lg:pb-0" inert={open && isMobile ? true : undefined}>
        <header className="system-header sticky top-0 z-20 flex min-h-[4.5rem] items-center gap-2 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-3 sm:px-5 lg:px-8">
          <button
            className="tap rounded-xl p-2 hover:bg-ink/[0.04] lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Menú"
            aria-expanded={open}
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
            <p className="truncate text-sm font-bold">{currentPage.label}</p>
            <p className="hidden truncate text-[11px] capitalize text-ink/45 sm:block">
              {new Date().toLocaleDateString('es-PE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: 'America/Lima',
              })}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {viewOptions.length > 1 ? (
              <label className="min-w-0">
                <span className="sr-only">Ver como</span>
                <select
                  value={actingRole}
                  onChange={(e) => {
                    const next = e.target.value as Role
                    setViewRole(next)
                    navigate(ROLE_HOME[next] || '/')
                  }}
                  className="min-h-11 max-w-[8.5rem] truncate rounded-xl border border-ink/10 bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink outline-none focus:border-ember sm:max-w-[9.5rem]"
                >
                  {viewOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button type="button" disabled={apiLoading} onClick={() => void reloadFromApi()} aria-label="Actualizar datos" title="Actualizar datos" className="tap hidden items-center justify-center rounded-xl text-ink/45 hover:bg-ink/5 disabled:opacity-40 sm:inline-flex">
              <RefreshCw size={17} className={apiLoading ? 'animate-spin' : ''} />
            </button>
            <ThemeToggle />
            {user ? (
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => avatarRef.current?.click()}
                className="relative flex items-center gap-2 rounded-full pr-1 disabled:opacity-50"
                title="Cambiar foto de perfil"
              >
                <PersonAvatar
                  name={user.name}
                  photoUrl={photo}
                  className="h-9 w-9 text-[11px]"
                />
                <span className="absolute -bottom-0.5 left-6 flex h-4 w-4 items-center justify-center rounded-full bg-gold text-[#1a3d1a]">
                  <Camera size={9} strokeWidth={2.6} />
                </span>
                <div className="hidden min-w-0 leading-tight xl:block">
                  <p className="truncate text-xs font-bold text-ink">{user.name}</p>
                  <p className="text-[10px] text-ink/45">{ROLE_LABEL[actingRole]}</p>
                </div>
              </button>
            ) : null}
            {apiMode ? (
              <span
                className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase sm:inline-flex ${
                  apiError
                    ? 'bg-red-100 text-red-700'
                    : live
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : apiLoading
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-ink/[0.06] text-ink/45'
                }`}
                title={apiError || (live ? 'Los pedidos se actualizan en tiempo real' : 'Actualización periódica de datos')}
              >
                {live ? (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  </span>
                ) : null}
                {apiError ? 'Sin sincronizar' : live ? 'En vivo' : apiLoading ? 'Actualizando' : 'Conectado'}
              </span>
            ) : (
              <span className="hidden rounded-full bg-ink/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-ink/50 uppercase sm:inline">
                Demo local
              </span>
            )}
          </div>
        </header>
        {apiError ? (
          <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 sm:px-5 lg:px-8">
            No se pudo sincronizar con el API: {apiError}
          </div>
        ) : null}
        <main id="system-content" ref={mainRef} tabIndex={-1} className="system-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 outline-none sm:p-6 lg:p-8">
          <div className={`mx-auto w-full max-w-[1600px] ${pathname === '/cocina' ? 'h-full' : ''}`}>
            <ModuleErrorBoundary key={pathname}>
              <Suspense fallback={<SkeletonBoot />}>
                {apiReady ? <Outlet /> : <SkeletonBoot />}
              </Suspense>
            </ModuleErrorBoundary>
          </div>
        </main>
      </div>

      <nav
        aria-label="Accesos rápidos"
        inert={open && isMobile ? true : undefined}
        className={`bottom-nav safe-bottom fixed inset-x-0 bottom-0 z-30 grid px-1.5 pt-1.5 lg:hidden ${
          bottomCount === 2 ? 'grid-cols-2' : bottomCount === 3 ? 'grid-cols-3' : 'grid-cols-4'
        }`}
      >
        {visibleBottom.map((item) => {
          const Icon = item.icon
          const short =
            item.module === 'dashboard'
              ? 'Inicio'
              : item.module === 'pos'
                ? 'Llevar'
                : item.module === 'comandas'
                  ? actingRole === 'cajero'
                    ? 'Caja'
                    : 'Caja'
                  : item.module === 'cocina'
                    ? 'Cocina'
                    : item.module === 'mesas'
                      ? 'Mesas'
                      : item.module === 'pedidos-web'
                        ? 'Pedidos'
                        : item.module === 'historial'
                          ? 'Historial'
                          : item.module === 'reservas'
                            ? 'Reservas'
                            : item.label.split(' ')[0]
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-bold tracking-wide ${
                  isActive ? 'text-[#1a3d1a] dark:text-gold' : 'text-ink/35'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      isActive ? 'bg-gold text-[#1a3d1a]' : ''
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
        {compactBottom ? null : (
        <button
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-0.5 rounded-2xl py-2 text-[10px] font-bold tracking-wide text-ink/35"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl">
            <Menu size={20} />
          </span>
          Más
        </button>
        )}
      </nav>
    </div>
  )
}
