import { useMemo, useState } from 'react'
import { Pencil, Plus, Table2, Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { apiCreateTables, apiDeleteTable, apiSaveTable } from '../lib/apiClient'
import { branchNameOf } from '../lib/staffBranch'
import type { Table } from '../types'
import { ConfirmProcess } from '../components/ConfirmProcess'
import { Empty, Field, Modal, PageTitle, inputClass } from '../components/ui'

const ZONES = ['Salón', 'Terraza', 'Barra']

const STATUS_LABEL: Record<Table['status'], string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  cuenta: 'Cuenta',
}

function isGuid(id?: string) {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

type BatchForm = {
  count: number
  fromNumber: number
  seats: number
  zone: string
  branchId?: string
}

export function SalonMesas() {
  const { state, reloadFromApi } = useStore()
  const [batch, setBatch] = useState<BatchForm | null>(null)
  const [editing, setEditing] = useState<Table | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [dlg, setDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)
  const [removing, setRemoving] = useState<Table | null>(null)
  const [delDlg, setDelDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)
  const [createdNums, setCreatedNums] = useState<number[]>([])

  const branches = state.branches?.filter((b) => b.active !== false) || []
  const sorted = useMemo(
    () =>
      [...state.tables].sort(
        (a, b) =>
          (a.branchId || '').localeCompare(b.branchId || '') ||
          a.zone.localeCompare(b.zone) ||
          a.number - b.number,
      ),
    [state.tables],
  )

  const nextNumber = () => {
    const numbers = state.tables.map((t) => t.number)
    return numbers.length ? Math.max(...numbers) + 1 : 1
  }

  const openCreate = () => {
    setErr(null)
    setBatch({
      count: 1,
      fromNumber: nextNumber(),
      seats: 4,
      zone: 'Salón',
      branchId: branches[0]?.id,
    })
  }

  const create = async () => {
    if (!batch) return
    setDlg('busy')
    setErr(null)
    try {
      const created = await apiCreateTables({
        count: batch.count,
        fromNumber: batch.fromNumber,
        seats: batch.seats,
        zone: batch.zone.trim() || 'Salón',
        branchId: batch.branchId || null,
      })
      setCreatedNums(created.numbers || [])
      await reloadFromApi()
      setDlg('done')
    } catch (e) {
      setDlg(null)
      setErr((e as Error).message)
    }
  }

  const save = async () => {
    if (!editing) return
    setDlg('busy')
    setErr(null)
    try {
      await apiSaveTable({
        id: editing.id,
        number: Number(editing.number),
        seats: Number(editing.seats) || 4,
        zone: editing.zone.trim() || 'Salón',
        branchId: editing.branchId || null,
      })
      await reloadFromApi()
      setDlg('done')
    } catch (e) {
      setDlg(null)
      setErr((e as Error).message)
    }
  }

  const remove = async () => {
    if (!removing || !isGuid(removing.id)) return
    setDelDlg('busy')
    try {
      await apiDeleteTable(removing.id)
      await reloadFromApi()
      setDelDlg('done')
    } catch (e) {
      setDelDlg(null)
      setErr((e as Error).message)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="Mesas"
          hint="Crea, edita o borra mesas. El número no puede repetirse en la misma sucursal."
        />
        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Crear mesas
        </button>
      </div>

      {err && !batch && !editing ? <p className="mt-3 text-sm font-semibold text-brick">{err}</p> : null}

      {sorted.length === 0 ? (
        <div className="mt-6">
          <Empty title="Sin mesas" hint="Toca Crear mesas y indica cuántas quieres." />
        </div>
      ) : (
        <div className="mt-4 space-y-3 md:hidden">
          {sorted.map((t) => (
            <article key={t.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ember/10 text-ember">
                    <Table2 size={22} />
                  </div>
                  <div>
                    <p className="font-semibold">Mesa {t.number}</p>
                    <p className="text-xs text-ink/45">
                      {t.zone} · {t.seats} asientos
                      {t.branchId ? ` · ${branchNameOf(state.branches || [], t.branchId)}` : ''}
                    </p>
                  </div>
                </div>
                <StatusPill status={t.status} />
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <button
                  className="text-ember"
                  onClick={() => {
                    setErr(null)
                    setEditing(t)
                  }}
                >
                  Editar
                </button>
                {t.status === 'libre' && !t.orderId ? (
                  <button
                    className="text-brick"
                    onClick={() => {
                      setErr(null)
                      setRemoving(t)
                      setDelDlg('confirm')
                    }}
                  >
                    Borrar
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      {sorted.length > 0 ? (
        <div className="mt-6 hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink/40 uppercase">
              <tr>
                <th className="px-4 py-3">Mesa</th>
                <th className="px-4 py-3">Zona</th>
                <th className="px-4 py-3">Asientos</th>
                <th className="px-4 py-3">Sucursal</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} className="border-t border-ink/5">
                  <td className="px-4 py-3 font-semibold">Mesa {t.number}</td>
                  <td className="px-4 py-3">{t.zone}</td>
                  <td className="px-4 py-3">{t.seats}</td>
                  <td className="px-4 py-3 text-ink/60">
                    {t.branchId ? branchNameOf(state.branches || [], t.branchId) || '—' : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={t.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        className="rounded-lg p-1.5 hover:bg-cream"
                        title="Editar"
                        onClick={() => {
                          setErr(null)
                          setEditing(t)
                        }}
                      >
                        <Pencil size={14} className="text-ink/40" />
                      </button>
                      {t.status === 'libre' && !t.orderId ? (
                        <button
                          className="rounded-lg p-1.5 hover:bg-cream"
                          title="Borrar"
                          onClick={() => {
                            setErr(null)
                            setRemoving(t)
                            setDelDlg('confirm')
                          }}
                        >
                          <Trash2 size={14} className="text-brick" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal open={!!batch} title="Crear mesas" onClose={() => setBatch(null)}>
        {batch ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setDlg('confirm')
            }}
          >
            <Field label="¿Cuántas mesas?">
              <input
                className={inputClass}
                type="number"
                min={1}
                max={40}
                required
                value={batch.count}
                onChange={(e) => setBatch({ ...batch, count: Math.max(1, Number(e.target.value) || 1) })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde el número">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  required
                  value={batch.fromNumber}
                  onChange={(e) => setBatch({ ...batch, fromNumber: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Field>
              <Field label="Asientos">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  required
                  value={batch.seats}
                  onChange={(e) => setBatch({ ...batch, seats: Math.max(1, Number(e.target.value) || 4) })}
                />
              </Field>
            </div>
            <Field label="Zona">
              <input
                className={inputClass}
                list="admin-mesa-zones"
                value={batch.zone}
                onChange={(e) => setBatch({ ...batch, zone: e.target.value })}
              />
              <datalist id="admin-mesa-zones">
                {ZONES.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </Field>
            {branches.length ? (
              <Field label="Sucursal">
                <select
                  className={inputClass}
                  value={batch.branchId || ''}
                  onChange={(e) => setBatch({ ...batch, branchId: e.target.value || undefined })}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {err ? <p className="text-sm font-semibold text-brick">{err}</p> : null}
            <button type="submit" className="min-h-11 w-full rounded-xl bg-ember text-sm font-semibold text-white">
              Crear {batch.count} mesa{batch.count === 1 ? '' : 's'}
            </button>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!editing} title={`Mesa ${editing?.number ?? ''}`} onClose={() => setEditing(null)}>
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setDlg('confirm')
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  required
                  value={editing.number}
                  onChange={(e) => setEditing({ ...editing, number: Number(e.target.value) })}
                />
              </Field>
              <Field label="Asientos">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  required
                  value={editing.seats}
                  onChange={(e) => setEditing({ ...editing, seats: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field label="Zona">
              <input
                className={inputClass}
                list="salon-zones"
                value={editing.zone}
                onChange={(e) => setEditing({ ...editing, zone: e.target.value })}
              />
              <datalist id="salon-zones">
                {ZONES.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </Field>
            {branches.length ? (
              <Field label="Sucursal">
                <select
                  className={inputClass}
                  value={editing.branchId || ''}
                  onChange={(e) => setEditing({ ...editing, branchId: e.target.value || undefined })}
                >
                  <option value="">Sin sucursal</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {err ? <p className="text-sm font-semibold text-brick">{err}</p> : null}
            <button type="submit" className="min-h-11 w-full rounded-xl bg-ember text-sm font-semibold text-white">
              Guardar
            </button>
          </form>
        ) : null}
      </Modal>

      <ConfirmProcess
        open={!!dlg}
        phase={dlg || 'confirm'}
        title={batch ? `¿Crear ${batch.count} mesa${batch.count === 1 ? '' : 's'}?` : '¿Guardar mesa?'}
        message="Queda en el API y se ve en el salón."
        confirmLabel={batch ? 'Sí, crear' : 'Sí, guardar'}
        doneTitle={batch ? 'Mesas creadas' : 'Mesa guardada'}
        doneMessage={
          batch && createdNums.length
            ? `Mesas ${createdNums.join(', ')} ya están en el salón.`
            : 'Ya está en el salón.'
        }
        onConfirm={() => void (batch ? create() : save())}
        onCancel={() => setDlg(null)}
        onDone={() => {
          setDlg(null)
          setBatch(null)
          setEditing(null)
        }}
      />

      <ConfirmProcess
        open={!!delDlg}
        phase={delDlg || 'confirm'}
        title={`¿Borrar mesa ${removing?.number ?? ''}?`}
        message="Solo si está libre. Los pedidos viejos se quedan en historial con el número de mesa."
        confirmLabel="Sí, borrar"
        tone="brick"
        doneTitle="Mesa eliminada"
        doneMessage="Ya no aparece en el salón."
        onConfirm={() => void remove()}
        onCancel={() => {
          setDelDlg(null)
          setRemoving(null)
        }}
        onDone={() => {
          setDelDlg(null)
          setRemoving(null)
        }}
      />
    </div>
  )
}

function StatusPill({ status }: { status: Table['status'] }) {
  const cls =
    status === 'libre'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'cuenta'
        ? 'bg-amber-100 text-amber-900'
        : 'bg-ember/15 text-ember'
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}>{STATUS_LABEL[status]}</span>
}
