import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { PhoneOtpLogin } from '../components/PhoneOtpLogin'
import { ROLE_HOME, type Role } from '../types'
import { APP_VERSION } from '../lib/version'
import { setApiToken } from '../lib/apiClient'

export function Login() {
  const { user, loginWithSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  if (user) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from || ROLE_HOME[user.role]} replace />
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative flex flex-col items-center justify-center overflow-hidden bg-[#1a3d1a] px-6 py-12 text-white">
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/30" />
        <div className="relative text-center">
          <img src="/polleria/logo-lopez.png" alt="Chifa Pollería Lopez" className="mx-auto h-36 w-auto rounded-2xl shadow-2xl" />
          <h1 className="mt-8 text-4xl font-black tracking-tight sm:text-5xl">Sistema de Gestión</h1>
          <p className="mt-3 text-lg text-green-200">Chifa-Pollería Lopez · Acceso personal</p>
          <p className="mt-2 text-xs text-green-100/70">Login por WhatsApp · celular + código</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-gray-50 px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:hidden">
            <img src="/polleria/logo-lopez.png" alt="Logo" className="mx-auto h-20 w-auto rounded-xl" />
          </div>

          <PhoneOtpLogin
            accountType="staff"
            purpose="login"
            title="Entrar al Sistema"
            hint="Personal del local. Ingresa tu celular registrado y el código de WhatsApp. También sirve para recuperar sesión."
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
