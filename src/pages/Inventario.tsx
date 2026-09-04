import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { formatDateTime, qtyLabel, soles, uid } from '../lib/format'
import { apiInventoryFlow, apiInventoryMovements } from '../lib/apiClient'
import { downloadInventoryXlsx } from '../lib/exportInventory'
import type { InventoryItem } from '../types'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'
import { ConfirmProcess } from '../components/ConfirmProcess'

type SalidaReason = 'ajuste' | 'perdida'
type Mov = {
  id: string
  name: string
  unit: string
  delta: number
  stockAfter: number
  reason: string
  notes: string
  createdAt: string
  userName?: string
}

export function Inventario() {
  const { state, saveInventory, adjustStock } = useStore()
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [salida, setSalida] = useState<InventoryItem | null>(null)
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState<SalidaReason>('ajuste')
  const [notes, setNotes] = useState('')
  const [dlg, setDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)
  const [saveDlg, setSaveDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)
  const [q, setQ] = useState('')
  const [movs, setMovs] = useState<Mov[]>([])
  const [flow, setFlow] = useState<Array<{ inventoryId: string; had: number; out: number; in: number; left: number }>>([])
  const [saveErr, setSaveErr] = useState('')

  useEffect(() => {
    void apiInventoryMovements()
      .then(setMovs)
      .catch(() => setMovs([]))
    void apiInventoryFlow()
      .then(setFlow)
      .catch(() => setFlow([]))
  }, [state.inventory])

  const flowBy = useMemo(() => new Map(flow.map((f) => [f.inventoryId, f])), [flow])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return state.inventory
    return state.inventory.filter((i) => i.name.toLowerCase().includes(term))
  }, [state.inventory, q])

  const openSalida = (item: InventoryItem, preset = 1) => {
    setSalida(item)
    setQty(preset)
    setReason('ajuste')
    setNotes('')
  }

  const confirmSalida = () => {
    if (!salida || qty <= 0) return
    setDlg('busy')
    adjustStock(salida.id, -Math.abs(qty), { reason, notes: notes.trim() || undefined })
    setDlg('done')
  }

  const runSave = async () => {
    if (!editing?.name.trim()) return
    setSaveDlg('busy')
    setSaveErr('')
    try {
      await saveInventory(editing)
      setSaveDlg('done')
    } catch (e) {
      setSaveDlg('confirm')
      setSaveErr((e as Error).message || 'No se pudo guardar')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="Inventario"
          hint="Saldo = lo que queda. Salió hoy = ventas, cocina y salidas de hoy (Lima). Rojo = bajo el mínimo."
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-11 rounded-xl bg-cream px-4 py-2 text-sm font-semibold"
            onClick={() => downloadInventoryXlsx(state.inventory, movs, flow)}
          >
            Exportar XLSX
          </button>
          <button
            className="min-h-11 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white"
            onClick={() =>
              setEditing({ id: uid('i'), name: '', unit: 'unid', stock: 0, minStock: 0, cost: 0, salePrice: 0 })
            }
          >
            Nuevo ítem
          </button>
        </div>
      </div>

      <div className="relative mt-4 max-w-md">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink/35" />
        <input
          className={`${inputClass} pl-9`}
          placeholder="Buscar insumo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mt-4 space-y-3 md:hidden">
        {list.map((i) => {
          const low = i.stock <= i.minStock
          const f = flowBy.get(i.id)
          return (
            <article key={i.id} className={`card p-4 ${low ? 'ring-1 ring-brick/30' : ''}`}>
              <button className="font-semibold" onClick={() => setEditing(i)}>
                {i.name}
              </button>
              <p className={`text-sm ${low ? 'text-brick' : 'text-ink/50'}`}>
                Saldo {qtyLabel(i.stock)} {i.unit} · mín {qtyLabel(i.minStock)}
              </p>
              <p className="text-xs text-ink/45">
                Salió hoy {qtyLabel(f?.out ?? 0)} {i.unit}
                {f ? ` · había ${qtyLabel(f.had)}` : ''}
              </p>
              <p className="text-xs text-ink/45">
                Costo {soles(i.cost)}
                {i.salePrice ? ` · Venta ${soles(i.salePrice)}` : ''}
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
              <th className="px-4 py-3">Había</th>
              <th className="px-4 py-3">Salió hoy</th>
              <th className="px-4 py-3">Saldo</th>
              <th className="px-4 py-3">Mínimo</th>
              <th className="px-4 py-3">Costo</th>
              <th className="px-4 py-3">Venta</th>
              <th className="px-4 py-3">Ajuste</th>
            </tr>
          </thead>
          <tbody>
            {list.map((i) => {
              const low = i.stock <= i.minStock
              const f = flowBy.get(i.id)
              return (
                <tr key={i.id} className={`border-t border-ink/5 ${low ? 'bg-rose-50 dark:bg-brick/15' : ''}`}>
                  <td className="px-4 py-3">
                    <button className="font-medium hover:text-ember" onClick={() => setEditing(i)}>
                      {i.name}
                    </button>
                    <p className="text-xs text-ink/40">{i.unit}</p>
                  </td>
                  <td className="px-4 py-3 text-ink/55">{qtyLabel(f?.had ?? i.stock)}</td>
                  <td className="px-4 py-3 font-semibold text-brick">
                    {qtyLabel(f?.out ?? 0)}
                  </td>
                  <td className={`px-4 py-3 font-semibold ${low ? 'text-brick' : ''}`}>{qtyLabel(i.stock)}</td>
                  <td className="px-4 py-3">{qtyLabel(i.minStock)}</td>
                  <td className="px-4 py-3">{soles(i.cost)}</td>
                  <td className="px-4 py-3">{i.salePrice ? soles(i.salePrice) : '—'}</td>
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

      {movs.length > 0 ? (
        <div className="mt-6">
          <h3 className="font-display text-lg text-ink">Movimientos</h3>
          <p className="mb-2 text-xs text-ink/45">Fecha, quién lo hizo e ingreso o salida</p>
          <ul className="space-y-1.5">
            {movs.slice(0, 60).map((m) => {
              const label =
                m.reason === 'perdida' ? 'Pérdida' : m.reason === 'ingreso' ? 'Ingreso' : m.delta < 0 ? 'Salida' : m.reason
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm"
                >
                  <span>
                    <span
                      className={`mr-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        m.reason === 'perdida' ? 'bg-brick/15 text-brick' : m.delta < 0 ? 'bg-ink/8 text-ink' : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {label}
                    </span>
                    {m.name}{' '}
                    <strong>
                      {m.delta > 0 ? '+' : ''}
                      {m.delta} {m.unit}
                    </strong>
                    <span className="mt-0.5 block text-xs text-ink/45">
                      {m.userName ? `${m.userName} · ` : ''}
                      {formatDateTime(m.createdAt)}
                      {m.notes ? ` · ${m.notes}` : ''}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <Modal open={!!salida} title="Salida de inventario" onClose={() => setSalida(null)}>
        {salida ? (
          <div className="space-y-3">
            <p className="text-sm text-ink/55">
              {salida.name} · saldo {qtyLabel(salida.stock)} {salida.unit}
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
              onClick={() => setDlg('confirm')}
              className="w-full rounded-xl bg-ember py-3 font-semibold text-white disabled:opacity-40"
            >
              Registrar salida
            </button>
          </div>
        ) : null}
      </Modal>
      <ConfirmProcess
        open={!!dlg}
        phase={dlg === 'done' ? 'done' : dlg === 'busy' ? 'busy' : 'confirm'}
        title={reason === 'perdida' ? '¿Registrar pérdida?' : '¿Registrar salida?'}
        message={
          salida ? (
            <p>
              Sale <strong>{qty} {salida.unit}</strong> de {salida.name}
              {reason === 'perdida' ? ' como pérdida' : ' como uso'}.
            </p>
          ) : null
        }
        confirmLabel="Sí, registrar"
        tone={reason === 'perdida' ? 'brick' : 'ember'}
        doneTitle="Movimiento procesado"
        doneMessage="Quedó registrado en el almacén."
        onConfirm={confirmSalida}
        onCancel={() => setDlg(null)}
        onDone={() => {
          setDlg(null)
          setSalida(null)
        }}
      />

      <Modal open={!!editing} title="Insumo" onClose={() => setEditing(null)}>
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setSaveDlg('confirm')
            }}
          >
            <Field label="Nombre">
              <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidad">
                <input className={inputClass} value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} />
              </Field>
              <Field label="Saldo">
                <input type="number" className={inputClass} value={editing.stock} onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} />
              </Field>
              <Field label="Mínimo">
                <input type="number" className={inputClass} value={editing.minStock} onChange={(e) => setEditing({ ...editing, minStock: Number(e.target.value) })} />
              </Field>
              <Field label="Costo (compra)">
                <input type="number" step="0.1" className={inputClass} value={editing.cost} onChange={(e) => setEditing({ ...editing, cost: Number(e.target.value) })} />
              </Field>
              <Field label="A cuánto se vende">
                <input
                  type="number"
                  step="0.1"
                  className={inputClass}
                  value={editing.salePrice ?? 0}
                  onChange={(e) => setEditing({ ...editing, salePrice: Number(e.target.value) })}
                />
              </Field>
            </div>
            {saveErr ? <p className="text-xs font-semibold text-ember">{saveErr}</p> : null}
            <button className="w-full rounded-xl bg-ember py-3 font-semibold text-white">Guardar</button>
          </form>
        ) : null}
      </Modal>
      <ConfirmProcess
        open={!!saveDlg}
        phase={saveDlg === 'done' ? 'done' : saveDlg === 'busy' ? 'busy' : 'confirm'}
        title="¿Guardar insumo?"
        message={<p>Se actualiza costo, precio de venta y stock.</p>}
        confirmLabel="Sí, guardar"
        doneTitle="Insumo procesado"
        doneMessage="El ítem quedó guardado."
        onConfirm={() => void runSave()}
        onCancel={() => setSaveDlg(null)}
        onDone={() => {
          setSaveDlg(null)
          setEditing(null)
        }}
      />
    </div>
  )
}
