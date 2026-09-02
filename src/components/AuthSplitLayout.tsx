import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { withBase } from '../lib/paths'
import { APP_VERSION } from '../lib/version'

export function AuthSplitLayout({
  kicker,
  title,
  subtitle,
  highlights,
  footer,
  children,
}: {
  kicker: string
  title: string
  subtitle: string
  highlights?: { icon: LucideIcon; title: string; desc: string }[]
  footer?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-cream text-ink lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,28rem)] xl:grid-cols-[minmax(0,1.25fr)_32rem]">
      <aside className="relative isolate min-h-[34vh] overflow-hidden text-white sm:min-h-[38vh] lg:min-h-dvh">
        <img
          src={withBase('login-polleria.jpg')}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-[center_42%]"
        />
        <div className="absolute inset-0 bg-black/45 lg:bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/25 lg:bg-gradient-to-r lg:from-black/20 lg:via-black/45 lg:to-black/70" />

        <div className="relative flex h-full min-h-[34vh] flex-col justify-between px-4 pb-5 pt-[max(0.7rem,env(safe-area-inset-top))] sm:min-h-[38vh] sm:px-8 sm:pb-8 lg:min-h-dvh lg:px-12 lg:py-10 xl:px-16">
          <div className="flex items-center justify-between gap-3">
            <img
              src={withBase('logo-lopez.png')}
              alt="Chifa Pollería Lopez"
              className="h-12 w-auto rounded-xl shadow-2xl ring-1 ring-white/20 sm:h-14 lg:h-16"
            />
            <ThemeToggle tone="dark" className="h-11 w-11 lg:hidden" />
          </div>

          <div className="max-w-lg">
            <p className="text-[10px] font-bold tracking-[0.28em] text-gold uppercase">{kicker}</p>
            <h1 className="mt-2 text-2xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">{title}</h1>
            <p className="mt-2 hidden max-w-md text-sm leading-relaxed text-white/80 sm:block lg:text-base">{subtitle}</p>

            {highlights?.length ? (
              <ul className="mt-8 hidden gap-2.5 lg:grid">
                {highlights.map(({ icon: Icon, title: itemTitle, desc }) => (
                  <li
                    key={itemTitle}
                    className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/30 px-4 py-3 backdrop-blur-sm"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/20 text-gold">
                      <Icon size={18} strokeWidth={2.2} />
                    </span>
                    <span>
                      <p className="text-sm font-bold text-white">{itemTitle}</p>
                      <p className="text-xs text-white/65">{desc}</p>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {footer ? <p className="mt-6 hidden text-xs text-white/55 lg:block">{footer}</p> : null}
          </div>
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col justify-center bg-cream px-5 py-7 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-ink sm:px-10 sm:py-10 lg:border-l lg:border-ink/8 lg:px-10 xl:px-14">
        <div className="absolute right-4 top-4 hidden lg:block">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-[24.5rem]">
          {children}
          <p className="mt-8 text-center text-[10px] font-medium tracking-wide text-ink/30">v{APP_VERSION}</p>
        </div>
      </main>
    </div>
  )
}
