/**
 * Compartir el ticket con el sistema operativo.
 *
 * En tablet es la vía práctica cuando el navegador no puede hablar con la
 * impresora de red: se comparte la imagen del ticket y el usuario elige RawBT,
 * la app de la impresora, WhatsApp o lo que tenga instalado.
 */

import { renderPng, renderText, type TicketDoc } from './ticket-doc'

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded'

export interface TicketSharePayload {
  title: string
  text: string
  file: File | null
}

function slug(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

/**
 * Prepara la imagen por adelantado: `navigator.share` exige gesto del usuario y
 * generar el PNG dentro del handler hace que iOS descarte la llamada.
 */
export async function prepareTicketShare(doc: TicketDoc): Promise<TicketSharePayload> {
  const text = renderText(doc)
  try {
    const blob = await renderPng(doc)
    return {
      title: doc.title,
      text,
      file: new File([blob], `${slug(doc.title) || 'ticket'}.png`, { type: 'image/png' }),
    }
  } catch {
    return { title: doc.title, text, file: null }
  }
}

export function canShareTickets(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

function download(payload: TicketSharePayload) {
  const blob = payload.file ?? new Blob([payload.text], { type: 'text/plain;charset=utf-8' })
  const name = payload.file ? payload.file.name : `${slug(payload.title) || 'ticket'}.txt`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function shareTicketPayload(payload: TicketSharePayload): Promise<ShareOutcome> {
  if (!canShareTickets()) {
    download(payload)
    return 'downloaded'
  }

  const withFile: ShareData | null = payload.file ? { files: [payload.file], title: payload.title } : null

  try {
    if (withFile && (!navigator.canShare || navigator.canShare(withFile))) {
      await navigator.share(withFile)
      return 'shared'
    }
    await navigator.share({ title: payload.title, text: payload.text })
    return 'shared'
  } catch (e: unknown) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled'
    download(payload)
    return 'downloaded'
  }
}
