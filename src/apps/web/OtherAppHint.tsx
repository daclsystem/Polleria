import { siteUrl } from '../../lib/paths'

const APPS = {
  system: {
    title: 'Sistema POS',
    command: 'npm run dev:system',
    href: () => siteUrl('system', '/login'),
  },
  driver: {
    title: 'App del repartidor',
    command: 'npm run dev:driver',
    href: () => siteUrl('driver', '/'),
  },
  cliente: {
    title: 'App del cliente',
    command: 'npm run dev:cliente',
    href: () => siteUrl('cliente', '/'),
  },
} as const

/** La web pública no es el POS. Sin esto, `/system` caía al inicio y parecía que no se podía entrar. */
export function OtherAppHint({ app }: { app: keyof typeof APPS }) {
  const cfg = APPS[app]
  const href = cfg.href()
  let sameOrigin = false
  try {
    sameOrigin = new URL(href).origin === window.location.origin
  } catch {
    sameOrigin = true
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#1a3d1a] px-6 py-12 text-center text-white">
      <img src="/logo-lopez.png" alt="Chifa Pollería Lopez" className="h-20 w-auto rounded-xl shadow-xl" />
      <h1 className="mt-8 text-3xl font-black tracking-tight">{cfg.title}</h1>
      <p className="mt-3 max-w-md text-sm text-green-100/80">
        Esta ventana es la web pública. {cfg.title} es otra aplicación.
      </p>
      {import.meta.env.DEV && sameOrigin ? (
        <p className="mt-6 max-w-md rounded-2xl bg-black/25 px-4 py-3 font-mono text-sm text-[#ffd700]">
          {cfg.command}
        </p>
      ) : (
        <a
          href={href}
          className="mt-8 inline-flex rounded-2xl bg-[#ffd700] px-8 py-3.5 text-base font-black text-[#1a3d1a] shadow-lg shadow-yellow-500/20"
        >
          Entrar a {cfg.title}
        </a>
      )}
    </div>
  )
}
