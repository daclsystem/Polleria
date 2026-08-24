import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingBag,
  Table2,
  UtensilsCrossed,
  Users,
  BarChart3,
  Globe,
  Monitor,
  X,
  ExternalLink,
  CalendarCheck,
  Building2,
  FileText,
  MessageCircle,
} from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useStore } from '../store/StoreContext'
import { ROLE_LABEL, type ModuleId, type Role } from '../types'
import { withBase } from '../lib/paths'
import { APP_VERSION } from '../lib/version'

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
  { to: '/reportes', label: 'Reportes', hint: 'Ventas e impresión', icon: BarChart3, module: 'reportes' },
  { to: '/sucursales', label: 'Sucursales', hint: 'Locales del negocio', icon: Building2, module: 'sucursales' },
  { to: '/facturacion', label: 'Facturación', hint: 'Boletas y facturas SUNAT', icon: FileText, module: 'facturacion' },
  { to: '/whatsapp', label: 'WhatsApp', hint: 'Mensajes a clientes', icon: MessageCircle, module: 'whatsapp' },
  { to: '/web-config', label: 'Página Web', hint: 'Banners y contenido', icon: Monitor, module: 'web-config' },
  { to: '/config', label: 'Ajustes', hint: 'Datos del local', icon: Settings, module: 'config' },
]

const GROUPS: { title: string; modules: ModuleId[] }[] = [
  { title: 'Trabajar ahora', modules: ['dashboard', 'pos', 'comandas', 'cocina', 'mesas', 'reservas', 'pedidos-web'] },
  { title: 'Administrar', modules: ['menu', 'inventario', 'usuarios', 'reportes', 'sucursales', 'facturacion', 'whatsapp', 'web-config', 'config'] },
]

const BOTTOM: Record<Role, ModuleId[]> = {
  admin: ['dashboard', 'pos', 'comandas', 'cocina'],
  cajero: ['dashboard', 'pos', 'comandas', 'mesas'],
  cocina: ['cocina', 'comandas'],
  mozo: ['mesas', 'pos', 'comandas'],
}

export function Layout() {
  const { user, can, logout } = useAuth()
  const { apiMode, apiLoading, apiError } = useStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const items = NAV.filter((i) => can(i.module))
  const bottomIds = user ? BOTTOM[user.role] : []
  const bottom = NAV.filter((i) => bottomIds.includes(i.module) && can(i.module))
  const bottomCount = Math.min(bottom.length, 3) + 1

  return (
    <div className="flex min-h-dvh bg-cream">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[min(18.5rem,88vw)] flame-bg text-cream transition-transform duration-200 lg:static lg:w-[17.5rem] lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-5 py-6">
            <div>
              <p className="font-display text-[1.4rem] leading-none tracking-tight">Chifa-Pollería</p>
              <p className="mt-1 text-[11px] font-medium tracking-[0.18em] text-cream/45 uppercase">Lopez</p>
            </div>
            <button className="tap rounded-xl p-2 lg:hidden" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
            {GROUPS.map((group) => {
              const groupItems = items.filter((i) => group.modules.includes(i.module))
              if (groupItems.length === 0) return null
              return (
                <div key={group.title}>
                  <p className="mb-1.5 px-3 text-[10px] font-bold tracking-[0.16em] text-cream/35 uppercase">
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
                          onClick={() => setOpen(false)}
                          className={({ isActive }) =>
                            `flex min-h-12 items-center gap-3 rounded-2xl px-3 py-2 transition ${
                              isActive
                                ? 'bg-ember text-white shadow-lg shadow-ember/25'
                                : 'text-cream/75 hover:bg-white/6 hover:text-cream'
                            }`
                          }
                        >
                          <Icon size={18} className="shrink-0" />
                          <span className="min-w-0">
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
          <div className="border-t border-white/10 p-4">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="text-xs text-cream/50">{user ? ROLE_LABEL[user.role] : ''}</p>
            <button
              onClick={() => {
                logout()
                navigate('/login')
              }}
              className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-2xl bg-white/8 px-3 py-2 text-sm text-cream/80 hover:bg-white/12"
            >
              <LogOut size={16} />
              Cerrar sesión
            </button>
            <p className="mt-3 text-center text-[10px] text-cream/30">v{APP_VERSION}</p>
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
      <div className="flex min-w-0 flex-1 flex-col pb-[4.75rem] lg:pb-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink/6 bg-cream/90 px-3 py-2.5 backdrop-blur sm:px-5 lg:px-8">
          <button
            className="tap rounded-xl p-2 hover:bg-ink/5 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Menú"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-none lg:hidden">Chifa-Pollería Lopez</p>
            <p className="hidden text-sm text-ink/40 capitalize sm:block">
              {new Date().toLocaleDateString('es-PE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {apiMode ? (
              <span
                className={`hidden rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase sm:inline ${
                  apiError
                    ? 'bg-red-100 text-red-700'
                    : apiLoading
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                }`}
                title={apiError || 'Datos desde API/SQL'}
              >
                {apiError ? 'API error' : apiLoading ? 'Sync…' : 'API · SQL'}
              </span>
            ) : (
              <span className="hidden rounded-full bg-ink/10 px-2.5 py-1 text-[10px] font-bold tracking-wide text-ink/50 uppercase sm:inline">
                Demo local
              </span>
            )}
            <a
              href={withBase('pedir')}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-cream"
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
        <main className="flex-1 p-3 sm:p-5 lg:p-8">
          <Outlet />
        </main>
      </div>

      <nav
        className={`safe-bottom fixed inset-x-0 bottom-0 z-30 grid border-t border-ink/8 bg-white/95 px-1 pt-1 backdrop-blur lg:hidden ${
          bottomCount === 2 ? 'grid-cols-2' : bottomCount === 3 ? 'grid-cols-3' : 'grid-cols-4'
        }`}
      >
        {bottom.slice(0, 3).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-bold ${
                  isActive ? 'text-ember' : 'text-ink/40'
                }`
              }
            >
              <Icon size={20} />
              {item.label.split(' ')[0]}
            </NavLink>
          )
        })}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-bold text-ink/40"
        >
          <Menu size={20} />
          Más
        </button>
      </nav>
    </div>
  )
}
