import { useState } from 'react'
import { useStore } from '../store/StoreContext'
import { soles, uid } from '../lib/format'
import type { InventoryItem } from '../types'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'

type SalidaReason = 'ajuste' | 'perdida'

export function Inventario() {
  const { state, saveInventory, adjustStock } = useStore()
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [salida, setSalida] = useState<InventoryItem | null>(null)
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState<SalidaReason>('ajuste')
  const [notes, setNotes] = useState('')

  const openSalida = (item: InventoryItem, preset = 1) => {
    setSalida(item)
    setQty(preset)
    setReason('ajuste')
    setNotes('')
  }

  const confirmSalida = () => {
    if (!salida || qty <= 0) return
    adjustStock(salida.id, -Math.abs(qty), { reason, notes: notes.trim() || undefined })
    setSalida(null)
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="Inventario"
          hint="Al sacar stock eliges el estado: uso o pérdida. Rojo = bajo el mínimo."
        />
        <button
          className="min-h-11 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white"
          onClick={() =>
            setEditing({ id: uid('i'), name: '', unit: 'unid', stock: 0, minStock: 0, cost: 0 })
          }
        >
          Nuevo ítem
        </button>
      </div>
      <div className="mt-4 space-y-3 md:hidden">
        {state.inventory.map((i) => {
          const low = i.stock <= i.minStock
          return (
            <article key={i.id} className={`card p-4 ${low ? 'ring-1 ring-brick/30' : ''}`}>
              <button className="font-semibold" onClick={() => setEditing(i)}>
                {i.name}
              </button>
              <p className={`text-sm ${low ? 'text-brick' : 'text-ink/50'}`}>
                {i.stock} {i.unit} · mín {i.minStock} · {soles(i.cost)}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                <button className="min-h-10 rounded-lg bg-brick/10 px-3 text-sm font-semibold text-brick" onClick={() => openSalida(i, 1)}>
                  Salida
                </button>
                <button className="min-h-10 rounded-lg bg-cream px-3" onClick={() => adjustStock(i.id, 1, { reason: 'ingreso' })}>
                  +1
                </button>
                <button className="min-h-10 rounded-lg bg-cream px-3" onClick={() => adjustStock(i.id, 5, { reason: 'ingreso' })}>
                  +5
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <div className="mt-6 hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink/40 uppercase">
            <tr>
              <th className="px-4 py-3">Insumo</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Mínimo</th>
              <th className="px-4 py-3">Costo</th>
              <th className="px-4 py-3">Ajuste</th>
            </tr>
          </thead>
          <tbody>
            {state.inventory.map((i) => {
              const low = i.stock <= i.minStock
              return (
                <tr key={i.id} className={`border-t border-ink/5 ${low ? 'bg-rose-50' : ''}`}>
                  <td className="px-4 py-3">
                    <button className="font-medium hover:text-ember" onClick={() => setEditing(i)}>
                      {i.name}
                    </button>
                    <p className="text-xs text-ink/40">{i.unit}</p>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${low ? 'text-brick' : ''}`}>{i.stock}</td>
                  <td className="px-4 py-3">{i.minStock}</td>
                  <td className="px-4 py-3">{soles(i.cost)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        className="rounded-lg bg-brick/10 px-2 py-1 text-xs font-bold text-brick"
                        onClick={() => openSalida(i, 1)}
                      >
                        Salida
                      </button>
                      <button className="rounded-lg bg-cream px-2 py-1" onClick={() => adjustStock(i.id, 1, { reason: 'ingreso' })}>
                        +1
                      </button>
                      <button className="rounded-lg bg-cream px-2 py-1" onClick={() => adjustStock(i.id, 5, { reason: 'ingreso' })}>
                        +5
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={!!salida} title="Salida de inventario" onClose={() => setSalida(null)}>
        {salida ? (
          <div className="space-y-3">
            <p className="text-sm text-ink/55">
              {salida.name} · hay {salida.stock} {salida.unit}
            </p>
            <Field label="Cantidad a sacar">
              <input
                type="number"
                min={0.1}
                step="0.1"
                className={inputClass}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </Field>
            <div>
              <p className="mb-1.5 text-[11px] font-bold tracking-[0.14em] text-ink/40 uppercase">Estado de la salida</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReason('ajuste')}
                  className={`rounded-2xl px-3 py-3 text-sm font-bold ${
                    reason === 'ajuste' ? 'bg-ink text-cream' : 'bg-ink/[0.05] text-ink/60'
                  }`}
                >
                  Uso / consumo
                </button>
                <button
                  type="button"
                  onClick={() => setReason('perdida')}
                  className={`rounded-2xl px-3 py-3 text-sm font-bold ${
                    reason === 'perdida' ? 'bg-brick text-white' : 'bg-brick/10 text-brick'
                  }`}
                >
                  Pérdida
                </button>
              </div>
              <p className="mt-1.5 text-xs text-ink/40">
                {reason === 'perdida'
                  ? 'Merma, vencido, roto o merma. Baja el stock y queda como pérdida.'
                  : 'Salida normal (uso en cocina u otro consumo).'}
              </p>
            </div>
            <Field label="Nota (opcional)">
              <input
                className={inputClass}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={reason === 'perdida' ? 'Ej. pollo quemado, vencido' : 'Ej. uso cocina'}
              />
            </Field>
            <button
              type="button"
              disabled={qty <= 0}
              onClick={confirmSalida}
              className="w-full rounded-xl bg-ember py-3 font-semibold text-white disabled:opacity-40"
            >
              Confirmar salida
            </button>
          </div>
        ) : null}
      </Modal>

      <Modal open={!!editing} title="Insumo" onClose={() => setEditing(null)}>
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              saveInventory(editing)
              setEditing(null)
            }}
          >
            <Field label="Nombre">
              <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidad">
                <input className={inputClass} value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} />
              </Field>
              <Field label="Stock">
                <input type="number" className={inputClass} value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} />
              </Field>
              <Field label="Mínimo">
                <input type="number" className={inputClass} value={editing.minStock} onChange={(e) => setEditing({ ...editing, minStock: Number(e.target.value) })} />
              </Field>
              <Field label="Costo">
                <input type="number" step="0.1" className={inputClass} value={editing.cost} onChange={(e) => setEditing({ ...editing, cost: Number(e.target.value) })} />
              </Field>
            </div>
            <button className="w-full rounded-xl bg-ember py-3 font-semibold text-white">Guardar</button>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
