import { useRef, useState } from 'react'
import { MessageCircle, Smartphone } from 'lucide-react'
import { apiFetch } from '../lib/apiClient'

export type OtpAccountType = 'staff' | 'customer' | 'driver'

type Step = 'phone' | 'code'

const fieldClass =
  'mt-1.5 min-h-12 w-full rounded-2xl border border-ink/10 bg-cream px-4 text-base text-ink outline-none transition placeholder:text-ink/30 focus:border-[#1a3d1a] focus:bg-surface focus:ring-2 focus:ring-[#1a3d1a]/15 dark:focus:border-gold'

const btnClass =
  'min-h-12 w-full touch-manipulation rounded-2xl bg-gold px-4 text-base font-black text-[#1a3d1a] shadow-[0_12px_28px_-12px_rgba(255,215,0,0.7)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-55 sm:min-h-14 sm:text-[17px]'

function OtpBoxes({
  value,
  onChange,
  disabled,
  onFilled,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  onFilled?: () => void
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  const apply = (raw: string, start = 0) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    if (raw.replace(/\D/g, '').length > 1) {
      onChange(digits)
      refs.current[Math.min(digits.length, 5)]?.focus()
      if (digits.length === 6) onFilled?.()
      return
    }
    const next = value.split('')
    while (next.length < 6) next.push('')
    next[start] = digits.slice(-1)
    const joined = next.join('').replace(/\D/g, '').slice(0, 6)
    onChange(joined)
    if (digits && start < 5) refs.current[start + 1]?.focus()
    if (joined.length === 6) onFilled?.()
  }

  return (
    <div className="mt-1.5 flex gap-1.5 sm:gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          aria-label={`Dígito ${i + 1} de 6`}
          value={value[i] || ''}
          onChange={(e) => apply(e.target.value, i)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !value[i] && i > 0) {
              e.preventDefault()
              const next = value.slice(0, i - 1)
              onChange(next)
              refs.current[i - 1]?.focus()
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
            if (!text) return
            e.preventDefault()
            onChange(text)
            refs.current[Math.min(text.length, 5)]?.focus()
            if (text.length === 6) onFilled?.()
          }}
          className="h-12 min-w-0 flex-1 rounded-xl border border-ink/10 bg-cream text-center text-lg font-black text-ink outline-none transition focus:border-gold focus:bg-surface focus:ring-2 focus:ring-gold/30 sm:h-14 sm:rounded-2xl sm:text-xl"
        />
      ))}
    </div>
  )
}

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
  const formRef = useRef<HTMLFormElement>(null)

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
      goCode('Número de prueba. Escribe el código que te indiquen.')
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
      const sent = data.whatsappSent !== false
      goCode(
        sent
          ? data.message || 'Te enviamos un código por WhatsApp.'
          : 'No se pudo enviar el WhatsApp. Si no llega, vuelve a intentarlo en un momento.',
      )
    } catch (e) {
      const fail = (e as Error).message || 'No se pudo enviar el código. Revisa el número e inténtalo de nuevo.'
      if (accountType === 'driver') {
        goCode('WhatsApp no se envió. Escribe el código para entrar.')
        return
      }
      setErr(fail)
    } finally {
      setBusy(false)
    }
  }

  const verifyCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (busy || code.length !== 6) return
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
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h2 className="text-[1.45rem] font-black leading-tight tracking-tight text-ink sm:text-3xl">
          {step === 'code' ? 'Ingresa el código' : title}
        </h2>
        {step === 'phone' && hint ? (
          <p className="mt-1 text-sm leading-relaxed text-ink/50">{hint}</p>
        ) : null}
        {step === 'code' ? (
          <p className="mt-1 text-sm text-ink/50">
            WhatsApp al <span className="font-bold text-ink/80">{phone}</span>
          </p>
        ) : null}
      </div>

      {err ? (
        <div className="rounded-2xl bg-red-500/10 px-3.5 py-2.5 text-sm font-medium text-red-700 dark:text-red-300">
          {err}
        </div>
      ) : null}
      {msg && step === 'phone' ? (
        <div className="rounded-2xl bg-[#1a3d1a]/10 px-3.5 py-2.5 text-sm font-medium text-[#1a3d1a] dark:bg-gold/10 dark:text-gold">
          {msg}
        </div>
      ) : null}

      {step === 'phone' ? (
        <form onSubmit={requestCode} className="space-y-4">
          {showName ? (
            <div>
              <label className="text-[13px] font-bold text-ink/70">Nombre completo</label>
              <input
                className={fieldClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Juan Pérez"
                required
              />
            </div>
          ) : null}
          <div>
            <label className="text-[13px] font-bold text-ink/70">Celular</label>
            <div className="mt-1.5 flex min-h-12 overflow-hidden rounded-2xl border border-ink/10 bg-cream focus-within:border-[#1a3d1a] focus-within:ring-2 focus-within:ring-[#1a3d1a]/15 dark:focus-within:border-gold">
              <span className="flex shrink-0 items-center gap-1 border-r border-ink/10 bg-ink/[0.04] px-3 text-sm font-bold text-ink/55 sm:gap-1.5 sm:px-3.5">
                <Smartphone size={15} strokeWidth={2.2} className="hidden xs:block sm:inline" />
                +51
              </span>
              <input
                className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink/30 sm:px-4"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="999 999 999"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink/40">
              <MessageCircle size={13} strokeWidth={2.2} className="shrink-0 text-[#25D366]" />
              Código de 6 dígitos por WhatsApp
            </p>
          </div>
          <button type="submit" disabled={busy || !phoneOk} className={btnClass}>
            {busy ? 'Enviando…' : purpose === 'register' ? 'Enviar código y crear cuenta' : 'Continuar'}
          </button>
          {onSwitchPurpose ? (
            <button
              type="button"
              onClick={onSwitchPurpose}
              className="min-h-11 w-full text-center text-sm font-semibold text-ink/45 hover:text-ink hover:underline"
            >
              {purpose === 'login' ? '¿Primera vez? Regístrate' : '¿Ya tienes cuenta? Ingresa'}
            </button>
          ) : null}
        </form>
      ) : (
        <form ref={formRef} onSubmit={verifyCode} className="space-y-4">
          <div>
            <label className="text-[13px] font-bold text-ink/70">Código</label>
            <OtpBoxes
              value={code}
              disabled={busy}
              onChange={setCode}
              onFilled={() => formRef.current?.requestSubmit()}
            />
          </div>
          <button type="submit" disabled={busy || code.length !== 6} className={btnClass}>
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
            className="min-h-11 w-full text-center text-sm font-semibold text-ink/45 hover:text-ink hover:underline"
          >
            Cambiar número
          </button>
        </form>
      )}
    </div>
  )
}
