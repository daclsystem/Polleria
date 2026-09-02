import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Star } from 'lucide-react'
import { apiFetch } from '../lib/apiClient'
import { padOrder } from '../lib/format'
import { publicWebUrl } from '../lib/paths'

export function WebCalificar() {
  const { orderId = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tel = (params.get('tel') || '').replace(/\D/g, '')
  const [stars, setStars] = useState(5)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [orderNo, setOrderNo] = useState<number | null>(null)

  useEffect(() => {
    if (!orderId) return
    const q = tel ? `?tel=${encodeURIComponent(tel)}` : ''
    void apiFetch<{ number?: number; customerName?: string }>(`/api/orders/track/${orderId}${q}`, {
      auth: false,
    })
      .then((r) => setOrderNo(r.number ?? null))
      .catch(() => setOrderNo(null))
  }, [orderId, tel])

  const send = async () => {
    if (!orderId || tel.length < 6) {
      setError('Abre el enlace desde WhatsApp para identificar tu pedido.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await apiFetch<{ ok: boolean; already?: boolean; message?: string }>('/api/reviews/visit', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ orderId, tel, stars, comment }),
      })
      setDone(r.already ? r.message || 'Ya calificaste este pedido. ¡Gracias!' : '¡Gracias! Tu opinión nos ayuda a mejorar.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#0c1c0e] px-4 py-10 text-white">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 text-ink shadow-xl">
        <p className="text-xs font-bold tracking-wide text-ink/40 uppercase">Chifa-Pollería Lopez</p>
        <h1 className="mt-1 font-display text-3xl tracking-tight">¿Cómo te tratamos?</h1>
        <p className="mt-1 text-sm text-ink/55">
          {orderNo ? `Pedido ${padOrder(orderNo)}. ` : ''}Toca las estrellas y, si quieres, déjanos un comentario.
        </p>
        {done ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm font-semibold text-emerald-800">{done}</p>
            <a
              href={publicWebUrl()}
              className="inline-flex min-h-11 items-center rounded-2xl bg-gold px-4 text-sm font-black text-[#1a3d1a]"
            >
              Pedir de nuevo
            </a>
          </div>
        ) : (
          <>
            <div className="mt-5 flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStars(n)}
                  className="p-1"
                  aria-label={`${n} estrellas`}
                >
                  <Star
                    size={32}
                    className={n <= stars ? 'fill-gold text-gold' : 'text-ink/20'}
                  />
                </button>
              ))}
            </div>
            <textarea
              className="mt-4 min-h-24 w-full rounded-2xl border border-ink/10 p-3 text-sm outline-none focus:border-gold"
              placeholder="El pollo, la atención, el tiempo… (opcional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            {error ? <p className="mt-2 text-xs font-semibold text-ember">{error}</p> : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void send()}
              className="mt-4 min-h-12 w-full rounded-2xl bg-[#1a3d1a] text-sm font-bold text-gold disabled:opacity-40"
            >
              {busy ? 'Enviando…' : 'Enviar calificación'}
            </button>
            <button
              type="button"
              className="mt-2 w-full text-xs text-ink/40"
              onClick={() => navigate('/')}
            >
              Volver a la carta
            </button>
          </>
        )}
      </div>
    </div>
  )
}
