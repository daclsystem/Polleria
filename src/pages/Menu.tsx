import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '../store/StoreContext'
import { soles, uid } from '../lib/format'
import { uploadProductImage } from '../lib/minio'
import type { Product, ProductOptionGroup, ProductRecipe } from '../types'
import { Empty, Field, Modal, PageTitle, inputClass } from '../components/ui'
import { ConfirmProcess } from '../components/ConfirmProcess'

const OPTION_TEMPLATES: { label: string; group: ProductOptionGroup }[] = [
  {
    label: 'Presa',
    group: {
      id: uid('g'),
      title: 'Elige tu presa',
      required: true,
      maxSelect: 1,
      options: [
        { id: uid('o'), name: 'Pecho', price: 0 },
        { id: uid('o'), name: 'Pierna', price: 0 },
      ],
    },
  },
  {
    label: 'Papas',
    group: {
      id: uid('g'),
      title: 'Elige tus papas',
      required: true,
      maxSelect: 1,
      options: [
        { id: uid('o'), name: 'Papas regulares', price: 0 },
        { id: uid('o'), name: 'Papas familiares', price: 4 },
        { id: uid('o'), name: 'Sin papas', price: 0 },
      ],
    },
  },
  {
    label: 'Cremas',
    group: {
      id: uid('g'),
      title: 'Elige tus cremas',
      required: false,
      maxSelect: 3,
      options: [
        { id: uid('o'), name: 'Mayonesa', price: 0 },
        { id: uid('o'), name: 'Ketchup', price: 0 },
        { id: uid('o'), name: 'Ají', price: 0 },
        { id: uid('o'), name: 'Mostaza', price: 0 },
        { id: uid('o'), name: 'Huancaína', price: 1 },
        { id: uid('o'), name: 'Rocoto', price: 1 },
      ],
    },
  },
  {
    label: 'Adicionales',
    group: {
      id: uid('g'),
      title: 'Adicionales',
      required: false,
      maxSelect: 5,
      options: [
        { id: uid('o'), name: 'Papas extra', price: 5 },
        { id: uid('o'), name: 'Arroz chaufa extra', price: 7 },
        { id: uid('o'), name: 'Ensalada extra', price: 4 },
        { id: uid('o'), name: 'Huevo frito', price: 2.5 },
      ],
    },
  },
  {
    label: 'Bebida',
    group: {
      id: uid('g'),
      title: 'Agrega una bebida',
      required: false,
      maxSelect: 1,
      options: [
        { id: uid('o'), name: 'Inca Kola personal', price: 3.5 },
        { id: uid('o'), name: 'Coca-Cola personal', price: 3.5 },
        { id: uid('o'), name: 'Chicha morada', price: 4.5 },
      ],
    },
  },
  {
    label: 'Tamaño',
    group: {
      id: uid('g'),
      title: 'Elige tu tamaño',
      required: true,
      maxSelect: 1,
      options: [
        { id: uid('o'), name: 'Personal', price: 0 },
        { id: uid('o'), name: 'Mediano', price: 4 },
        { id: uid('o'), name: 'Familiar', price: 8 },
      ],
    },
  },
]

function freshGroup(): ProductOptionGroup {
  return {
    id: uid('g'),
    title: '',
    required: false,
    maxSelect: 1,
    options: [{ id: uid('o'), name: '', price: 0 }],
  }
}

function cloneTemplate(group: ProductOptionGroup): ProductOptionGroup {
  return {
    ...group,
    id: uid('g'),
    options: group.options.map((o) => ({ ...o, id: uid('o') })),
  }
}

const empty = (): Product => ({
  id: uid('p'),
  name: '',
  description: '',
  category: 'Combos',
  price: 0,
  emoji: '🍗',
  tone: '#E85D04',
  available: true,
  prepMinutes: 10,
  sendToKitchen: true,
  cuantificable: false,
  recipes: [],
  optionGroups: [],
  tags: [],
})

function ProductThumb({ product, className = '' }: { product: Product; className?: string }) {
  if (product.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt={product.name}
        className={`object-cover ${className}`}
      />
    )
  }
  return (
    <span className={`inline-flex items-center justify-center ${className}`} style={{ background: `${product.tone}22` }}>
      {product.emoji}
    </span>
  )
}

export function MenuPage() {
  const { state, saveProduct } = useStore()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saveDlg, setSaveDlg] = useState<'confirm' | 'busy' | 'done' | null>(null)

  const list = useMemo(
    () =>
      state.products.filter(
        (p) =>
          p.name.toLowerCase().includes(q.toLowerCase()) ||
          p.category.toLowerCase().includes(q.toLowerCase()),
      ),
    [state.products, q],
  )

  const onPickImage = async (file: File | undefined) => {
    if (!file || !editing) return
    setUploadError(null)
    setUploading(true)
    setUploadPct(0)
    try {
      const url = await uploadProductImage(file, setUploadPct)
      setEditing({ ...editing, imageUrl: url })
    } catch (e) {
      setUploadError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Carta" hint="Platos visibles en POS y en el pedido del cliente. Fotos en MinIO (bucket pollerialopez)." />
        <button
          onClick={() => setEditing(empty())}
          className="min-h-11 rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white"
        >
          Nuevo plato
        </button>
      </div>
      <input
        className={`${inputClass} mt-5 max-w-sm`}
        placeholder="Buscar..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {list.length === 0 ? (
        <div className="mt-8">
          <Empty title="Sin platos" />
        </div>
      ) : (
        <>
        <div className="mt-4 space-y-3 md:hidden">
          {list.map((p) => (
            <article key={p.id} className="card p-4">
              <div className="flex items-start gap-3">
                <ProductThumb product={p} className="h-14 w-14 shrink-0 rounded-xl text-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-ink/45">
                        {p.category} · {soles(p.price)} ·{' '}
                        {p.sendToKitchen === false ? 'Barra' : 'Cocina'}
                        {p.optionGroups?.length
                          ? ` · ${p.optionGroups.length} grupo${p.optionGroups.length === 1 ? '' : 's'}`
                          : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => saveProduct({ ...p, available: !p.available })}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.available ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      {p.available ? 'Disponible' : 'Agotado'}
                    </button>
                  </div>
                  <div className="mt-3 flex gap-3 text-sm">
                    <button className="text-ember" onClick={() => setEditing(p)}>
                      Editar
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-6 hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-ink/40 uppercase">
              <tr>
                <th className="px-4 py-3">Plato</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Cocina</th>
                <th className="px-4 py-3">Opciones</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-t border-ink/5">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProductThumb product={p} className="h-10 w-10 rounded-lg text-lg" />
                      {p.name}
                    </div>
                  </td>
                  <td className="px-4 py-3">{p.category}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        p.sendToKitchen === false
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {p.sendToKitchen === false ? 'No · barra' : 'Sí · prep'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink/55">
                    {p.optionGroups?.length
                      ? `${p.optionGroups.length} grupo${p.optionGroups.length === 1 ? '' : 's'}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3">{soles(p.price)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => saveProduct({ ...p, available: !p.available })}
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.available ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-600'
                      }`}
                    >
                      {p.available ? 'Disponible' : 'Agotado'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-ember" onClick={() => setEditing(p)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Modal
        wide
        open={!!editing}
        title={editing && state.products.some((p) => p.id === editing.id) ? 'Editar plato' : 'Nuevo plato'}
        onClose={() => setEditing(null)}
      >
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setSaveDlg('confirm')
            }}
          >
            <Field label="Foto (MinIO)">
              <div className="flex items-center gap-3">
                <ProductThumb product={editing} className="h-16 w-16 rounded-xl text-2xl" />
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => onPickImage(e.target.files?.[0])}
                    className="block w-full text-xs"
                  />
                  {uploading ? <p className="mt-1 text-xs text-ink/50">Subiendo… {uploadPct}%</p> : null}
                  {uploadError ? <p className="mt-1 text-xs text-brick">{uploadError}</p> : null}
                  {editing.imageUrl ? (
                    <button
                      type="button"
                      className="mt-1 text-xs text-ink/50 underline"
                      onClick={() => setEditing({ ...editing, imageUrl: undefined })}
                    >
                      Quitar foto
                    </button>
                  ) : null}
                </div>
              </div>
            </Field>
            <Field label="Nombre">
              <input className={inputClass} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            </Field>
            <Field label="Descripción">
              <input className={inputClass} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoría">
                <input className={inputClass} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
              </Field>
              <Field label="Precio">
                <input type="number" step="0.1" className={inputClass} value={editing.price} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
              </Field>
              <Field label="Emoji">
                <input className={inputClass} value={editing.emoji} onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} />
              </Field>
              <Field label="Min. prep.">
                <input type="number" className={inputClass} value={editing.prepMinutes} onChange={(e) => setEditing({ ...editing, prepMinutes: Number(e.target.value) })} />
              </Field>
            </div>
            <label className="flex items-start gap-3 rounded-2xl bg-cream px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={editing.sendToKitchen !== false}
                onChange={(e) => setEditing({ ...editing, sendToKitchen: e.target.checked })}
              />
              <span>
                <span className="block font-bold">Va a cocina (preparación)</span>
                <span className="block text-xs text-ink/45">
                  Si está apagado (ej. bebidas), no sale en comanda de cocina ni en pantalla cocina. Sirve para POS y pedidos del app web.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.available} onChange={(e) => setEditing({ ...editing, available: e.target.checked })} />
              Disponible
            </label>
            <label className="flex items-start gap-3 rounded-2xl bg-cream px-3 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={!!editing.cuantificable}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    cuantificable: e.target.checked,
                    recipes: e.target.checked ? editing.recipes || [] : [],
                  })
                }
              />
              <span>
                <span className="block font-bold">Cuantificable (baja almacén)</span>
                <span className="block text-xs text-ink/45">
                  1/2 pollo = 0.5, gaseosa = 1. Cocina puede registrar pérdida de este producto.
                </span>
              </span>
            </label>
            {editing.cuantificable ? (
              <RecipeEditor
                recipes={editing.recipes || []}
                inventory={state.inventory}
                onChange={(recipes) => setEditing({ ...editing, recipes })}
              />
            ) : null}
            <Field label="Etiquetas (coma)">
              <input
                className={inputClass}
                value={(editing.tags || []).join(', ')}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    tags: e.target.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Popular, Oferta, Nuevo"
              />
            </Field>
            <OptionGroupsEditor
              groups={editing.optionGroups || []}
              onChange={(optionGroups) => setEditing({ ...editing, optionGroups })}
            />
            <button className="w-full rounded-xl bg-ember py-3 font-semibold text-white" disabled={uploading}>
              Guardar
            </button>
          </form>
        ) : null}
      </Modal>
      <ConfirmProcess
        open={!!saveDlg}
        phase={saveDlg === 'done' ? 'done' : saveDlg === 'busy' ? 'busy' : 'confirm'}
        title="¿Guardar plato?"
        message={<p>Se actualiza la carta, receta y opciones del producto.</p>}
        confirmLabel="Sí, guardar"
        doneTitle="Plato procesado"
        doneMessage="El producto quedó guardado en la carta."
        onConfirm={() => {
          if (!editing) return
          setSaveDlg('busy')
          saveProduct(editing)
          setSaveDlg('done')
        }}
        onCancel={() => setSaveDlg(null)}
        onDone={() => {
          setSaveDlg(null)
          setEditing(null)
        }}
      />
    </div>
  )
}

function RecipeEditor({
  recipes,
  inventory,
  onChange,
}: {
  recipes: ProductRecipe[]
  inventory: { id: string; name: string; unit: string }[]
  onChange: (recipes: ProductRecipe[]) => void
}) {
  const add = () => {
    const first = inventory[0]
    if (!first) return
    if (recipes.some((r) => r.inventoryId === first.id)) return
    onChange([...recipes, { inventoryId: first.id, qtyPerUnit: 1 }])
  }
  return (
    <div className="space-y-2 rounded-2xl border border-ink/8 bg-white p-3">
      <p className="text-xs font-bold text-ink/50 uppercase tracking-wide">Receta por unidad vendida</p>
      {inventory.length === 0 ? (
        <p className="text-xs text-ember">Crea insumos en Inventario primero.</p>
      ) : null}
      {recipes.map((r, idx) => (
        <div key={`${r.inventoryId}-${idx}`} className="grid grid-cols-[1fr_5.5rem_2rem] items-center gap-2">
          <select
            className={inputClass}
            value={r.inventoryId}
            onChange={(e) =>
              onChange(recipes.map((x, i) => (i === idx ? { ...x, inventoryId: e.target.value } : x)))
            }
          >
            {inventory.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0.01}
            step="0.01"
            className={inputClass}
            value={r.qtyPerUnit}
            onChange={(e) =>
              onChange(recipes.map((x, i) => (i === idx ? { ...x, qtyPerUnit: Number(e.target.value) } : x)))
            }
          />
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-brick"
            onClick={() => onChange(recipes.filter((_, i) => i !== idx))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-cream px-3 text-xs font-bold"
      >
        <Plus size={14} /> Agregar insumo
      </button>
    </div>
  )
}

function OptionGroupsEditor({
  groups,
  onChange,
}: {
  groups: ProductOptionGroup[]
  onChange: (groups: ProductOptionGroup[]) => void
}) {
  const patchGroup = (idx: number, next: ProductOptionGroup) => {
    onChange(groups.map((g, i) => (i === idx ? next : g)))
  }

  return (
    <div className="space-y-3 rounded-2xl border border-ink/8 bg-cream/60 p-3">
      <div>
        <p className="text-[11px] font-bold tracking-[0.14em] text-ink/40 uppercase">Opciones del plato</p>
        <p className="mt-0.5 text-xs text-ink/45">
          Lo que el cliente elige al pedir: presa, papas, cremas, extras, bebida.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {OPTION_TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ember ring-1 ring-ink/10"
            onClick={() => onChange([...groups, cloneTemplate(t.group)])}
          >
            + {t.label}
          </button>
        ))}
      </div>
      {groups.length === 0 ? (
        <p className="rounded-xl bg-white/70 px-3 py-4 text-center text-sm text-ink/40">
          Sin opciones. El plato se pide solo con el precio base.
        </p>
      ) : null}
      {groups.map((g, gi) => (
        <div key={g.id} className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-ink/6">
          <div className="flex items-start gap-2">
            <input
              className={`${inputClass} py-2.5`}
              value={g.title}
              onChange={(e) => patchGroup(gi, { ...g, title: e.target.value })}
              placeholder="Título (ej. Elige tu presa)"
            />
            <button
              type="button"
              className="tap mt-1 rounded-xl p-2 text-brick hover:bg-brick/8"
              onClick={() => onChange(groups.filter((_, i) => i !== gi))}
              aria-label="Quitar grupo"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5 font-semibold">
              <input
                type="checkbox"
                checked={g.required}
                onChange={(e) => patchGroup(gi, { ...g, required: e.target.checked })}
              />
              Obligatorio
            </label>
            <label className="inline-flex items-center gap-1.5 font-semibold">
              Máx. elegir
              <input
                type="number"
                min={1}
                className="w-16 rounded-lg border border-ink/10 px-2 py-1"
                value={g.maxSelect}
                onChange={(e) => patchGroup(gi, { ...g, maxSelect: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
          </div>
          <div className="space-y-1.5">
            {g.options.map((o, oi) => (
              <div key={o.id} className="grid grid-cols-[1fr_5.5rem_auto] gap-2">
                <input
                  className={`${inputClass} py-2`}
                  value={o.name}
                  onChange={(e) => {
                    const options = g.options.map((x, i) => (i === oi ? { ...x, name: e.target.value } : x))
                    patchGroup(gi, { ...g, options })
                  }}
                  placeholder="Opción"
                />
                <input
                  type="number"
                  step="0.1"
                  className={`${inputClass} py-2`}
                  value={o.price}
                  onChange={(e) => {
                    const options = g.options.map((x, i) =>
                      i === oi ? { ...x, price: Number(e.target.value) } : x,
                    )
                    patchGroup(gi, { ...g, options })
                  }}
                  title="Precio extra"
                />
                <button
                  type="button"
                  className="tap rounded-xl px-2 text-ink/35 hover:text-brick"
                  onClick={() =>
                    patchGroup(gi, { ...g, options: g.options.filter((_, i) => i !== oi) })
                  }
                  aria-label="Quitar opción"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-bold text-ember"
              onClick={() =>
                patchGroup(gi, {
                  ...g,
                  options: [...g.options, { id: uid('o'), name: '', price: 0 }],
                })
              }
            >
              <Plus size={14} /> Opción
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="w-full rounded-xl border border-dashed border-ink/15 py-2.5 text-sm font-bold text-ink/55"
        onClick={() => onChange([...groups, freshGroup()])}
      >
        + Grupo vacío
      </button>
    </div>
  )
}
