import { apiUrl } from './api'

export type RecoverAccountType = 'staff' | 'customer'

function normalizePhone(phone: string) {
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 9 && digits.startsWith('9')) digits = `51${digits}`
  return digits
}

export async function requestRecoverCode(input: {
  accountType: RecoverAccountType
  email?: string
  phone?: string
  destinationPhone?: string
  displayName?: string
}): Promise<{ ok: boolean; message: string; error?: string }> {
  const res = await fetch(apiUrl('/api/auth/recover/request'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountType: input.accountType,
      email: input.email,
      phone: input.phone,
    }),
  })
  const data = (await res.json()) as { ok?: boolean; message?: string; error?: string }
  if (!res.ok) return { ok: false, message: data.error || 'No se pudo enviar el código', error: data.error }
  return { ok: true, message: data.message || 'Código enviado por WhatsApp' }
}

export async function confirmRecoverCode(input: {
  accountType: RecoverAccountType
  email?: string
  phone?: string
  code: string
  newPassword: string
  onLocalReset?: (identifier: string, newPassword: string) => boolean | Promise<boolean>
}): Promise<{ ok: boolean; message: string; error?: string }> {
  const res = await fetch(apiUrl('/api/auth/recover/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountType: input.accountType,
      email: input.email,
      phone: input.phone,
      code: input.code,
      newPassword: input.newPassword,
    }),
  })
  const data = (await res.json()) as { ok?: boolean; message?: string; error?: string }
  if (!res.ok) return { ok: false, message: data.error || 'No se pudo actualizar', error: data.error }
  return { ok: true, message: data.message || 'Contraseña actualizada' }
}

export { normalizePhone }
