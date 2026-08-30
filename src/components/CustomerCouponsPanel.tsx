import { useEffect, useState } from 'react'
import { TicketPercent, Copy } from 'lucide-react'
import { apiPublicCoupons, type CouponDto } from '../lib/apiClient'
import { soles } from '../lib/format'

function couponBenefit(c: CouponDto) {
  if (c.discountType === 'percent') {
    const max = c.maxDiscount != null ? ` (máx. ${soles(c.maxDiscount)})` : ''
    return `${c.discountValue}% OFF${max}`
  }
  return `${soles(c.discountValue)} de descuento`
}

export function CustomerCouponsPanel({ onApply }: { onApply?: (code: string) => void }) {
  const [list, setList] = useState<CouponDto[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const r = await apiPublicCoupons()
        setList(r.coupons || [])
      } catch (e) {
        setError((e as Error).message || 'No se pudo cargar la cuponera')
      }
    })()
  }, [])

  const useCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      /* ignore */
    }
    onApply?.(code)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-black text-gray-900">Cuponera</h2>
        <p className="text-sm text-gray-500">Descuentos activos para tu próximo pedido</p>
      </div>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {list.length === 0 && !error ? (
        <div className="rounded-2xl bg-gray-50 py-10 text-center">
          <TicketPercent className="mx-auto text-gray-300" size={32} />
          <p className="mt-3 text-sm text-gray-500">No hay cupones disponibles por ahora</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((c) => (
            <div
              key={c.id}
              className="rounded-2xl bg-gradient-to-br from-[#1a3d1a] to-[#0f2a0f] p-4 text-white shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-wider text-[#ffd700] uppercase">
                    {couponBenefit(c)}
                  </p>
                  <p className="mt-1 text-lg font-black">{c.title}</p>
                  {c.description ? (
                    <p className="mt-1 text-sm text-green-100/80">{c.description}</p>
                  ) : null}
                  <p className="mt-2 font-mono text-sm font-bold tracking-widest text-[#ffd700]">
                    {c.code}
                  </p>
                  {c.minSubtotal > 0 ? (
                    <p className="mt-1 text-xs text-green-200/70">Mínimo {soles(c.minSubtotal)}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => void useCode(c.code)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#ffd700] px-3 py-2 text-xs font-black text-[#1a3d1a]"
                >
                  <Copy size={14} /> {onApply ? 'Usar' : 'Copiar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
