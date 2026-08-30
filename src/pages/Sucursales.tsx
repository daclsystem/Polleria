import { useState } from 'react'
import { Building2, Edit, MapPin, Phone, Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import type { Branch } from '../types'
import { uid } from '../lib/format'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'

export function Sucursales() {
  const { state, saveBranch, deleteBranch } = useStore()
  const [editing, setEditing] = useState<Branch | null>(null)
  const [showForm, setShowForm] = useState(false)

  const branches: Branch[] = state.branches?.length
    ? state.branches
    : [{ id: 'main', name: state.settings.name, address: state.settings.address, phone: state.settings.phone, active: true }]

  const handleSave = (branch: Branch) => {
    saveBranch(branch)
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    if (!confirm('¿Eliminar esta sucursal?')) return
    deleteBranch(id)
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          title="Sucursales"
          hint="Locales operativos del sistema (caja, cocina, pedidos). Lo que ve el cliente en la web se edita en Personalización web."
        />
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Nueva sucursal
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {branches.map((b) => (
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
                  onClick={() => { setEditing(b); setShowForm(true) }}
                  className="rounded-lg p-1.5 hover:bg-cream"
                >
                  <Edit size={14} className="text-ink/40" />
                </button>
                {b.id !== 'main' && (
                  <button
                    onClick={() => handleDelete(b.id)}
                    className="rounded-lg p-1.5 hover:bg-red-50"
                  >
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
            </div>
          </div>
        ))}
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
  onSave: (b: Branch) => void
}) {
  const [name, setName] = useState(branch?.name ?? '')
  const [address, setAddress] = useState(branch?.address ?? '')
  const [phone, setPhone] = useState(branch?.phone ?? '')
  const [active, setActive] = useState(branch?.active ?? true)

  const reset = () => {
    setName(branch?.name ?? '')
    setAddress(branch?.address ?? '')
    setPhone(branch?.phone ?? '')
    setActive(branch?.active ?? true)
  }

  const handleSubmit = () => {
    if (!name.trim()) return
    onSave({
      id: branch?.id ?? uid('branch'),
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      active,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      title={branch ? 'Editar sucursal' : 'Nueva sucursal'}
      onClose={() => { reset(); onClose() }}
    >
      <div className="space-y-3">
        <Field label="Nombre del local">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Local Centro" />
        </Field>
        <Field label="Dirección">
          <input className={inputClass} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Av. Principal 123" />
        </Field>
        <Field label="Teléfono">
          <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="999 999 999" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 rounded" />
          Sucursal activa
        </label>
        <button
          onClick={handleSubmit}
          className="w-full rounded-xl bg-ember py-3 font-semibold text-white"
        >
          {branch ? 'Guardar cambios' : 'Crear sucursal'}
        </button>
      </div>
    </Modal>
  )
}
