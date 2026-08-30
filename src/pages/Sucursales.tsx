import { useEffect, useState } from 'react'
import { Building2, Edit, MapPin, Phone, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import type { Branch, DeliveryRange } from '../types'
import { soles, uid } from '../lib/format'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'
import {
  apiGetDeliveryRanges,
  apiSaveBranch,
  apiSaveDeliveryRanges,
} from '../lib/apiClient'
import { defaultDeliveryRanges, formatRangeLabel, MAIN_ORIGIN, parseMapsCoords } from '../lib/deliveryRanges'

function isGuid(id?: string) {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

function rangesForBranch(all: DeliveryRange[] | undefined, branchId: string) {
  const mine = (all || []).filter((r) => r.branchId === branchId && r.active !== false)
  if (mine.length) return mine
  return (all || []).filter((r) => !r.branchId && r.active !== false)
}

export function Sucursales() {
  const { state, deleteBranch, reloadFromApi } = useStore()
  const [editing, setEditing] = useState<Branch | null>(null)
  const [showForm, setShowForm] = useState(false)

  const branches: Branch[] = state.branches?.length
    ? state.branches
    : [
        {
          id: 'main',
          name: state.settings.name,
          address: state.settings.address,
          phone: state.settings.phone,
          active: true,
          lat: state.settings.originLat ?? MAIN_ORIGIN.lat,
          lng: state.settings.originLng ?? MAIN_ORIGIN.lng,
        },
      ]

  const handleSave = async (branch: Branch, ranges: DeliveryRange[]) => {
    const payload = { ...branch }
    const res = await apiSaveBranch(payload)
    const id = isGuid(payload.id) ? payload.id : (res as { id?: string }).id || payload.id
    if (isGuid(id)) {
      await apiSaveDeliveryRanges(ranges, id)
    }
    await reloadFromApi()
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    if (!confirm('¿Eliminar esta sucursal y sus tarifas de envío?')) return
    deleteBranch(id)
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          title="Sucursales"
          hint="Cada sede tiene su ubicación de origen y sus propios rangos de delivery (km → soles)."
        />
        <button
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Nueva sucursal
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((b) => {
          const ranges = rangesForBranch(state.deliveryRanges, b.id)
          return (
            <div key={b.id} className={`card p-5 ${!b.active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ember/10">
                    <Building2 size={22} className="text-ember" />
                  </div>
                  <div>
                    <p className="font-semibold">{b.name}</p>
                    <span className={`text-xs font-bold ${b.active ? 'text-green-600' : 'text-red-500'}`}>
                      {b.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(b)
                      setShowForm(true)
                    }}
                    className="rounded-lg p-1.5 hover:bg-cream"
                  >
                    <Edit size={14} className="text-ink/40" />
                  </button>
                  {b.id !== 'main' && (
                    <button onClick={() => handleDelete(b.id)} className="rounded-lg p-1.5 hover:bg-red-50">
                      <Trash2 size={14} className="text-red-400" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-ink/60">
                <p className="flex items-center gap-2">
                  <MapPin size={14} className="text-ink/30" /> {b.address}
                </p>
                <p className="flex items-center gap-2">
                  <Phone size={14} className="text-ink/30" /> {b.phone}
                </p>
                {b.lat != null && b.lng != null ? (
                  <a
                    href={`https://www.google.com/maps?q=${b.lat},${b.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-xs font-semibold text-ember hover:underline"
                  >
                    Origen: {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
                  </a>
                ) : (
                  <p className="text-xs text-brick">Falta ubicación para calcular envíos</p>
                )}
                <div className="rounded-xl bg-ink/[0.03] px-3 py-2 text-xs">
                  <p className="font-bold text-ink/50 uppercase tracking-wide">Envíos</p>
                  {ranges.length ? (
                    <ul className="mt-1 space-y-0.5 text-ink/65">
                      {ranges.map((r) => (
                        <li key={r.id}>{formatRangeLabel(r)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-ink/40">Sin rangos. Edita la sede para cargarlos.</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <BranchFormModal
        open={showForm}
        branch={editing}
        onClose={() => setShowForm(false)}
        onSave={handleSave}
      />
    </div>
  )
}

function BranchFormModal({
  open,
  branch,
  onClose,
  onSave,
}: {
  open: boolean
  branch: Branch | null
  onClose: () => void
  onSave: (b: Branch, ranges: DeliveryRange[]) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [active, setActive] = useState(true)
  const [lat, setLat] = useState<number | undefined>()
  const [lng, setLng] = useState<number | undefined>()
  const [mapsPaste, setMapsPaste] = useState('')
  const [ranges, setRanges] = useState<DeliveryRange[]>([])
  const [detecting, setDetecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(branch?.name ?? '')
    setAddress(branch?.address ?? '')
    setPhone(branch?.phone ?? '')
    setActive(branch?.active ?? true)
    setLat(branch?.lat ?? (branch ? undefined : MAIN_ORIGIN.lat))
    setLng(branch?.lng ?? (branch ? undefined : MAIN_ORIGIN.lng))
    setMapsPaste('')
    setErr(null)
    setRanges(defaultDeliveryRanges())
    if (branch && isGuid(branch.id)) {
      void apiGetDeliveryRanges(branch.id)
        .then((r) => {
          if (r.ranges?.length) setRanges(r.ranges)
        })
        .catch(() => undefined)
    }
  }, [open, branch])

  const applyPaste = () => {
    const parsed = parseMapsCoords(mapsPaste)
    if (!parsed) {
      setErr('No leí coordenadas. Pega lat,lng o un enlace de Maps que las traiga.')
      return
    }
    setLat(parsed.lat)
    setLng(parsed.lng)
    setErr(null)
  }

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setErr('Tu navegador no soporta geolocalización')
      return
    }
    setDetecting(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude)
        setLng(pos.coords.longitude)
        setDetecting(false)
        setErr(null)
      },
      (e) => {
        setErr(e.message)
        setDetecting(false)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  const patchRange = (idx: number, next: DeliveryRange) => {
    setRanges((rows) => rows.map((r, i) => (i === idx ? next : r)))
  }

  const handleSubmit = async () => {
    if (!name.trim()) return
    setBusy(true)
    setErr(null)
    try {
      await onSave(
        {
          id: branch?.id ?? uid('branch'),
          name: name.trim(),
          address: address.trim(),
          phone: phone.trim(),
          active,
          lat,
          lng,
        },
        ranges,
      )
      onClose()
    } catch (e) {
      setErr((e as Error).message || 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={branch ? 'Editar sucursal y envíos' : 'Nueva sucursal'}
      onClose={onClose}
      wide
    >
      <div className="space-y-4">
        <Field label="Nombre del local">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Local Principal" />
        </Field>
        <Field label="Dirección">
          <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Chocos Imperial, Cañete" />
        </Field>
        <Field label="Teléfono">
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="999 999 999" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded" />
          Sucursal activa
        </label>

        <div className="space-y-2 rounded-2xl border border-ink/8 bg-cream/50 p-3">
          <p className="text-[11px] font-bold tracking-[0.14em] text-ink/40 uppercase">Origen para calcular envíos</p>
          <p className="text-xs text-ink/45">
            Desde acá se mide el km. Sede principal: Chocos Imperial ({MAIN_ORIGIN.lat}, {MAIN_ORIGIN.lng}).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Latitud">
              <input
                type="number"
                step="0.0000001"
                className={inputClass}
                value={lat ?? ''}
                onChange={(e) => setLat(e.target.value ? Number(e.target.value) : undefined)}
              />
            </Field>
            <Field label="Longitud">
              <input
                type="number"
                step="0.0000001"
                className={inputClass}
                value={lng ?? ''}
                onChange={(e) => setLng(e.target.value ? Number(e.target.value) : undefined)}
              />
            </Field>
          </div>
          <Field label="Pegar enlace o coordenadas de Maps">
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={mapsPaste}
                onChange={(e) => setMapsPaste(e.target.value)}
                placeholder="-13.064353, -76.348946"
              />
              <button type="button" className="rounded-xl bg-ink px-3 text-xs font-bold text-cream" onClick={applyPaste}>
                Usar
              </button>
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={detectLocation}
              disabled={detecting}
              className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-ink/10"
            >
              {detecting ? 'Detectando…' : 'GPS de este celular'}
            </button>
            {lat != null && lng != null ? (
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl px-3 py-2 text-xs font-bold text-ember"
              >
                Ver en Maps
              </a>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 rounded-2xl border border-ink/8 bg-cream/50 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] text-ink/40 uppercase">Rangos de delivery</p>
              <p className="text-xs text-ink/45">De 0 a 4 km = S/ 3, de 4 a 6 = S/ 6, y así. Edítalos por sede.</p>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs font-bold text-ember"
              onClick={() => setRanges(defaultDeliveryRanges())}
            >
              Plantilla de prueba
            </button>
          </div>
          <p className="text-[10px] font-bold text-ink/35">Nombre · desde km · hasta km · S/</p>
          <div className="space-y-2 overflow-x-auto">
            {ranges.map((r, i) => (
              <div key={r.id} className="grid min-w-[22rem] grid-cols-[1fr_4.2rem_4.2rem_4.2rem_auto] items-center gap-1.5">
                <input
                  className={`${inputClass} py-2 text-xs`}
                  value={r.name}
                  onChange={(e) => patchRange(i, { ...r, name: e.target.value })}
                  placeholder="Nombre"
                />
                <input
                  type="number"
                  step="0.1"
                  className={`${inputClass} py-2 text-xs`}
                  value={r.distanceKmFrom}
                  onChange={(e) => patchRange(i, { ...r, distanceKmFrom: Number(e.target.value) })}
                  title="Desde km"
                />
                <input
                  type="number"
                  step="0.1"
                  className={`${inputClass} py-2 text-xs`}
                  value={r.distanceKmTo ?? ''}
                  onChange={(e) =>
                    patchRange(i, { ...r, distanceKmTo: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  title="Hasta km"
                  placeholder="∞"
                />
                <input
                  type="number"
                  step="0.5"
                  className={`${inputClass} py-2 text-xs`}
                  value={r.fee}
                  onChange={(e) => patchRange(i, { ...r, fee: Number(e.target.value) })}
                  title="Soles"
                />
                <div className="flex items-center gap-1">
                  <label className="text-[10px] font-bold text-ink/45" title="Activo">
                    <input
                      type="checkbox"
                      checked={r.active}
                      onChange={(e) => patchRange(i, { ...r, active: e.target.checked })}
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-lg p-1 text-ink/30 hover:text-brick"
                    onClick={() => setRanges(ranges.filter((_, idx) => idx !== i))}
                    aria-label="Quitar rango"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="w-full rounded-xl border border-dashed border-ink/15 py-2 text-xs font-bold text-ink/50"
            onClick={() => {
              const last = ranges[ranges.length - 1]
              const from = last?.distanceKmTo ?? (last?.distanceKmFrom ?? 0) + 2
              setRanges([
                ...ranges,
                {
                  id: uid('rng'),
                  name: `${from} a ${from + 2} km`,
                  distanceKmFrom: from,
                  distanceKmTo: from + 2,
                  fee: (last?.fee || 0) + 3,
                  sortOrder: ranges.length + 1,
                  active: true,
                },
              ])
            }}
          >
            + Rango (+2 km / +S/ 3)
          </button>
        </div>

        {err ? <p className="text-sm font-semibold text-brick">{err}</p> : null}
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void handleSubmit()}
          className="w-full rounded-xl bg-ember py-3 font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Guardando…' : branch ? 'Guardar sede y tarifas' : 'Crear sucursal'}
        </button>
        {lat != null && lng != null ? (
          <p className="text-center text-xs text-ink/40">
            Primer tramo de prueba: 0–4 km {soles(3)} · 4–6 km {soles(6)}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
