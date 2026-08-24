import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { RecoverAccountForm } from '../components/RecoverAccountForm'
import { ROLE_HOME } from '../types'
import { APP_VERSION } from '../lib/version'

const DEMOS = [
  { role: 'Administrador', email: 'admin@lopez.pe', password: 'admin123', does: 'Ve y controla todo', icon: '👑' },
  { role: 'Cajero', email: 'cajero@lopez.pe', password: 'cajero123', does: 'Cobra y arma pedidos', icon: '💰' },
  { role: 'Cocina', email: 'cocina@lopez.pe', password: 'cocina123', does: 'Prepara las comandas', icon: '👨‍🍳' },
  { role: 'Mozo', email: 'mozo@lopez.pe', password: 'mozo123', does: 'Atiende mesas', icon: '🍽️' },
]

export function Login() {
  const { user, login, resetStaffPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('admin@lopez.pe')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'recover'>('login')

  if (user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from || ROLE_HOME[user.role]} replace />
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const err = await login(email, password)
    if (err) {
      setError(err)
      return
    }
    navigate('/')
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-[#1a3d1a] px-6 py-12 text-white">
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30" />
        <div className="relative text-center">
          <img src="/polleria/logo-lopez.png" alt="Chifa Pollería Lopez" className="mx-auto h-36 w-auto rounded-2xl shadow-2xl" />
          <h1 className="mt-8 text-4xl font-black tracking-tight sm:text-5xl">Sistema de Gestión</h1>
          <p className="mt-3 text-lg text-green-200">Chifa-Pollería Lopez · Acceso personal</p>
          <p className="mt-2 text-xs text-green-100/70">Sesión independiente del cliente web</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <img src="/polleria/logo-lopez.png" alt="Logo" className="mx-auto h-20 w-auto rounded-xl" />
          </div>

          {mode === 'recover' ? (
            <RecoverAccountForm
              accountType="staff"
              defaultEmail={email}
              onBack={() => setMode('login')}
              onLocalReset={(identifier, newPassword) => resetStaffPassword(identifier, newPassword)}
            />
          ) : (
            <>
              <h2 className="text-3xl font-black text-gray-900">Entrar al Sistema</h2>
              <p className="mt-1 text-sm text-gray-500">Personal del local (admin, caja, cocina, mozo).</p>

              <form onSubmit={onSubmit} className="mt-8 space-y-4">
                <div>
                  <label className="text-sm font-bold text-gray-700">Correo</label>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm text-gray-900 focus:border-[#1a3d1a] focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    inputMode="email"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700">Contraseña</label>
                  <input
                    type="password"
                    className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm text-gray-900 focus:border-[#1a3d1a] focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>}
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400"
                >
                  Ingresar
                </button>
              </form>

              <button
                type="button"
                onClick={() => setMode('recover')}
                className="mt-3 w-full text-center text-sm font-semibold text-[#1a3d1a] hover:underline"
              >
                ¿Olvidaste tu contraseña? Recuperar por WhatsApp
              </button>

              <p className="mt-8 text-xs font-bold uppercase tracking-wider text-gray-400">Acceso rápido</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {DEMOS.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={async () => {
                      const err = await login(d.email, d.password)
                      if (err) {
                        setEmail(d.email)
                        setPassword(d.password)
                        setError(err)
                        return
                      }
                      navigate('/')
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-green-200 hover:shadow-md"
                  >
                    <span className="text-2xl">{d.icon}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{d.role}</p>
                      <p className="text-[11px] text-gray-500">{d.does}</p>
                    </div>
                  </button>
                ))}
              </div>

              <p className="mt-8 text-center text-sm text-gray-500">
                ¿Eres cliente?{' '}
                <Link to="/web/cuenta" className="font-bold text-[#1a3d1a] hover:underline">
                  Entra a tu cuenta
                </Link>
              </p>
              <p className="mt-4 text-center text-[10px] text-gray-400">v{APP_VERSION}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
