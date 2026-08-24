import { useMemo, useState } from 'react'
import { useStore } from '../store/StoreContext'
import { soles, uid } from '../lib/format'
import { uploadProductImage } from '../lib/minio'
import type { Product } from '../types'
import { Empty, Field, Modal, PageTitle, inputClass } from '../components/ui'

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
  const { state, saveProduct, deleteProduct } = useStore()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Product | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)

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
                        {p.category} · {soles(p.price)}
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
                    <button className="text-brick" onClick={() => deleteProduct(p.id)}>
                      Quitar
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
                    <button className="mr-3 text-ember" onClick={() => setEditing(p)}>
                      Editar
                    </button>
                    <button className="text-brick" onClick={() => deleteProduct(p.id)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      <Modal open={!!editing} title={editing && state.products.some((p) => p.id === editing.id) ? 'Editar plato' : 'Nuevo plato'} onClose={() => setEditing(null)}>
        {editing ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              saveProduct(editing)
              setEditing(null)
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.available} onChange={(e) => setEditing({ ...editing, available: e.target.checked })} />
              Disponible
            </label>
            <button className="w-full rounded-xl bg-ember py-3 font-semibold text-white" disabled={uploading}>
              Guardar
            </button>
          </form>
        ) : null}
      </Modal>
    </div>
  )
}
