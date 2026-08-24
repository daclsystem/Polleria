import { useEffect, useState } from 'react'
import { Eye, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'
import { apiGetBanners, apiSaveBanners } from '../lib/apiClient'

export interface WebBanner {
  id: string
  title: string
  subtitle: string
  cta: string
  bgGradient: string
  active: boolean
}

const GRADIENT_OPTIONS = [
  { id: 'green', label: 'Verde Lopez', value: 'from-green-900 via-green-800 to-emerald-900' },
  { id: 'red', label: 'Rojo/Naranja', value: 'from-red-900 via-red-800 to-orange-900' },
  { id: 'amber', label: 'Dorado/Rojo', value: 'from-amber-900 via-yellow-900 to-orange-900' },
  { id: 'teal', label: 'Verde/Teal', value: 'from-emerald-900 via-teal-900 to-cyan-900' },
  { id: 'dark', label: 'Oscuro', value: 'from-gray-900 via-gray-800 to-gray-900' },
  { id: 'gold', label: 'Dorado', value: 'from-yellow-900 via-amber-800 to-orange-900' },
]

const DEFAULT_BANNERS: WebBanner[] = [
  { id: 'b1', title: 'El Mejor Pollo de Cañete', subtitle: '¡Buenazo y económico! Pollo a la brasa crujiente y jugoso con el sabor de siempre.', cta: 'Ver Menú', bgGradient: 'from-green-900 via-green-800 to-emerald-900', active: true },
  { id: 'b2', title: 'Nuevo Local Más Amplio', subtitle: 'Ahora contamos con un nuevo local cerquita al primero. ¡Ven con toda la familia!', cta: 'Pedir Ahora', bgGradient: 'from-red-900 via-red-800 to-orange-900', active: true },
  { id: 'b3', title: 'Chifa + Pollería', subtitle: 'La fusión perfecta. Arroz chaufa, tallarin saltado y pollo a la brasa en un solo lugar.', cta: 'Ordenar', bgGradient: 'from-amber-900 via-yellow-900 to-orange-900', active: true },
]

export function WebConfig() {
  const [banners, setBanners] = useState<WebBanner[]>([])
  const [editBanner, setEditBanner] = useState<WebBanner | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void apiGetBanners(true)
      .then((r) => {
        const list = (r.banners as WebBanner[]) || []
        setBanners(list.length ? list : DEFAULT_BANNERS)
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  const commit = async (next: WebBanner[]) => {
    setBanners(next)
    setError(null)
    try {
      await apiSaveBanners(next)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const openNew = () => {
    setEditBanner({
      id: `b${Date.now()}`,
      title: '',
      subtitle: '',
      cta: 'Ver Menú',
      bgGradient: GRADIENT_OPTIONS[0].value,
      active: true,
    })
    setModalOpen(true)
  }

  const openEdit = (banner: WebBanner) => {
    setEditBanner({ ...banner })
    setModalOpen(true)
  }

  const saveBanner = () => {
    if (!editBanner || !editBanner.title.trim()) return
    const exists = banners.some((b) => b.id === editBanner.id)
    const next = exists
      ? banners.map((b) => (b.id === editBanner.id ? editBanner : b))
      : [...banners, editBanner]
    void commit(next)
    setModalOpen(false)
    setEditBanner(null)
  }

  const deleteBanner = (id: string) => {
    if (confirm('¿Eliminar este banner?')) {
      void commit(banners.filter((b) => b.id !== id))
    }
  }

  const toggleActive = (id: string) => {
    void commit(banners.map((b) => (b.id === id ? { ...b, active: !b.active } : b)))
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          title="Página Web"
          hint="Gestiona los banners y contenido de la página web pública."
        />
        <div className="flex gap-2">
          <a
            href="/web"
            target="_blank"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink hover:bg-cream-dark"
          >
            <Eye size={16} /> Ver Web
          </a>
          <button
            onClick={openNew}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-ember px-4 text-sm font-semibold text-white"
          >
            <Plus size={16} /> Nuevo Banner
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-6 space-y-3">
        {banners.length === 0 && (
          <p className="py-8 text-center text-sm text-ink/40">No hay banners. Crea el primero.</p>
        )}
        {banners.map((banner) => (
          <div
            key={banner.id}
            className={`card flex items-center gap-4 p-4 ${!banner.active ? 'opacity-50' : ''}`}
          >
            <GripVertical size={16} className="shrink-0 text-ink/20" />
            <div
              className={`hidden h-16 w-28 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white sm:flex ${banner.bgGradient}`}
            >
              Banner
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{banner.title}</p>
              <p className="truncate text-sm text-ink/50">{banner.subtitle}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => toggleActive(banner.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${banner.active ? 'bg-sage/10 text-sage' : 'bg-ink/5 text-ink/40'}`}
              >
                {banner.active ? 'Activo' : 'Inactivo'}
              </button>
              <button
                onClick={() => openEdit(banner)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-cream-dark"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => deleteBanner(banner.id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-brick hover:bg-red-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={modalOpen} title={editBanner?.title ? 'Editar Banner' : 'Nuevo Banner'} onClose={() => setModalOpen(false)}>
        {editBanner && (
          <div className="space-y-3">
            <Field label="Título">
              <input
                className={inputClass}
                value={editBanner.title}
                onChange={(e) => setEditBanner({ ...editBanner, title: e.target.value })}
                placeholder="Pollo a la Brasa"
              />
            </Field>
            <Field label="Subtítulo / Descripción">
              <input
                className={inputClass}
                value={editBanner.subtitle}
                onChange={(e) => setEditBanner({ ...editBanner, subtitle: e.target.value })}
                placeholder="El mejor sabor de la ciudad"
              />
            </Field>
            <Field label="Texto del botón">
              <input
                className={inputClass}
                value={editBanner.cta}
                onChange={(e) => setEditBanner({ ...editBanner, cta: e.target.value })}
                placeholder="Ver Menú"
              />
            </Field>
            <Field label="Color de fondo">
              <div className="grid grid-cols-3 gap-2">
                {GRADIENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setEditBanner({ ...editBanner, bgGradient: opt.value })}
                    className={`rounded-xl bg-gradient-to-br ${opt.value} px-3 py-2 text-xs font-medium text-white ${editBanner.bgGradient === opt.value ? 'ring-2 ring-ember ring-offset-2' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Field>
            {/* Preview */}
            <div className={`mt-4 rounded-xl bg-gradient-to-br ${editBanner.bgGradient} p-6 text-center text-white`}>
              <p className="text-lg font-bold">{editBanner.title || 'Título'}</p>
              <p className="mt-1 text-sm opacity-80">{editBanner.subtitle || 'Subtítulo'}</p>
              <span className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-xs font-bold text-gray-900">
                {editBanner.cta || 'Botón'}
              </span>
            </div>
            <button
              onClick={saveBanner}
              className="mt-4 w-full rounded-xl bg-ember py-3 font-semibold text-white"
            >
              Guardar Banner
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
