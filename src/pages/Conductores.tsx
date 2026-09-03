import { useCallback, useEffect, useRef, useState } from 'react'
import {
  apiCreateDriver,
  apiDeleteDriver,
  apiListDrivers,
  apiUpdateDriver,
} from '../lib/apiClient'
import type { Driver } from '../types'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'
import { ConfirmProcess } from '../components/ConfirmProcess'
import { useConfirm } from '../components/ConfirmDialogContext'
import { uid } from '../lib/format'
import { siteUrl } from '../lib/paths'
import { uploadAvatar } from '../lib/minio'
import { splitVehicle } from '../lib/vehicle'

export function Conductores() {
  const { confirmDelete } = useConfirm()
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Driver | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dlg, setDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiListDrivers()
      setDrivers(res.drivers || [])
    } catch (e) {
      setError((e as Error).message || 'No se pudieron cargar conductores')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!editing?.name?.trim() || !editing?.phone?.trim()) {
      alert('Nombre y teléfono son obligatorios')
      return
    }
    setSaving(true)
    setDlg('busy')
    try {
      const payload = {
        name: editing.name.trim(),
        phone: editing.phone.trim(),
        active: editing.active !== false,
        vehicleInfo: editing.vehicleInfo || undefined,
        plate: editing.plate || undefined,
        photoUrl: editing.photoUrl || undefined,
      }
      if (isNew) {
        await apiCreateDriver(payload)
      } else {
        await apiUpdateDriver(editing.id, payload)
      }
      await load()
      setDlg('done')
    } catch (e) {
      setDlg('confirm')
      alert((e as Error).message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const deactivate = async (id: string) => {
    await confirmDelete('¿Desactivar este conductor?', async () => {
      try {
        await apiDeleteDriver(id)
        await load()
      } catch (e) {
        alert((e as Error).message || 'No se pudo desactivar')
      }
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="Conductores"
          hint={`App del repartidor: ${siteUrl('driver')} — entra con el celular de esta lista y el código de WhatsApp (respaldo 123456).`}
        />
        <button
          className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white"
          onClick={() => {
            setIsNew(true)
            setEditing({
              id: uid('drv'),
              name: '',
              phone: '',
              active: true,
              vehicleInfo: 'Moto',
              plate: '',
            })
          }}
        >
          Nuevo conductor
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-brick">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-ink/45">Cargando conductores…</p> : null}

      <div className="mt-6 grid gap-3">
        {!loading && drivers.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-sm text-ink/45 shadow-sm">
            No hay conductores registrados. Crea el primero para delivery.
          </p>
        ) : null}
        {drivers.map((d) => (
          <article
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"
          >
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={
                  d.photoUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=0f766e&color=ffffff&size=128&bold=true`
                }
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="font-semibold">{d.name}</p>
                <p className="text-sm text-ink/45">{d.phone}</p>
                {(() => {
                  const v = splitVehicle(d.vehicleInfo, d.plate)
                  return (
                    <p className="text-xs text-ink/35">
                      {v.vehicle}
                      {v.plate ? ` · Placa ${v.plate}` : ''}
                    </p>
                  )
                })()}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold ${d.active ? 'text-sage' : 'text-brick'}`}>
                {d.active ? 'Activo' : 'Inactivo'}
              </span>
              <button
                className="text-sm text-ember"
                onClick={() => {
                  setIsNew(false)
                  setEditing(d)
                }}
              >
                Editar
              </button>
              {d.active ? (
                <button className="text-sm text-brick" onClick={() => void deactivate(d.id)}>
                  Desactivar
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <Modal
        open={!!editing}
        title={isNew ? 'Nuevo conductor' : 'Editar conductor'}
        onClose={() => {
          setEditing(null)
          setIsNew(false)
        }}
      >
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!editing?.name?.trim() || !editing?.phone?.trim()) {
                alert('Nombre y teléfono son obligatorios')
                return
              }
              setDlg('confirm')
            }}
          >
            <Field label="Nombre *">
              <input
                className={inputClass}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
            </Field>
            <Field label="WhatsApp del repartidor *">
              <input
                className={inputClass}
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                inputMode="tel"
                required
              />
            </Field>
            <DriverPhotoField editing={editing} setEditing={setEditing} />
            <Field label="Moto / vehículo">
              <input
                className={inputClass}
                value={editing.vehicleInfo || ''}
                onChange={(e) => setEditing({ ...editing, vehicleInfo: e.target.value })}
                placeholder="Moto Honda"
              />
            </Field>
            <Field label="Placa">
              <input
                className={inputClass}
                value={editing.plate || ''}
                onChange={(e) => setEditing({ ...editing, plate: e.target.value.toUpperCase() })}
                placeholder="ABC-123"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active !== false}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Activo
            </label>
            <button
              disabled={saving}
              className="w-full rounded-xl bg-ember py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </form>
        ) : null}
      </Modal>
      <ConfirmProcess
        open={!!dlg}
        phase={dlg === 'done' ? 'done' : dlg === 'busy' ? 'busy' : 'confirm'}
        title={isNew ? '¿Guardar conductor?' : '¿Guardar cambios?'}
        message={<p>Se {isNew ? 'crea' : 'actualiza'} el repartidor y su acceso a la app.</p>}
        confirmLabel="Sí, guardar"
        doneTitle="Conductor procesado"
        doneMessage="Los datos quedaron guardados."
        onConfirm={() => void save()}
        onCancel={() => setDlg(null)}
        onDone={() => {
          setDlg(null)
          setEditing(null)
          setIsNew(false)
        }}
      />
    </div>
  )
}

function DriverPhotoField({
  editing,
  setEditing,
}: {
  editing: Driver
  setEditing: (d: Driver) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => ref.current?.click()} className="shrink-0" disabled={busy}>
        <img
          src={
            editing.photoUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(editing.name || 'R')}&background=0f766e&color=ffffff&size=128&bold=true`
          }
          alt=""
          className="h-16 w-16 rounded-full object-cover ring-2 ring-ink/10"
        />
      </button>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">Foto del repartidor</p>
        <p className="text-xs text-ink/45">La ve el cliente en seguimiento. Toca para cambiar.</p>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setBusy(true)
          void uploadAvatar(file)
            .then((url) => setEditing({ ...editing, photoUrl: url }))
            .finally(() => setBusy(false))
        }}
      />
    </div>
  )
}
