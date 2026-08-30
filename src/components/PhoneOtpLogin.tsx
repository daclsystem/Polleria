import { useState } from 'react'
import { apiFetch } from '../lib/apiClient'

export type OtpAccountType = 'staff' | 'customer' | 'driver'

type Step = 'phone' | 'code'

export function PhoneOtpLogin({
  accountType,
  purpose = 'login',
  title,
  hint,
  showName = false,
  defaultPhone = '',
  onSuccess,
  onSwitchPurpose,
}: {
  accountType: OtpAccountType
  purpose?: 'login' | 'register'
  title: string
  hint?: string
  showName?: boolean
  /** Celular inicial (vacío = el usuario escribe el suyo) */
  defaultPhone?: string
  onSuccess: (data: {
    token?: string
    user?: {
      id: string
      name: string
      email: string
      role: string
      accountType?: string
      pin?: string
      phone?: string
      photoUrl?: string
      isSystem?: boolean
    }
    customer?: {
      id: string
      name: string
      phone: string
      email?: string
      address?: string
      createdAt: string
      password: string
      photoUrl?: string
    }
    driver?: {
      id: string
      name: string
      phone: string
      vehicleInfo?: string
      active: boolean
      photoUrl?: string
    }
  }) => void | Promise<void>
  onSwitchPurpose?: () => void
}) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState(defaultPhone)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const digits = phone.replace(/\D/g, '')
  const phoneOk = accountType === 'driver' ? digits.length >= 5 : digits.length >= 9

  const goCode = (message?: string) => {
    if (!phoneOk) {
      setErr('Primero escribe tu celular')
      return
    }
    setStep('code')
    setCode('')
    if (message) setMsg(message)
  }

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    if (accountType === 'driver' && digits.length < 9) {
      goCode('Número de prueba. Escribe el código 123456.')
      return
    }
    setBusy(true)
    try {
      const data = await apiFetch<{
        ok: boolean
        message: string
        whatsappSent?: boolean
        fallbackCode?: string
        fallbackUsed?: boolean
      }>('/api/auth/otp/request', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
          accountType,
          purpose,
          phone,
          name: showName ? name : undefined,
        }),
      })
      goCode(
        data.whatsappSent === false
          ? data.message ||
              (data.fallbackCode
                ? `WhatsApp no disponible. Usa el código ${data.fallbackCode}`
                : 'No se pudo enviar el WhatsApp. Si no llega, usa 123456.')
          : data.message || 'Te enviamos un código por WhatsApp.',
      )
    } catch (e) {
      const msg = (e as Error).message || 'No se pudo enviar el código. Revisa el número e inténtalo de nuevo.'
      if (accountType === 'driver') {
        goCode('WhatsApp no se envió. Escribe el código 123456 para entrar.')
        return
      }
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      const data = await apiFetch<{
        ok: boolean
        token?: string
        user?: { id: string; name: string; email: string; role: string }
        driver?: {
          id: string
          name: string
          phone: string
          vehicleInfo?: string
          active: boolean
        }
        customer?: {
          id: string
          name: string
          phone: string
          email?: string
          address?: string
          createdAt: string
          password: string
        }
      }>('/api/auth/otp/verify', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ accountType, phone, code }),
      })
      await onSuccess(data)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-3xl font-black text-gray-900">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-gray-500">{hint}</p> : null}
      </div>

      {err ? <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{err}</div> : null}
      {msg ? <div className="rounded-xl bg-green-50 px-3 py-2 text-sm font-medium text-green-700">{msg}</div> : null}

      {step === 'phone' ? (
        <form onSubmit={requestCode} className="space-y-4">
          {showName ? (
            <div>
              <label className="text-sm font-bold text-gray-700">Nombre completo</label>
              <input
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm focus:border-[#1a3d1a] focus:ring-2 focus:ring-green-500/20 focus:outline-none"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan Pérez"
                required
              />
            </div>
          ) : null}
          <div>
            <label className="text-sm font-bold text-gray-700">Celular</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm focus:border-[#1a3d1a] focus:ring-2 focus:ring-green-500/20 focus:outline-none"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="999 999 999"
              inputMode="tel"
              autoComplete="tel"
              required
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Te enviaremos un código de 6 dígitos por WhatsApp.
            </p>
          </div>
          <button
            type="submit"
            disabled={busy || !phoneOk}
            className="w-full rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400 disabled:opacity-60"
          >
            {busy ? 'Enviando…' : purpose === 'register' ? 'Enviar código y crear cuenta' : 'Continuar'}
          </button>
          {onSwitchPurpose ? (
            <button type="button" onClick={onSwitchPurpose} className="w-full text-center text-sm font-semibold text-gray-500 hover:underline">
              {purpose === 'login' ? '¿Primera vez? Regístrate' : '¿Ya tienes cuenta? Ingresa'}
            </button>
          ) : null}
        </form>
      ) : (
        <form onSubmit={verifyCode} className="space-y-4">
          <div>
            <label className="text-sm font-bold text-gray-700">Código</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-center text-2xl font-black tracking-[0.4em] focus:border-[#1a3d1a] focus:ring-2 focus:ring-green-500/20 focus:outline-none"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
            />
            <p className="mt-1.5 text-center text-xs text-gray-400">
              Enviado a <strong>{phone}</strong>
            </p>
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-2xl bg-[#ffd700] py-4 text-lg font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:bg-yellow-400 disabled:opacity-60"
          >
            {busy ? 'Verificando…' : 'Entrar'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setStep('phone')
              setCode('')
              setMsg(null)
              setErr(null)
            }}
            className="w-full text-center text-sm font-semibold text-gray-500 hover:underline"
          >
            Cambiar número
          </button>
        </form>
      )}
    </div>
  )
}
