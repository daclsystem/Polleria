import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { formatTime } from '../lib/format'
import type { Product } from '../types'
import { Field, Modal, inputClass } from './ui'
import { ConfirmProcess } from './ConfirmProcess'

function isCuantificable(p: Product) {
  return Boolean(p.cuantificable || (p.recipes && p.recipes.length > 0))
}

export function CocinaPerdida() {
  const { state, adjustStock } = useStore()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [productId, setProductId] = useState('')
  const [inventoryId, setInventoryId] = useState('')
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dlg, setDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)

  const products = useMemo(
    () =>
      state.products
        .filter(isCuantificable)
        .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())),
    [state.products, q],
  )

  const insumos = useMemo(
    () =>
      state.inventory.filter(
        (i) => !q || i.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [state.inventory, q],
  )

  const product = state.products.find((p) => p.id === productId)
  const insumo = state.inventory.find((i) => i.id === inventoryId)

  const preview = useMemo(() => {
    if (product?.recipes?.length) {
      return product.recipes.map((r) => {
        const item = state.inventory.find((i) => i.id === r.inventoryId)
        return {
          inventoryId: r.inventoryId,
          name: item?.name || 'Insumo',
          unit: item?.unit || '',
          qty: qty * r.qtyPerUnit,
        }
      })
    }
    if (insumo) {
      return [{ inventoryId: insumo.id, name: insumo.name, unit: insumo.unit, qty }]
    }
    return []
  }, [product, insumo, qty, state.inventory])

  const reset = () => {
    setQ('')
    setProductId('')
    setInventoryId('')
    setQty(1)
    setNote('')
    setErr('')
  }

  const submit = async () => {
    if (preview.length === 0 || qty <= 0) {
      setErr('Elige un producto o insumo y la cantidad perdida')
      return
    }
    setDlg('busy')
    setErr('')
    const hora = formatTime(new Date().toISOString())
    const que = product?.name || insumo?.name || 'pérdida'
    const notes = `Cocina · Pérdida · ${que} ×${qty}${note.trim() ? ` · ${note.trim()}` : ''} · ${hora}`
    try {
      for (const line of preview) {
        adjustStock(line.inventoryId, -Math.abs(line.qty), { reason: 'perdida', notes })
      }
      setDlg('done')
    } catch (e) {
      setDlg('confirm')
      setErr((e as Error).message || 'No se pudo registrar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset()
          setOpen(true)
        }}
        className="flex min-h-10 items-center rounded-full bg-brick px-4 py-2 text-sm font-semibold text-white"
      >
        Pérdida
      </button>
      <Modal open={open} title="Pérdida de almacén" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-ink/55">
            Elige un producto cuantificable o un insumo, indica cuánto se perdió y se registra como
            salida por pérdida.
          </p>
          <Field label="Buscar">
            <input
              className={inputClass}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="1/2 pollo, gaseosa…"
            />
          </Field>

          {products.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[11px] font-bold tracking-wide text-ink/40 uppercase">
                Productos cuantificables
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProductId(p.id)
                      setInventoryId('')
                    }}
                    className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold ${
                      productId === p.id ? 'bg-ink text-cream' : 'bg-cream text-ink'
                    }`}
                  >
                    <span>{p.name}</span>
                    {p.recipes?.[0] ? (
                      <span className="text-[11px] font-medium opacity-70">
                        {p.recipes[0].qtyPerUnit} / und
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Aún no hay productos marcados como cuantificables en Carta. Puedes registrar el insumo
              directo.
            </p>
          )}

          <div>
            <p className="mb-1.5 text-[11px] font-bold tracking-wide text-ink/40 uppercase">
              O insumo directo
            </p>
            <div className="max-h-36 space-y-1 overflow-y-auto">
              {insumos.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => {
                    setInventoryId(i.id)
                    setProductId('')
                  }}
                  className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-semibold ${
                    inventoryId === i.id ? 'bg-brick text-white' : 'bg-cream text-ink'
                  }`}
                >
                  <span>{i.name}</span>
                  <span className="text-[11px] font-medium opacity-70">
                    {i.stock} {i.unit}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Field label="Cantidad perdida">
            <input
              type="number"
              min={0.01}
              step="0.01"
              className={inputClass}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </Field>
          <Field label="Motivo (opcional)">
            <input
              className={inputClass}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Quemado, caído, vencido…"
            />
          </Field>

          {preview.length > 0 ? (
            <ul className="rounded-xl bg-brick/10 px-3 py-2 text-sm text-brick">
              {preview.map((l) => (
                <li key={l.inventoryId} className="flex justify-between gap-2 py-0.5">
                  <span>Salida · {l.name}</span>
                  <span className="font-bold tabular-nums">
                    −{l.qty} {l.unit}
                  </span>
                </li>
              ))}
              <li className="mt-1 flex items-center gap-1 text-xs font-semibold opacity-80">
                <Trash2 size={12} /> Movimiento: pérdida
              </li>
            </ul>
          ) : null}

          {err ? <p className="text-xs font-semibold text-ember">{err}</p> : null}

          <button
            type="button"
            disabled={busy || preview.length === 0 || qty <= 0}
            onClick={() => {
              if (preview.length === 0 || qty <= 0) {
                setErr('Elige un producto o insumo y la cantidad perdida')
                return
              }
              setDlg('confirm')
            }}
            className="min-h-11 w-full rounded-xl bg-brick text-sm font-bold text-white disabled:opacity-40"
          >
            Registrar pérdida
          </button>
        </div>
      </Modal>
      <ConfirmProcess
        open={!!dlg}
        phase={dlg === 'done' ? 'done' : dlg === 'busy' ? 'busy' : 'confirm'}
        title="¿Registrar esta pérdida?"
        message={
          <div>
            {preview.map((l) => (
              <p key={l.inventoryId}>
                Sale <strong>{l.qty} {l.unit}</strong> de {l.name} como pérdida.
              </p>
            ))}
          </div>
        }
        confirmLabel="Sí, registrar"
        tone="brick"
        doneTitle="Pérdida procesada"
        doneMessage="Quedó como salida por pérdida en el movimiento de almacén."
        busyLabel="Registrando…"
        onConfirm={() => void submit()}
        onCancel={() => setDlg(null)}
        onDone={() => {
          setDlg(null)
          setOpen(false)
          reset()
        }}
      />
    </>
  )
}
