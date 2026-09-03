import { useEffect, useState } from 'react'
import {
  Clock,
  Eye,
  GripVertical,
  MapPin,
  MessageCircle,
  Monitor,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react'
import { Field, Modal, PageTitle, inputClass } from '../components/ui'
import { useConfirm } from '../components/ConfirmDialogContext'
import { apiGetBanners, apiGetWebsite, apiSaveBanners, apiSaveWebsite } from '../lib/apiClient'
import {
  DEFAULT_WEB_SITE,
  rememberWebSite,
  normalizeBanners,
  type WebBranch,
  type WebHighlight,
  type WebScheduleRow,
  type WebSiteContent,
} from '../lib/webSite'
import { siteUrl } from '../lib/paths'

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

const ICON_OPTIONS: WebHighlight['icon'][] = ['flame', 'utensils', 'truck', 'clock', 'star', 'map']

type Tab = 'banners' | 'contenido' | 'destacados' | 'horarios' | 'locales' | 'contacto' | 'secciones'

const TABS: { id: Tab; label: string; hint: string; icon: typeof Clock }[] = [
  { id: 'horarios', label: 'Horarios', hint: 'Atención, delivery y feriados', icon: Clock },
  { id: 'locales', label: 'Locales en la web', hint: 'Dirección, teléfono y mapa', icon: MapPin },
  { id: 'destacados', label: 'Qué vendemos', hint: 'Pollo, chifa, delivery…', icon: Sparkles },
  { id: 'contacto', label: 'Contacto', hint: 'WhatsApp, teléfono y redes', icon: MessageCircle },
  { id: 'contenido', label: 'Textos', hint: 'Marca, nosotros y títulos', icon: Type },
  { id: 'banners', label: 'Banners', hint: 'Carrusel del inicio', icon: Monitor },
  { id: 'secciones', label: 'Qué mostrar', hint: 'Activar u ocultar bloques', icon: Eye },
]

export function WebConfig() {
  const { confirmDelete } = useConfirm()
  const [tab, setTab] = useState<Tab>('horarios')
  const [banners, setBanners] = useState<WebBanner[]>([])
  const [site, setSite] = useState<WebSiteContent>(DEFAULT_WEB_SITE)
  const [editBanner, setEditBanner] = useState<WebBanner | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void Promise.all([apiGetBanners(true), apiGetWebsite(true)])
      .then(([b, w]) => {
        setBanners(normalizeBanners(b.banners))
        setSite(rememberWebSite(w.site))
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  const commitBanners = async (next: WebBanner[]) => {
    setBanners(next)
    setError(null)
    try {
      await apiSaveBanners(next)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const saveSite = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await apiSaveWebsite(site)
      rememberWebSite(site)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const openNew = () => {
    setEditBanner({
      id: `b${Date.now()}`,
      title: '',
      subtitle: '',
      cta: 'Ver carta',
      bgGradient: GRADIENT_OPTIONS[0].value,
      active: true,
    })
    setModalOpen(true)
  }

  const saveBanner = () => {
    if (!editBanner || !editBanner.title.trim()) return
    const exists = banners.some((b) => b.id === editBanner.id)
    const next = exists
      ? banners.map((b) => (b.id === editBanner.id ? editBanner : b))
      : [...banners, editBanner]
    void commitBanners(next)
    setModalOpen(false)
    setEditBanner(null)
  }

  const setHighlight = (id: string, patch: Partial<WebHighlight>) => {
    setSite((prev) => ({
      ...prev,
      highlights: prev.highlights.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }))
  }

  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle
          title="Personalización web"
          hint="Contenido de la web pública: horarios, dirección, qué vende, contacto. Independiente de Sucursales operativas."
        />
        <div className="flex gap-2">
          <a
            href={siteUrl('web')}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-ink hover:bg-cream-dark"
          >
            <Eye size={16} /> Ver web
          </a>
          {tab !== 'banners' ? (
            <button
              onClick={() => void saveSite()}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-ember px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Save size={16} /> {busy ? 'Guardando…' : saved ? 'Guardado' : 'Guardar cambios'}
            </button>
          ) : (
            <button
              onClick={openNew}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-ember px-4 text-sm font-semibold text-white"
            >
              <Plus size={16} /> Nuevo banner
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {TABS.map((t) => {
          const Icon = t.icon
          const on = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-2xl border p-4 text-left transition ${
                on
                  ? 'border-ember bg-ember/10 shadow-sm'
                  : 'border-ink/10 bg-white hover:border-ink/20 hover:bg-cream'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                    on ? 'bg-ember text-white' : 'bg-cream text-ink/60'
                  }`}
                >
                  <Icon size={18} />
                </span>
                <span className="font-bold text-ink">{t.label}</span>
              </div>
              <p className="mt-2 text-xs text-ink/50">{t.hint}</p>
            </button>
          )
        })}
      </div>

      <p className="mt-6 text-sm font-semibold text-ink/55">
        Editando: <span className="text-ink">{activeTab.label}</span>
        <span className="font-normal text-ink/40"> — {activeTab.hint}</span>
      </p>

      {tab === 'banners' ? (
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
                  onClick={() =>
                    void commitBanners(
                      banners.map((b) => (b.id === banner.id ? { ...b, active: !b.active } : b)),
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${banner.active ? 'bg-sage/10 text-sage' : 'bg-ink/5 text-ink/40'}`}
                >
                  {banner.active ? 'Activo' : 'Inactivo'}
                </button>
                <button
                  onClick={() => {
                    setEditBanner({ ...banner })
                    setModalOpen(true)
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-cream-dark"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() =>
                    void confirmDelete(
                      '¿Eliminar este banner?',
                      () => void commitBanners(banners.filter((b) => b.id !== banner.id))
                    )
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-brick hover:bg-red-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'contenido' ? (
        <div className="card mt-6 max-w-2xl space-y-3 p-5">
          <Field label="Nombre de marca">
            <input
              className={inputClass}
              value={site.brandName}
              onChange={(e) => setSite({ ...site, brandName: e.target.value })}
            />
          </Field>
          <Field label="Eslogan">
            <input
              className={inputClass}
              value={site.slogan}
              onChange={(e) => setSite({ ...site, slogan: e.target.value })}
            />
          </Field>
          <Field label="Etiqueta del hero (arriba del título)">
            <input
              className={inputClass}
              value={site.heroEyebrow}
              onChange={(e) => setSite({ ...site, heroEyebrow: e.target.value })}
            />
          </Field>
          <Field label="Título sección Nosotros">
            <input
              className={inputClass}
              value={site.aboutTitle}
              onChange={(e) => setSite({ ...site, aboutTitle: e.target.value })}
            />
          </Field>
          <Field label="Texto Nosotros">
            <textarea
              className={`${inputClass} min-h-28`}
              value={site.aboutText}
              onChange={(e) => setSite({ ...site, aboutText: e.target.value })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Título carta">
              <input
                className={inputClass}
                value={site.menuTitle}
                onChange={(e) => setSite({ ...site, menuTitle: e.target.value })}
              />
            </Field>
            <Field label="Subtítulo carta">
              <input
                className={inputClass}
                value={site.menuSubtitle}
                onChange={(e) => setSite({ ...site, menuSubtitle: e.target.value })}
              />
            </Field>
            <Field label="Título locales">
              <input
                className={inputClass}
                value={site.localesTitle}
                onChange={(e) => setSite({ ...site, localesTitle: e.target.value })}
              />
            </Field>
            <Field label="Subtítulo locales">
              <input
                className={inputClass}
                value={site.localesSubtitle}
                onChange={(e) => setSite({ ...site, localesSubtitle: e.target.value })}
              />
            </Field>
            <Field label="Título contacto">
              <input
                className={inputClass}
                value={site.contactTitle}
                onChange={(e) => setSite({ ...site, contactTitle: e.target.value })}
              />
            </Field>
            <Field label="Subtítulo contacto">
              <input
                className={inputClass}
                value={site.contactSubtitle}
                onChange={(e) => setSite({ ...site, contactSubtitle: e.target.value })}
              />
            </Field>
          </div>
        </div>
      ) : null}

      {tab === 'destacados' ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-ink/50">Bloques de la franja “por qué elegirnos”. Máximo 4 recomendados.</p>
          {site.highlights.map((h) => (
            <div key={h.id} className="card space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Ícono">
                  <select
                    className={inputClass}
                    value={h.icon}
                    onChange={(e) =>
                      setHighlight(h.id, { icon: e.target.value as WebHighlight['icon'] })
                    }
                  >
                    {ICON_OPTIONS.map((ic) => (
                      <option key={ic} value={ic}>
                        {ic}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Título">
                  <input
                    className={inputClass}
                    value={h.title}
                    onChange={(e) => setHighlight(h.id, { title: e.target.value })}
                  />
                </Field>
                <Field label="Texto">
                  <input
                    className={inputClass}
                    value={h.text}
                    onChange={(e) => setHighlight(h.id, { text: e.target.value })}
                  />
                </Field>
              </div>
              <button
                type="button"
                className="text-sm text-brick"
                onClick={() =>
                  setSite((prev) => ({
                    ...prev,
                    highlights: prev.highlights.filter((x) => x.id !== h.id),
                  }))
                }
              >
                Quitar
              </button>
            </div>
          ))}
          {site.highlights.length < 6 ? (
            <button
              type="button"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm"
              onClick={() =>
                setSite((prev) => ({
                  ...prev,
                  highlights: [
                    ...prev.highlights,
                    {
                      id: `h${Date.now()}`,
                      title: 'Nuevo destacado',
                      text: 'Describe el beneficio',
                      icon: 'star',
                    },
                  ],
                }))
              }
            >
              + Agregar destacado
            </button>
          ) : null}
        </div>
      ) : null}


      {tab === 'horarios' ? (
        <div className="card mt-6 max-w-2xl space-y-4 p-5">
          <Field label="Título sección horarios">
            <input
              className={inputClass}
              value={site.scheduleTitle}
              onChange={(e) => setSite({ ...site, scheduleTitle: e.target.value })}
            />
          </Field>
          <Field label="Subtítulo">
            <input
              className={inputClass}
              value={site.scheduleSubtitle}
              onChange={(e) => setSite({ ...site, scheduleSubtitle: e.target.value })}
            />
          </Field>
          <p className="text-sm text-ink/50">
            Sección independiente de Locales. Ej.: Lun–Dom, Delivery, Feriados. Si marcas WhatsApp, usa el número de Contacto.
          </p>
          {site.schedule.map((row, idx) => (
            <div key={row.id} className="space-y-2 rounded-xl bg-cream p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  className={inputClass}
                  value={row.label}
                  placeholder="Lunes – Domingo"
                  onChange={(e) => {
                    const schedule = site.schedule.map((r, i) =>
                      i === idx ? { ...r, label: e.target.value } : r,
                    )
                    setSite({ ...site, schedule })
                  }}
                />
                <input
                  className={inputClass}
                  value={row.hours}
                  placeholder="11:00 – 23:00 o Consultar por WhatsApp"
                  onChange={(e) => {
                    const schedule = site.schedule.map((r, i) =>
                      i === idx ? { ...r, hours: e.target.value } : r,
                    )
                    setSite({ ...site, schedule })
                  }}
                />
                <button
                  type="button"
                  className="rounded-xl bg-white px-3 text-sm font-semibold text-red-600"
                  onClick={() =>
                    setSite({ ...site, schedule: site.schedule.filter((_, i) => i !== idx) })
                  }
                >
                  Quitar
                </button>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2 font-medium text-ink/70">
                  <input
                    type="checkbox"
                    checked={Boolean(row.linkWhatsApp)}
                    onChange={(e) => {
                      const schedule = site.schedule.map((r, i) =>
                        i === idx ? { ...r, linkWhatsApp: e.target.checked, closed: e.target.checked ? false : r.closed } : r,
                      )
                      setSite({ ...site, schedule })
                    }}
                  />
                  Abrir WhatsApp al tocar
                </label>
                <label className="inline-flex items-center gap-2 font-medium text-ink/70">
                  <input
                    type="checkbox"
                    checked={Boolean(row.closed)}
                    onChange={(e) => {
                      const schedule = site.schedule.map((r, i) =>
                        i === idx ? { ...r, closed: e.target.checked, linkWhatsApp: e.target.checked ? false : r.linkWhatsApp } : r,
                      )
                      setSite({ ...site, schedule })
                    }}
                  />
                  Mostrar como cerrado
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream"
            onClick={() =>
              setSite({
                ...site,
                schedule: [
                  ...site.schedule,
                  {
                    id: `s${Date.now()}`,
                    label: 'Nuevo',
                    hours: '11:00 – 23:00',
                    linkWhatsApp: false,
                  } satisfies WebScheduleRow,
                ],
              })
            }
          >
            <Plus size={16} /> Agregar fila
          </button>
        </div>
      ) : null}

      {tab === 'locales' ? (
        <div className="card mt-6 max-w-3xl space-y-4 p-5">
          <p className="text-sm text-ink/50">
            Esto es lo que ve el visitante en “Nuestros locales”. No es lo mismo que Sucursales del sistema (POS/cocina).
          </p>
          <Field label="Título sección locales">
            <input
              className={inputClass}
              value={site.localesTitle}
              onChange={(e) => setSite({ ...site, localesTitle: e.target.value })}
            />
          </Field>
          <Field label="Subtítulo">
            <input
              className={inputClass}
              value={site.localesSubtitle}
              onChange={(e) => setSite({ ...site, localesSubtitle: e.target.value })}
            />
          </Field>
          {site.branches.map((br, idx) => (
            <div key={br.id} className="space-y-2 rounded-2xl border border-ink/10 p-4">
              <div className="flex items-center justify-between">
                <p className="font-bold">Local público {idx + 1}</p>
                <button
                  type="button"
                  className="text-sm font-semibold text-red-600"
                  onClick={() =>
                    setSite({ ...site, branches: site.branches.filter((_, i) => i !== idx) })
                  }
                >
                  Eliminar
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Nombre">
                  <input
                    className={inputClass}
                    value={br.name}
                    onChange={(e) => {
                      const branches = site.branches.map((b, i) =>
                        i === idx ? { ...b, name: e.target.value } : b,
                      )
                      setSite({ ...site, branches })
                    }}
                  />
                </Field>
                <Field label="Teléfono">
                  <input
                    className={inputClass}
                    value={br.phone}
                    onChange={(e) => {
                      const branches = site.branches.map((b, i) =>
                        i === idx ? { ...b, phone: e.target.value } : b,
                      )
                      setSite({ ...site, branches })
                    }}
                  />
                </Field>
                <Field label="Dirección">
                  <input
                    className={inputClass}
                    value={br.address}
                    onChange={(e) => {
                      const branches = site.branches.map((b, i) =>
                        i === idx ? { ...b, address: e.target.value } : b,
                      )
                      setSite({ ...site, branches })
                    }}
                  />
                </Field>
                <Field label="Horario del local">
                  <input
                    className={inputClass}
                    value={br.hours}
                    onChange={(e) => {
                      const branches = site.branches.map((b, i) =>
                        i === idx ? { ...b, hours: e.target.value } : b,
                      )
                      setSite({ ...site, branches })
                    }}
                  />
                </Field>
                <Field label="Link Google Maps">
                  <input
                    className={inputClass}
                    value={br.mapUrl}
                    onChange={(e) => {
                      const branches = site.branches.map((b, i) =>
                        i === idx ? { ...b, mapUrl: e.target.value } : b,
                      )
                      setSite({ ...site, branches })
                    }}
                  />
                </Field>
                <label className="flex items-center gap-2 pt-6 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={br.active}
                    onChange={(e) => {
                      const branches = site.branches.map((b, i) =>
                        i === idx ? { ...b, active: e.target.checked } : b,
                      )
                      setSite({ ...site, branches })
                    }}
                    className="h-4 w-4 accent-ember"
                  />
                  Visible en la web
                </label>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-cream"
            onClick={() =>
              setSite({
                ...site,
                branches: [
                  ...site.branches,
                  {
                    id: `br${Date.now()}`,
                    name: 'Nuevo local',
                    address: '',
                    phone: site.phoneDisplay,
                    hours: '11:00 – 23:00',
                    mapUrl: '',
                    active: true,
                  } satisfies WebBranch,
                ],
              })
            }
          >
            <Plus size={16} /> Agregar local en la web
          </button>
        </div>
      ) : null}

      {tab === 'contacto' ? (
        <div className="card mt-6 max-w-xl space-y-3 p-5">
          <Field label="WhatsApp (código país + número, sin +)">
            <input
              className={inputClass}
              value={site.whatsappNumber}
              onChange={(e) => setSite({ ...site, whatsappNumber: e.target.value.replace(/\D/g, '') })}
              placeholder="51962797752"
            />
          </Field>
          <Field label="Teléfono a mostrar">
            <input
              className={inputClass}
              value={site.phoneDisplay}
              onChange={(e) => setSite({ ...site, phoneDisplay: e.target.value })}
              placeholder="962 797 752"
            />
          </Field>
          <Field label="Facebook (URL)">
            <input
              className={inputClass}
              value={site.facebookUrl}
              onChange={(e) => setSite({ ...site, facebookUrl: e.target.value })}
            />
          </Field>
          <Field label="Instagram (URL, opcional)">
            <input
              className={inputClass}
              value={site.instagramUrl}
              onChange={(e) => setSite({ ...site, instagramUrl: e.target.value })}
            />
          </Field>
          <Field label="TikTok (URL, opcional)">
            <input
              className={inputClass}
              value={site.tiktokUrl}
              onChange={(e) => setSite({ ...site, tiktokUrl: e.target.value })}
              placeholder="https://www.tiktok.com/@edgarlopezvega07"
            />
          </Field>
        </div>
      ) : null}

      {tab === 'secciones' ? (
        <div className="card mt-6 max-w-lg space-y-3 p-5">
          <p className="text-sm text-ink/50">Activa o desactiva bloques de la página pública.</p>
          {(
            [
              ['highlights', 'Destacados'],
              ['about', 'Nosotros'],
              ['menu', 'Carta / menú'],
              ['schedule', 'Horarios'],
              ['locales', 'Sucursales / Locales'],
              ['contact', 'Contacto'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center justify-between rounded-xl bg-cream px-4 py-3"
            >
              <span className="font-semibold">{label}</span>
              <input
                type="checkbox"
                checked={site.sections[key]}
                onChange={(e) =>
                  setSite({
                    ...site,
                    sections: { ...site.sections, [key]: e.target.checked },
                  })
                }
                className="h-5 w-5 accent-ember"
              />
            </label>
          ))}
        </div>
      ) : null}

      <Modal
        open={modalOpen}
        title={editBanner?.title ? 'Editar banner' : 'Nuevo banner'}
        onClose={() => setModalOpen(false)}
      >
        {editBanner && (
          <div className="space-y-3">
            <Field label="Título">
              <input
                className={inputClass}
                value={editBanner.title}
                onChange={(e) => setEditBanner({ ...editBanner, title: e.target.value })}
                placeholder="Pollo a la brasa"
              />
            </Field>
            <Field label="Subtítulo">
              <input
                className={inputClass}
                value={editBanner.subtitle}
                onChange={(e) => setEditBanner({ ...editBanner, subtitle: e.target.value })}
              />
            </Field>
            <Field label="Texto del botón">
              <input
                className={inputClass}
                value={editBanner.cta}
                onChange={(e) => setEditBanner({ ...editBanner, cta: e.target.value })}
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
            <div
              className={`mt-4 rounded-xl bg-gradient-to-br ${editBanner.bgGradient} p-6 text-center text-white`}
            >
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
              Guardar banner
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}
