/** Contenido administrable de la página web pública (AppConfig key: web_site) */

export interface WebHighlight {
  id: string
  title: string
  text: string
  icon: 'truck' | 'clock' | 'star' | 'flame' | 'utensils' | 'map'
}

export interface WebBranch {
  id: string
  name: string
  address: string
  phone: string
  hours: string
  mapUrl: string
  active: boolean
}

export interface WebScheduleRow {
  id: string
  label: string
  hours: string
  closed?: boolean
  /** Si true, el texto de hours abre WhatsApp (número de Contacto) */
  linkWhatsApp?: boolean
}

export interface WebSiteContent {
  brandName: string
  slogan: string
  heroEyebrow: string
  aboutTitle: string
  aboutText: string
  menuTitle: string
  menuSubtitle: string
  localesTitle: string
  localesSubtitle: string
  scheduleTitle: string
  scheduleSubtitle: string
  contactTitle: string
  contactSubtitle: string
  whatsappNumber: string
  phoneDisplay: string
  facebookUrl: string
  instagramUrl: string
  tiktokUrl: string
  highlights: WebHighlight[]
  branches: WebBranch[]
  schedule: WebScheduleRow[]
  sections: {
    highlights: boolean
    about: boolean
    menu: boolean
    schedule: boolean
    locales: boolean
    contact: boolean
  }
}

export const DEFAULT_WEB_SITE: WebSiteContent = {
  brandName: 'Chifa-Pollería Lopez',
  slogan: 'El mejor pollo a la brasa de Cañete',
  heroEyebrow: '⭐ Cañete · Chifa & Pollería',
  aboutTitle: 'Sazón de casa, desde Cañete',
  aboutText:
    'Somos una familia cañetana que une lo mejor del chifa y el pollo a la brasa. Recetas con sazón de casa, ingredientes frescos y atención cercana. Ven a visitarnos o pídelo por delivery con seguimiento en vivo.',
  menuTitle: 'Nuestra carta',
  menuSubtitle: 'Pollo a la brasa, chifa y especiales listos para ti',
  localesTitle: 'Nuestros locales',
  localesSubtitle: 'Salón, para llevar o delivery — te esperamos',
  scheduleTitle: 'Horarios de atención',
  scheduleSubtitle: 'Abierto todos los días para almuerzo y cena',
  contactTitle: 'Habla con nosotros',
  contactSubtitle: 'WhatsApp, llamada o redes. Respondemos rápido.',
  whatsappNumber: '51962797752',
  phoneDisplay: '962 797 752',
  facebookUrl: 'https://www.facebook.com/p/Chifa-polleria-Lopez-61586064026668/',
  instagramUrl: '',
  tiktokUrl: 'https://www.tiktok.com/@edgarlopezvega07',
  highlights: [
    {
      id: 'h1',
      title: 'Pollo a la brasa',
      text: 'Crujiente por fuera, jugoso por dentro. El sabor que todos piden.',
      icon: 'flame',
    },
    {
      id: 'h2',
      title: 'Chifa casero',
      text: 'Chaufa, tallarín y especiales con sazón de siempre.',
      icon: 'utensils',
    },
    {
      id: 'h3',
      title: 'Delivery rápido',
      text: 'Pedidos por web o WhatsApp, con seguimiento en vivo.',
      icon: 'truck',
    },
    {
      id: 'h4',
      title: 'Horario amplio',
      text: 'Abierto todos los días para almuerzo y cena en familia.',
      icon: 'clock',
    },
  ],
  branches: [
    {
      id: 'br1',
      name: 'Local Principal',
      address: 'Chocos Imperial, Cañete',
      phone: '962 797 752',
      hours: '11:00 – 23:00',
      mapUrl: 'https://maps.google.com/?q=Chocos+Imperial+Ca%C3%B1ete',
      active: true,
    },
  ],
  schedule: [
    { id: 's1', label: 'Lunes – Domingo', hours: '11:00 – 23:00' },
    { id: 's2', label: 'Delivery', hours: '11:00 – 22:30' },
    {
      id: 's3',
      label: 'Feriados',
      hours: 'Consultar por WhatsApp',
      linkWhatsApp: true,
    },
  ],
  sections: {
    highlights: true,
    about: true,
    menu: true,
    schedule: true,
    locales: true,
    contact: true,
  },
}

export interface WebBanner {
  id: string
  title: string
  subtitle: string
  cta: string
  bgGradient: string
  active: boolean
}

export const DEFAULT_WEB_BANNERS: WebBanner[] = [
  {
    id: 'b1',
    title: 'El mejor pollo de Cañete',
    subtitle: 'Crujiente por fuera, jugoso por dentro. El sabor que todos aman.',
    cta: 'Ver carta',
    bgGradient: 'from-[#0b2a0b] via-[#1a3d1a] to-[#0f4d2e]',
    active: true,
  },
  {
    id: 'b2',
    title: 'Chifa & pollería en uno',
    subtitle: 'Chaufa, tallarín y pollo a la brasa. Todo en un solo lugar.',
    cta: 'Pedir ahora',
    bgGradient: 'from-[#3d1a0b] via-[#5c2e0a] to-[#1a3d1a]',
    active: true,
  },
  {
    id: 'b3',
    title: 'Delivery a tu puerta',
    subtitle: 'Pide por la web y sigue tu pedido en tiempo real.',
    cta: 'Ordenar',
    bgGradient: 'from-[#062016] via-[#0f3d2e] to-[#1a3d1a]',
    active: true,
  },
]

function isTestBanner(title: string, subtitle: string) {
  const t = `${title} ${subtitle}`.toLowerCase()
  return /api\s*ok|desde\s*sql|test\s*banner|hello\s*world/.test(t)
}

/** Normaliza banners del API y descarta pruebas tipo "API OK". */
export function normalizeBanners(raw: unknown): WebBanner[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_WEB_BANNERS
  const mapped: WebBanner[] = []
  for (let i = 0; i < raw.length; i++) {
    const b = raw[i] as Record<string, unknown>
    const title = String(b.title ?? '').trim()
    const subtitle = String(b.subtitle ?? '').trim()
    if (!title || isTestBanner(title, subtitle)) continue
    if (b.active === false || b.active === 0) continue
    const bg = String(
      b.bgGradient ?? b.bgGradient ?? DEFAULT_WEB_BANNERS[i % DEFAULT_WEB_BANNERS.length].bgGradient,
    ).trim()
    mapped.push({
      id: String(b.id ?? `b${i + 1}`),
      title,
      subtitle,
      cta: String(b.cta ?? 'Ver carta').trim() || 'Ver carta',
      bgGradient: bg || DEFAULT_WEB_BANNERS[0].bgGradient,
      active: true,
    })
  }
  return mapped.length ? mapped : DEFAULT_WEB_BANNERS
}

export function mergeWebSite(raw: unknown): WebSiteContent {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_WEB_SITE }
  const s = raw as Record<string, unknown>
  return {
    ...DEFAULT_WEB_SITE,
    brandName: String(s.brandName ?? DEFAULT_WEB_SITE.brandName),
    slogan: String(s.slogan ?? DEFAULT_WEB_SITE.slogan),
    heroEyebrow: String(s.heroEyebrow ?? s.heroEyebrow ?? DEFAULT_WEB_SITE.heroEyebrow),
    aboutTitle: String(s.aboutTitle ?? DEFAULT_WEB_SITE.aboutTitle),
    aboutText: String(s.aboutText ?? DEFAULT_WEB_SITE.aboutText),
    menuTitle: String(s.menuTitle ?? DEFAULT_WEB_SITE.menuTitle),
    menuSubtitle: String(s.menuSubtitle ?? DEFAULT_WEB_SITE.menuSubtitle),
    localesTitle: String(s.localesTitle ?? DEFAULT_WEB_SITE.localesTitle),
    localesSubtitle: String(s.localesSubtitle ?? DEFAULT_WEB_SITE.localesSubtitle),
    scheduleTitle: String(s.scheduleTitle ?? DEFAULT_WEB_SITE.scheduleTitle),
    scheduleSubtitle: String(s.scheduleSubtitle ?? DEFAULT_WEB_SITE.scheduleSubtitle),
    contactTitle: String(s.contactTitle ?? DEFAULT_WEB_SITE.contactTitle),
    contactSubtitle: String(s.contactSubtitle ?? DEFAULT_WEB_SITE.contactSubtitle),
    whatsappNumber: String(s.whatsappNumber ?? DEFAULT_WEB_SITE.whatsappNumber).replace(/\D/g, ''),
    phoneDisplay: String(s.phoneDisplay ?? DEFAULT_WEB_SITE.phoneDisplay),
    facebookUrl: String(s.facebookUrl ?? DEFAULT_WEB_SITE.facebookUrl),
    instagramUrl: String(s.instagramUrl ?? ''),
    tiktokUrl: String(s.tiktokUrl ?? ''),
    highlights:
      Array.isArray(s.highlights) && s.highlights.length
        ? (s.highlights as WebHighlight[])
        : DEFAULT_WEB_SITE.highlights,
    branches:
      Array.isArray(s.branches) && s.branches.length
        ? (s.branches as WebBranch[])
        : DEFAULT_WEB_SITE.branches,
    schedule:
      Array.isArray(s.schedule) && s.schedule.length
        ? (s.schedule as Record<string, unknown>[]).map((row, i) => {
            const hours = String(row.hours ?? '').trim()
            const explicit = row.linkWhatsApp === true || row.linkWhatsApp === 1
            const auto = /whatsapp/i.test(hours)
            return {
              id: String(row.id ?? `s${i + 1}`),
              label: String(row.label ?? '').trim() || `Horario ${i + 1}`,
              hours: hours || '—',
              closed: row.closed === true || row.closed === 1,
              linkWhatsApp: explicit || auto,
            } satisfies WebScheduleRow
          })
        : DEFAULT_WEB_SITE.schedule,
    sections: {
      ...DEFAULT_WEB_SITE.sections,
      ...((s.sections as WebSiteContent['sections']) || {}),
    },
  }
}
