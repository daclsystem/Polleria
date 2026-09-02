import { ChefHat, ClipboardList, LayoutDashboard, UtensilsCrossed } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthSplitLayout } from '../components/AuthSplitLayout'
import { PhoneOtpLogin } from '../components/PhoneOtpLogin'
import { useAuth } from '../auth/AuthContext'
import { ROLE_HOME, STAFF_VIEW_OPTIONS, type Role } from '../types'
import { setApiToken } from '../lib/apiClient'

const HIGHLIGHTS = [
  { icon: UtensilsCrossed, title: 'Punto de venta', desc: 'Salón, llevar y delivery' },
  { icon: ChefHat, title: 'Cocina en vivo', desc: 'Comandas al instante' },
  { icon: ClipboardList, title: 'Caja y pedidos web', desc: 'Cobro y seguimiento' },
]

const VIEW_ICONS = {
  admin: LayoutDashboard,
  mozo: UtensilsCrossed,
  cocina: ChefHat,
  cajero: ClipboardList,
} as const

export function Login() {
  const { user, actingRole, needsViewPick, loginWithSession, setViewRole } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const enterAs = (role: Role) => {
    setViewRole(role)
    navigate(from || ROLE_HOME[role] || '/', { replace: true })
  }

  if (user && !needsViewPick) {
    return <Navigate to={from || ROLE_HOME[actingRole]} replace />
  }

  const pickingView = needsViewPick

  return (
    <AuthSplitLayout
      kicker="Chifa-Pollería Lopez"
      title="Sistema de Gestión"
      subtitle="Acceso del personal. Entra con tu celular registrado; te enviamos el código por WhatsApp."
      highlights={HIGHLIGHTS}
      footer="Solo personal autorizado · una sesión a la vez"
    >
      {pickingView ? (
        <div>
          <h2 className="text-[1.45rem] font-black leading-tight tracking-tight text-ink sm:text-3xl">
            ¿Cómo quieres ver el sistema?
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink/50">
            Elige el puesto. Puedes cambiarlo después sin volver a entrar.
          </p>
          <div className="mt-5 grid gap-2.5">
            {STAFF_VIEW_OPTIONS.map((opt) => {
              const Icon = VIEW_ICONS[opt.id]
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => enterAs(opt.id)}
                  className="flex min-h-14 items-center gap-3 rounded-2xl border border-ink/10 bg-surface px-4 py-3 text-left transition hover:border-gold hover:bg-gold/10"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1a3d1a] text-gold">
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-ink">{opt.label}</span>
                    <span className="block text-xs text-ink/45">{opt.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <PhoneOtpLogin
          accountType="staff"
          purpose="login"
          title="Entrar al sistema"
          hint="Usa el celular registrado en Equipo."
          onSuccess={async (data) => {
            if (!data.token || !data.user) throw new Error('Respuesta inválida del API')
            setApiToken(data.token, 'staff')
            await loginWithSession({
              id: data.user.id,
              name: data.user.name,
              email: data.user.email,
              role: data.user.role as Role,
              pin: data.user.pin,
              phone: data.user.phone,
              photoUrl: data.user.photoUrl,
              isSystem: data.user.isSystem,
            })
            if (!data.user.isSystem) {
              navigate(from || ROLE_HOME[data.user.role as Role] || '/', { replace: true })
            }
          }}
        />
      )}
    </AuthSplitLayout>
  )
}
