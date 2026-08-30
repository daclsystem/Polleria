import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Minus, Plus, Star, X } from 'lucide-react'
import { apiCreateProductReview, apiProductReviews, type ProductReviewDto } from '../lib/apiClient'
import { getCustomerSession } from '../lib/customerSession'
import { soles } from '../lib/format'
import type { OrderItem, Product, ProductOptionGroup, SelectedOption } from '../types'

interface Props {
  product: Product
  suggestions: Product[]
  onAdd: (item: OrderItem) => void
  onAddSuggestion: (productId: string) => void
  onClose: () => void
}

/**
 * Modal multinivel tipo PedidosYa:
 * 1) ficha del plato → 2) un grupo de opciones por pantalla (Aceptar) → 3) cantidad/notas → Agregar
 */
export function ProductModal({ product, suggestions, onAdd, onAddSuggestion, onClose }: Props) {
  const groups = [...(product.optionGroups ?? [])].sort((a, b) => {
    const rank = (title: string) => {
      const t = title.toLowerCase()
      if (t.includes('presa')) return 0
      if (t.includes('papa')) return 1
      if (t.includes('tamaño') || t.includes('tamano')) return 2
      if (t.includes('crema')) return 3
      if (t.includes('adicional')) return 4
      if (t.includes('bebida')) return 5
      return 9
    }
    return rank(a.title) - rank(b.title)
  })
  /** -1 = intro, 0..n-1 = grupo, n = resumen/cantidad */
  const [step, setStep] = useState(groups.length > 0 ? 0 : -1)
  const [qty, setQty] = useState(1)
  const [selected, setSelected] = useState<SelectedOption[]>([])
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<ProductReviewDto[]>([])
  const [reviewAvg, setReviewAvg] = useState(product.ratingAvg || 0)
  const [reviewCount, setReviewCount] = useState(product.reviewCount || 0)
  const [stars, setStars] = useState(5)
  const [reviewMsg, setReviewMsg] = useState<string | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)

  useEffect(() => {
    setStep(groups.length > 0 ? 0 : -1)
    setSelected([])
    setQty(1)
    setNotes('')
    setError(null)
  }, [product.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    void apiProductReviews(product.id)
      .then((r) => {
        if (!alive) return
        setReviews(r.reviews || [])
        setReviewAvg(r.average || 0)
        setReviewCount(r.count || 0)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [product.id])

  const optionsTotal = selected.reduce((s, o) => s + o.price, 0)
  const unitPrice = product.price + optionsTotal
  const total = unitPrice * qty
  const summaryStep = groups.length
  const currentGroup: ProductOptionGroup | null =
    step >= 0 && step < groups.length ? groups[step] : null

  const groupSelectedCount = (groupId: string) => selected.filter((s) => s.groupId === groupId).length

  const toggleOption = (
    groupId: string,
    optionId: string,
    optionName: string,
    price: number,
    maxSelect: number,
  ) => {
    setError(null)
    setSelected((prev) => {
      const existing = prev.find((s) => s.groupId === groupId && s.optionId === optionId)
      if (existing) {
        return prev.filter((s) => !(s.groupId === groupId && s.optionId === optionId))
      }
      const groupCount = prev.filter((s) => s.groupId === groupId).length
      if (maxSelect === 1) {
        return [
          ...prev.filter((s) => s.groupId !== groupId),
          { groupId, optionId, name: optionName, price },
        ]
      }
      if (groupCount >= maxSelect) return prev
      return [...prev, { groupId, optionId, name: optionName, price }]
    })
  }

  const isSelected = (groupId: string, optionId: string) =>
    selected.some((s) => s.groupId === groupId && s.optionId === optionId)

  const acceptGroup = () => {
    if (!currentGroup) return
    if (currentGroup.required && groupSelectedCount(currentGroup.id) === 0) {
      setError('Elige una opción para continuar')
      return
    }
    setError(null)
    setStep((s) => s + 1)
  }

  const goBack = () => {
    setError(null)
    if (step <= 0) {
      onClose()
      return
    }
    setStep((s) => s - 1)
  }

  const handleAdd = () => {
    const missing = groups
      .filter((g) => g.required)
      .filter((g) => !selected.some((s) => s.groupId === g.id))
      .map((g) => g.title)
    if (missing.length > 0) {
      setError(`Falta: ${missing.join(', ')}`)
      const idx = groups.findIndex((g) => missing.includes(g.title))
      if (idx >= 0) setStep(idx)
      return
    }
    onAdd({
      productId: product.id,
      name: product.name,
      qty,
      price: unitPrice,
      notes: notes.trim() || undefined,
      selectedOptions: selected.length > 0 ? selected : undefined,
    })
    onClose()
  }

  const headerTitle =
    currentGroup?.title || (step === summaryStep ? 'Tu pedido' : product.name)

  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Cerrar" />
      <div className="absolute inset-x-0 bottom-0 z-10 flex max-h-[min(88dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
        {/* Header estilo PedidosYa */}
        <div className="flex items-center gap-2 border-b border-black/5 px-3 py-3">
          <button
            type="button"
            onClick={goBack}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Atrás"
          >
            <ArrowLeft size={22} />
          </button>
          <h2 className="flex-1 text-center text-lg font-black text-gray-900">{headerTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress */}
        {groups.length > 0 ? (
          <div className="flex gap-1 px-4 pt-3">
            {groups.map((g, i) => (
              <div
                key={g.id}
                className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-[#e11d2e]' : 'bg-gray-200'}`}
              />
            ))}
            <div
              className={`h-1 flex-1 rounded-full ${step >= summaryStep ? 'bg-[#e11d2e]' : 'bg-gray-200'}`}
            />
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Paso de grupo */}
          {currentGroup ? (
            <div>
              <p className="mb-3 text-sm font-bold text-gray-800">
                {currentGroup.required ? 'Elige' : 'Elige (opcional)'}
                {currentGroup.maxSelect > 1 ? ` · hasta ${currentGroup.maxSelect}` : ''}
              </p>
              <div className="overflow-hidden rounded-2xl border border-gray-200">
                {currentGroup.options.map((opt, idx) => {
                  const active = isSelected(currentGroup.id, opt.id)
                  const radio = currentGroup.maxSelect === 1
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        toggleOption(
                          currentGroup.id,
                          opt.id,
                          opt.name,
                          opt.price,
                          currentGroup.maxSelect,
                        )
                      }
                      className={`flex w-full items-center gap-3 px-4 py-4 text-left transition ${
                        idx > 0 ? 'border-t border-gray-100' : ''
                      } ${active ? 'bg-red-50' : 'bg-white hover:bg-gray-50'}`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                          radio ? 'rounded-full' : 'rounded-md'
                        } ${active ? 'border-[#e11d2e] bg-[#e11d2e]' : 'border-gray-300'}`}
                      >
                        {active ? (
                          radio ? (
                            <span className="h-2 w-2 rounded-full bg-white" />
                          ) : (
                            <Check size={12} className="text-white" strokeWidth={3} />
                          )
                        ) : null}
                      </span>
                      <span className="flex-1 text-[15px] font-semibold text-gray-900">{opt.name}</span>
                      {opt.price > 0 ? (
                        <span className="text-sm font-bold text-gray-700">+{soles(opt.price)}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              {error ? <p className="mt-3 text-center text-sm font-semibold text-red-600">{error}</p> : null}
            </div>
          ) : null}

          {/* Resumen final */}
          {step === summaryStep || (groups.length === 0 && step === -1) ? (
            <div className="space-y-4">
              <div className="text-center">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="mx-auto h-28 w-28 rounded-3xl object-cover"
                  />
                ) : (
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-gray-100 text-5xl">
                    {product.emoji}
                  </div>
                )}
                <h3 className="mt-3 text-xl font-black text-gray-900">{product.name}</h3>
                {selected.length > 0 ? (
                  <p className="mt-1 text-sm text-gray-500">
                    {selected.map((s) => s.name).join(' · ')}
                  </p>
                ) : null}
                <p className="mt-2 text-2xl font-black text-[#e11d2e]">{soles(unitPrice)}</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold tracking-wide text-gray-500 uppercase">
                  Notas para cocina
                </label>
                <input
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm"
                  placeholder="Ej. sin mayonesa, bien cocido…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {suggestions.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-bold text-gray-700">También te puede gustar</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onAddSuggestion(s.id)}
                        className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm"
                      >
                        <span className="text-xl">{s.emoji}</span>
                        <div className="text-left">
                          <p className="text-xs font-bold">{s.name}</p>
                          <p className="text-xs font-bold text-[#e11d2e]">{soles(s.price)}</p>
                        </div>
                        <Plus size={14} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Opiniones compactas */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-700">Opiniones</p>
                  {reviewCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                      <Star size={12} className="fill-amber-400 text-amber-400" />
                      {reviewAvg} · {reviewCount}
                    </span>
                  ) : null}
                </div>
                {reviews.slice(0, 2).map((r) => (
                  <p key={r.id} className="mb-1 text-xs text-gray-500">
                    <span className="font-bold text-gray-700">{r.customerName}</span>
                    {r.comment ? ` — ${r.comment}` : ''}
                  </p>
                ))}
                {getCustomerSession() ? (
                  <div className="mt-2 flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" onClick={() => setStars(n)}>
                        <Star
                          size={16}
                          className={n <= stars ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
                        />
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={reviewBusy}
                      className="ml-auto text-xs font-bold text-[#e11d2e]"
                      onClick={() => {
                        void (async () => {
                          setReviewBusy(true)
                          try {
                            const created = await apiCreateProductReview({
                              productId: product.id,
                              stars,
                            })
                            setReviews((p) => [created, ...p])
                            setReviewCount((c) => c + 1)
                            setReviewMsg('¡Gracias!')
                          } catch (e) {
                            setReviewMsg((e as Error).message)
                          } finally {
                            setReviewBusy(false)
                          }
                        })()
                      }}
                    >
                      Enviar
                    </button>
                  </div>
                ) : null}
                {reviewMsg ? <p className="mt-1 text-xs text-gray-500">{reviewMsg}</p> : null}
              </div>
              {error ? <p className="text-center text-sm font-semibold text-red-600">{error}</p> : null}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t bg-white p-4">
          {currentGroup ? (
            <button
              type="button"
              onClick={acceptGroup}
              className="h-12 w-full rounded-xl bg-[#e11d2e] text-base font-black text-white"
            >
              Aceptar
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full bg-gray-100 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"
                >
                  <Minus size={16} />
                </button>
                <span className="w-6 text-center text-lg font-black">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => q + 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1a3d1a] text-white"
                >
                  <Plus size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={handleAdd}
                className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#e11d2e] text-base font-black text-white"
              >
                Agregar · {soles(total)}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
