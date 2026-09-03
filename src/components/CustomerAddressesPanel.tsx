import { useEffect, useState } from 'react'
import { MapPin, Plus, Star, Trash2 } from 'lucide-react'
import {
  apiDeleteCustomerAddress,
  apiListCustomerAddresses,
  apiSaveCustomerAddress,
  type CustomerAddressDto,
} from '../lib/apiClient'
import { useConfirm } from './ConfirmDialogContext'

export function CustomerAddressesPanel({
  onPick,
  pickMode = false,
  reloadKey = 0,
}: {
  onPick?: (a: CustomerAddressDto) => void
  pickMode?: boolean
  /** Cambia este valor para forzar recarga (p. ej. tras guardar desde checkout). */
  reloadKey?: number
}) {
  const { confirmDelete } = useConfirm()
  const [list, setList] = useState<CustomerAddressDto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ label: 'Casa', address: '', isDefault: false })
  const [showForm, setShowForm] = useState(false)

  const load = async () => {
    try {
      const r = await apiListCustomerAddresses()
      setList(r.addresses || [])
      setError(null)
    } catch (e) {
      setError((e as Error).message || 'No se pudieron cargar las direcciones')
    }
  }

  useEffect(() => {
    void load()
  }, [reloadKey])

  const save = async () => {
    if (!form.address.trim()) return
    setBusy(true)
    try {
      await apiSaveCustomerAddress({
        label: form.label.trim() || 'Casa',
        address: form.address.trim(),
        isDefault: form.isDefault || list.length === 0,
      })
      setForm({ label: 'Casa', address: '', isDefault: false })
      setShowForm(false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    await confirmDelete('¿Eliminar esta dirección?', async () => {
      try {
        await apiDeleteCustomerAddress(id)
        await load()
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  const setDefault = async (a: CustomerAddressDto) => {
    try {
      await apiSaveCustomerAddress({
        id: a.id,
        label: a.label,
        address: a.address,
        lat: a.lat,
        lng: a.lng,
        isDefault: true,
      })
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-900">Mis direcciones</h2>
          <p className="text-sm text-gray-500">Guárdalas y elígelas al pedir delivery</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#1a3d1a] px-4 py-2 text-sm font-bold text-white"
        >
          <Plus size={16} /> Nueva
        </button>
      </div>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {showForm ? (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-gray-100">
          <input
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            placeholder="Etiqueta (Casa, Trabajo…)"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <textarea
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm"
            rows={2}
            placeholder="Dirección completa"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Usar como predeterminada
          </label>
          <button
            type="button"
            disabled={busy || !form.address.trim()}
            onClick={() => void save()}
            className="w-full rounded-xl bg-[#ffd700] py-3 text-sm font-black text-[#1a3d1a] disabled:opacity-50"
          >
            Guardar dirección
          </button>
        </div>
      ) : null}

      {list.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 py-10 text-center">
          <MapPin className="mx-auto text-gray-300" size={32} />
          <p className="mt-3 text-sm text-gray-500">Aún no tienes direcciones guardadas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((a) => (
            <div
              key={a.id}
              className={`rounded-2xl bg-white p-4 ring-1 ${a.isDefault ? 'ring-green-300' : 'ring-gray-100'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onPick?.(a)}
                >
                  <p className="flex flex-wrap items-center gap-2 font-bold text-gray-900">
                    {a.label}
                    {a.isDefault ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
                        <Star size={10} /> Predeterminada
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{a.address}</p>
                  {pickMode ? (
                    <p className="mt-2 text-xs font-semibold text-green-700">Toca para usar en el pedido</p>
                  ) : null}
                </button>
                {!pickMode ? (
                  <div className="flex shrink-0 gap-1">
                    {!a.isDefault ? (
                      <button
                        type="button"
                        title="Predeterminada"
                        onClick={() => void setDefault(a)}
                        className="rounded-lg p-2 text-amber-600 hover:bg-amber-50"
                      >
                        <Star size={16} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void remove(a.id)}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
