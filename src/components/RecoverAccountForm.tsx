import { useState } from 'react'
import { confirmRecoverCode, requestRecoverCode, type RecoverAccountType } from '../lib/authRecover'

type Step = 'request' | 'confirm' | 'done'

export function RecoverAccountForm({
  accountType,
  onBack,
  onLocalReset,
  defaultEmail = '',
  defaultPhone = '',
}: {
  accountType: RecoverAccountType
  onBack: () => void
  onLocalReset?: (identifier: string, newPassword: string) => boolean | Promise<boolean>
  defaultEmail?: string
  defaultPhone?: string
}) {
  const [step, setStep] = useState<Step>('request')
  const [email, setEmail] = useState(defaultEmail)
  const [phone, setPhone] = useState(defaultPhone)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const request = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      const res = await requestRecoverCode({
        accountType,
        email: accountType === 'staff' ? email : undefined,
        phone: accountType === 'customer' ? phone : phone || undefined,
        destinationPhone: phone,
        displayName: accountType === 'staff' ? email : phone,
      })
      if (!res.ok) {
        setErr(res.message)
        return
      }
      setMsg(res.message)
      setStep('confirm')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setMsg(null)
    setBusy(true)
    try {
      const res = await confirmRecoverCode({
        accountType,
        email: accountType === 'staff' ? email : undefined,
        phone: accountType === 'customer' ? phone : undefined,
        code,
        newPassword,
        onLocalReset,
      })
      if (!res.ok) {
        setErr(res.message)
        return
      }
      setMsg(res.message)
      setStep('done')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-ink/60 hover:underline">
        ← Volver al login
      </button>
      <h3 className="text-xl font-black text-gray-900">Recuperar cuenta</h3>
      <p className="text-sm text-gray-500">
        Te enviaremos un código de 6 dígitos por <strong>WhatsApp</strong> ({accountType === 'staff' ? 'personal' : 'cliente'}).
      </p>

      {err && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{err}</div>}
      {msg && <div className="rounded-xl bg-green-50 px-3 py-2 text-sm font-medium text-green-700">{msg}</div>}

      {step === 'request' && (
        <form onSubmit={request} className="space-y-3">
          {accountType === 'staff' ? (
            <div>
              <label className="text-sm font-bold text-gray-700">Correo de la cuenta</label>
              <input
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          ) : (
            <div>
              <label className="text-sm font-bold text-gray-700">Celular de la cuenta</label>
              <input
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm"
                inputMode="tel"
                placeholder="999 111 222"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
          )}
          {accountType === 'staff' && (
            <div>
              <label className="text-sm font-bold text-gray-700">Celular WhatsApp (si no está registrado)</label>
              <input
                className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm"
                inputMode="tel"
                placeholder="962797752"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-[#25d366] py-3.5 font-black text-white disabled:opacity-50"
          >
            {busy ? 'Enviando…' : 'Enviar código por WhatsApp'}
          </button>
        </form>
      )}

      {step === 'confirm' && (
        <form onSubmit={confirm} className="space-y-3">
          <div>
            <label className="text-sm font-bold text-gray-700">Código de 6 dígitos</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-center text-2xl tracking-[0.4em]"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
          </div>
          <div>
            <label className="text-sm font-bold text-gray-700">Nueva contraseña</label>
            <input
              type="password"
              className="mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full rounded-2xl bg-[#ffd700] py-3.5 font-black text-[#1a3d1a] disabled:opacity-50"
          >
            {busy ? 'Guardando…' : 'Cambiar contraseña'}
          </button>
        </form>
      )}

      {step === 'done' && (
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-2xl bg-[#1a3d1a] py-3.5 font-black text-[#ffd700]"
        >
          Ir a iniciar sesión
        </button>
      )}
    </div>
  )
}
