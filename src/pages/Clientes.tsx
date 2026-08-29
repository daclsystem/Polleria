import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { apiListCustomers, apiUpsertCustomer } from '../lib/apiClient'
import type { Customer } from '../types'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'
import { formatDateTime } from '../lib/format'

export function Clientes() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Partial<Customer> | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiListCustomers()
      setCustomers(res.customers || [])
    } catch (e) {
      setError((e as Error).message || 'No se pudieron cargar clientes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return customers
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        (c.email || '').toLowerCase().includes(term),
    )
  }, [customers, q])

  const save = async () => {
    if (!editing?.name?.trim() || !editing?.phone?.trim()) {
      alert('Nombre y teléfono son obligatorios')
      return
    }
    setSaving(true)
    try {
      await apiUpsertCustomer({
        name: editing.name.trim(),
        phone: editing.phone.trim(),
        email: editing.email || undefined,
        address: editing.address || undefined,
      })
      setEditing(null)
      await load()
    } catch (e) {
      alert((e as Error).message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="Clientes"
          hint="Se guardan al tomar pedido (nombre + teléfono + foto por defecto)."
        />
        <button
          className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white"
          onClick={() => setEditing({ name: '', phone: '', address: '', email: '' })}
        >
          Nuevo cliente
        </button>
      </div>

      <div className="relative mt-5 max-w-md">
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink/35" />
        <input
          className={`${inputClass} pl-9`}
          placeholder="Buscar por nombre o teléfono…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error ? <p className="mt-4 text-sm text-brick">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-ink/45">Cargando clientes…</p> : null}

      <div className="mt-6 grid gap-3">
        {!loading && filtered.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-sm text-ink/45 shadow-sm">
            Aún no hay clientes. Al tomar un pedido con nombre y teléfono se crean aquí.
          </p>
        ) : null}
        {filtered.map((c) => (
          <article
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm"
          >
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={
                  c.photoUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=1a3d1a&color=ffd700&size=128&bold=true`
                }
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-ink/45">{c.phone}</p>
                {c.address ? <p className="truncate text-xs text-ink/35">{c.address}</p> : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink/35">{formatDateTime(c.createdAt)}</span>
              <button className="text-sm text-ember" onClick={() => setEditing(c)}>
                Editar
              </button>
            </div>
          </article>
        ))}
      </div>

      <Modal open={!!editing} title="Cliente" onClose={() => setEditing(null)}>
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <Field label="Nombre *">
              <input
                className={inputClass}
                value={editing.name || ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Teléfono *">
              <input
                className={inputClass}
                value={editing.phone || ''}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                inputMode="tel"
                required
              />
            </Field>
            <Field label="Correo">
              <input
                className={inputClass}
                type="email"
                value={editing.email || ''}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </Field>
            <Field label="Dirección">
              <input
                className={inputClass}
                value={editing.address || ''}
                onChange={(e) => setEditing({ ...editing, address: e.target.value })}
              />
            </Field>
            <button
              disabled={saving}
              className="w-full rounded-xl bg-ember py-3 font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
