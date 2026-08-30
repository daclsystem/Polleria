import { useEffect, useState } from 'react'
import { Trash2, TicketPercent } from 'lucide-react'
import { Field, PageTitle, inputClass } from '../components/ui'
import {
  apiAdminCoupons,
  apiDeleteCoupon,
  apiSaveCoupon,
  type CouponDto,
} from '../lib/apiClient'
import { soles } from '../lib/format'

const emptyForm = {
  code: '',
  title: '',
  description: '',
  discountType: 'percent' as 'percent' | 'fixed',
  discountValue: 10,
  minSubtotal: 0,
  maxDiscount: '' as number | '',
  maxUsesTotal: '' as number | '',
  maxUsesPerCustomer: 1,
  active: true,
}

export function Cupones() {
  const [list, setList] = useState<CouponDto[]>([])
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    try {
      const r = await apiAdminCoupons()
      setList(r.coupons || [])
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    setError(null)
    setMsg(null)
    try {
      await apiSaveCoupon(
        {
          code: form.code,
          title: form.title,
          description: form.description,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          minSubtotal: Number(form.minSubtotal || 0),
          maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
          maxUsesTotal: form.maxUsesTotal === '' ? null : Number(form.maxUsesTotal),
          maxUsesPerCustomer: Number(form.maxUsesPerCustomer || 1),
          active: form.active,
        },
        editingId || undefined,
      )
      setForm(emptyForm)
      setEditingId(null)
      setMsg('Cupón guardado')
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const edit = (c: CouponDto) => {
    setEditingId(c.id)
    setForm({
      code: c.code,
      title: c.title,
      description: c.description || '',
      discountType: c.discountType,
      discountValue: c.discountValue,
      minSubtotal: c.minSubtotal,
      maxDiscount: c.maxDiscount ?? '',
      maxUsesTotal: c.maxUsesTotal ?? '',
      maxUsesPerCustomer: c.maxUsesPerCustomer,
      active: c.active,
    })
  }

  const remove = async (id: string) => {
    if (!confirm('¿Desactivar este cupón?')) return
    try {
      await apiDeleteCoupon(id)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Cuponera"
        hint="Códigos de descuento para la web y la app del cliente."
      />

      {msg ? <p className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">{msg}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="card max-w-2xl space-y-3 p-5">
        <h3 className="font-bold text-ink">{editingId ? 'Editar cupón' : 'Nuevo cupón'}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código">
            <input
              className={inputClass}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="BIENVENIDO10"
            />
          </Field>
          <Field label="Título">
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Tipo">
            <select
              className={inputClass}
              value={form.discountType}
              onChange={(e) =>
                setForm({ ...form, discountType: e.target.value as 'percent' | 'fixed' })
              }
            >
              <option value="percent">Porcentaje %</option>
              <option value="fixed">Monto fijo S/</option>
            </select>
          </Field>
          <Field label="Valor">
            <input
              className={inputClass}
              type="number"
              min={0}
              step={0.01}
              value={form.discountValue}
              onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
            />
          </Field>
          <Field label="Pedido mínimo (S/)">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={form.minSubtotal}
              onChange={(e) => setForm({ ...form, minSubtotal: Number(e.target.value) })}
            />
          </Field>
          <Field label="Tope descuento (opcional)">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={form.maxDiscount}
              onChange={(e) =>
                setForm({
                  ...form,
                  maxDiscount: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Usos totales (vacío = ilimitado)">
            <input
              className={inputClass}
              type="number"
              min={0}
              value={form.maxUsesTotal}
              onChange={(e) =>
                setForm({
                  ...form,
                  maxUsesTotal: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Usos por cliente">
            <input
              className={inputClass}
              type="number"
              min={1}
              value={form.maxUsesPerCustomer}
              onChange={(e) => setForm({ ...form, maxUsesPerCustomer: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Field label="Descripción">
          <textarea
            className={inputClass}
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          Activo
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => void save()} className="btn-primary">
            {editingId ? 'Actualizar' : 'Crear cupón'}
          </button>
          {editingId ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setEditingId(null)
                setForm(emptyForm)
              }}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {list.map((c) => (
          <div key={c.id} className="card flex items-start justify-between gap-4 p-4">
            <div>
              <p className="flex items-center gap-2 font-black text-ink">
                <TicketPercent size={16} className="text-brand" /> {c.code}
                {!c.active ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                    Inactivo
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-ink/70">{c.title}</p>
              <p className="mt-1 text-xs text-ink/45">
                {c.discountType === 'percent' ? `${c.discountValue}%` : soles(c.discountValue)} ·
                usados {c.usedCount}
                {c.maxUsesTotal != null ? `/${c.maxUsesTotal}` : ''} · mín. {soles(c.minSubtotal)}
              </p>
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost text-sm" onClick={() => edit(c)}>
                Editar
              </button>
              <button
                type="button"
                className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                onClick={() => void remove(c.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 ? (
          <p className="text-sm text-ink/45">Aún no hay cupones. Crea el primero arriba.</p>
        ) : null}
      </div>
    </div>
  )
}
