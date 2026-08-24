import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PhoneOtpLogin } from '../components/PhoneOtpLogin'
import { ROLE_HOME, type Role } from '../types'
import { APP_VERSION } from '../lib/version'
import { apiLogin, setApiToken } from '../lib/apiClient'

type Mode = 'password' | 'otp'

export function Login() {
  const { user, loginWithSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('cajero@lopez.pe')
  const [password, setPassword] = useState('cajero123')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from || ROLE_HOME[user.role]} replace />
  }

  const loginPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      const data = await apiLogin(email, password)
      setApiToken(data.token)
      await loginWithSession({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role as Role,
      })
      navigate(ROLE_HOME[data.user.role as Role] || '/')
    } catch (ex) {
      setErr((ex as Error).message || 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-[#1a3d1a] px-6 py-12 text-white">
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30" />
        <div className="relative text-center">
          <img src="/polleria/logo-lopez.png" alt="Chifa Pollería Lopez" className="mx-auto h-36 w-auto rounded-2xl shadow-2xl" />
          <h1 className="mt-8 text-4xl font-black tracking-tight sm:text-5xl">Sistema de Gestión</h1>
          <p className="mt-3 text-lg text-green-200">Chifa-Pollería Lopez · Acceso personal</p>
          <p className="mt-2 text-xs text-green-100/70">Demo: correo + clave · o WhatsApp OTP</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <img src="/polleria/logo-lopez.png" alt="Logo" className="mx-auto h-20 w-auto rounded-xl" />
          </div>

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode('password')}
              className={`rounded-xl py-2.5 text-sm font-bold ${mode === 'password' ? 'bg-[#1a3d1a] text-white' : 'text-gray-500'}`}
            >
              Correo (demo)
            </button>
            <button
              type="button"
              onClick={() => setMode('otp')}
              className={`rounded-xl py-2.5 text-sm font-bold ${mode === 'otp' ? 'bg-[#1a3d1a] text-white' : 'text-gray-500'}`}
            >
              WhatsApp
            </button>
          </div>

          {mode === 'password' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-3xl font-black text-gray-900">Entrar al Sistema</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Una cuenta por rol: admin, cajero (pago), cocina, mozo. Ver README.
                </p>
              </div>
              {err ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{err}</div> : null}
              <form onSubmit={loginPassword} className="space-y-3">
                <div>
                  <label className="text-sm font-bold text-gray-700">Correo</label>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm focus:border-[#1a3d1a] focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    list="demo-emails"
                    required
                  />
                  <datalist id="demo-emails">
                    <option value="admin@lopez.pe" />
                    <option value="cajero@lopez.pe" />
                    <option value="cocina@lopez.pe" />
                    <option value="mozo@lopez.pe" />
                  </datalist>
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-700">Contraseña</label>
                  <input
                    className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm focus:border-[#1a3d1a] focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(
                    [
                      ['admin@lopez.pe', 'admin123', 'Admin'],
                      ['cajero@lopez.pe', 'cajero123', 'Pago'],
                      ['cocina@lopez.pe', 'cocina123', 'Cocina'],
                      ['mozo@lopez.pe', 'mozo123', 'Mozo'],
                    ] as const
                  ).map(([em, pw, label]) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => {
                        setEmail(em)
                        setPassword(pw)
                      }}
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#1a3d1a] shadow-sm ring-1 ring-black/5"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400 disabled:opacity-60"
                >
                  {busy ? 'Entrando…' : 'Entrar'}
                </button>
              </form>
            </div>
          ) : (
            <PhoneOtpLogin
              accountType="staff"
              purpose="login"
              title="Entrar con WhatsApp"
              hint="Celular registrado del personal + código que llega por WhatsApp."
              onSuccess={async (data) => {
                if (!data.token || !data.user) throw new Error('Respuesta inválida del API')
                setApiToken(data.token)
                await loginWithSession({
                  id: data.user.id,
                  name: data.user.name,
                  email: data.user.email,
                  role: data.user.role as Role,
                })
                navigate('/')
              }}
            />
          )}

          <div className="mt-8 space-y-2 text-center text-sm text-gray-500">
            <p>
              ¿Eres cliente?{' '}
              <Link to="/web/cuenta" className="font-bold text-[#1a3d1a] hover:underline">
                Entra a tu cuenta
              </Link>
            </p>
            <p>
              ¿Eres conductor?{' '}
              <Link to="/conductor" className="font-bold text-[#1a3d1a] hover:underline">
                App de delivery
              </Link>
            </p>
            <p className="pt-2 text-[10px] text-gray-400">v{APP_VERSION}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
