import { useState } from 'react'
import { Check, Minus, Plus, X } from 'lucide-react'
import { soles } from '../lib/format'
import type { OrderItem, Product, SelectedOption } from '../types'

interface Props {
  product: Product
  suggestions: Product[]
  onAdd: (item: OrderItem) => void
  onAddSuggestion: (productId: string) => void
  onClose: () => void
}

export function ProductModal({ product, suggestions, onAdd, onAddSuggestion, onClose }: Props) {
  const [qty, setQty] = useState(1)
  const [selected, setSelected] = useState<SelectedOption[]>([])
  const [notes, setNotes] = useState('')

  const optionsTotal = selected.reduce((s, o) => s + o.price, 0)
  const unitPrice = product.price + optionsTotal
  const total = unitPrice * qty

  const toggleOption = (groupId: string, optionId: string, optionName: string, price: number, maxSelect: number) => {
    setSelected((prev) => {
      const existing = prev.find((s) => s.groupId === groupId && s.optionId === optionId)
      if (existing) {
        return prev.filter((s) => !(s.groupId === groupId && s.optionId === optionId))
      }
      const groupCount = prev.filter((s) => s.groupId === groupId).length
      if (maxSelect === 1) {
        return [...prev.filter((s) => s.groupId !== groupId), { groupId, optionId, name: optionName, price }]
      }
      if (groupCount >= maxSelect) return prev
      return [...prev, { groupId, optionId, name: optionName, price }]
    })
  }

  const isSelected = (groupId: string, optionId: string) =>
    selected.some((s) => s.groupId === groupId && s.optionId === optionId)

  const handleAdd = () => {
    onAdd({
      productId: product.id,
      name: product.name,
      qty,
      price: unitPrice,
      notes: notes || undefined,
      selectedOptions: selected.length > 0 ? selected : undefined,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between bg-white p-5 pb-0">
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200">
            <X size={18} />
          </button>
        </div>

        {/* Product Info */}
        <div className="px-5 pb-4 pt-2 text-center">
          <div
            className="mx-auto flex h-28 w-28 items-center justify-center rounded-3xl text-6xl"
            style={{ background: `linear-gradient(135deg, ${product.tone}20, ${product.tone}08)` }}
          >
            {product.emoji}
          </div>
          <h2 className="mt-4 text-2xl font-black text-gray-900">{product.name}</h2>
          <p className="mt-1 text-sm text-gray-500">{product.description}</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            {product.originalPrice && (
              <span className="text-sm text-gray-400 line-through">{soles(product.originalPrice)}</span>
            )}
            <span className="text-2xl font-black text-[#1a3d1a]">{soles(product.price)}</span>
            {product.originalPrice && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
                -{Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}%
              </span>
            )}
          </div>
          {product.tags && product.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1">
              {product.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-[#ffd700]/20 px-2.5 py-0.5 text-xs font-bold text-[#1a3d1a]">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Option Groups */}
        {product.optionGroups && product.optionGroups.length > 0 && (
          <div className="space-y-1 px-5">
            {product.optionGroups.map((group) => (
              <div key={group.id} className="rounded-2xl bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900">{group.title}</h3>
                    <p className="text-xs text-gray-500">
                      {group.required ? 'Obligatorio' : 'Opcional'} · Máx. {group.maxSelect}
                    </p>
                  </div>
                  {group.required && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 uppercase">
                      Requerido
                    </span>
                  )}
                </div>
                <div className="mt-3 space-y-1.5">
                  {group.options.map((opt) => {
                    const active = isSelected(group.id, opt.id)
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleOption(group.id, opt.id, opt.name, opt.price, group.maxSelect)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                          active ? 'bg-[#1a3d1a] text-white' : 'bg-white hover:bg-green-50'
                        }`}
                      >
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                          active ? 'border-[#ffd700] bg-[#ffd700]' : 'border-gray-300'
                        }`}>
                          {active && <Check size={12} className="text-[#1a3d1a]" strokeWidth={3} />}
                        </div>
                        <span className="flex-1 text-sm font-medium">{opt.name}</span>
                        {opt.price > 0 && (
                          <span className={`text-sm font-bold ${active ? 'text-[#ffd700]' : 'text-green-700'}`}>
                            +{soles(opt.price)}
                          </span>
                        )}
                        {opt.price === 0 && (
                          <span className={`text-xs ${active ? 'text-green-300' : 'text-gray-400'}`}>Gratis</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notes */}
        <div className="px-5 py-3">
          <input
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm placeholder:text-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 focus:outline-none"
            placeholder="Indicaciones especiales (sin cebolla, extra picante...)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="px-5 pb-3">
            <p className="mb-2 text-sm font-bold text-gray-700">🔥 ¿Deseas agregar algo más?</p>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onAddSuggestion(s.id)}
                  className="flex shrink-0 items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm transition hover:border-green-200 hover:shadow-md"
                >
                  <span className="text-xl">{s.emoji}</span>
                  <div className="text-left">
                    <p className="text-xs font-bold text-gray-800">{s.name}</p>
                    <p className="text-xs font-bold text-green-700">{soles(s.price)}</p>
                  </div>
                  <Plus size={14} className="ml-1 text-green-700" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quantity + Add to Cart */}
        <div className="sticky bottom-0 border-t bg-white px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 rounded-full bg-gray-100 px-2 py-1.5">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm hover:bg-gray-50"
              >
                <Minus size={16} />
              </button>
              <span className="w-6 text-center text-lg font-black">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1a3d1a] text-white hover:bg-green-800"
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              onClick={handleAdd}
              className="flex h-12 items-center gap-2 rounded-2xl bg-[#ffd700] px-6 font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20 transition hover:scale-105 hover:bg-yellow-400"
            >
              Agregar · {soles(total)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
