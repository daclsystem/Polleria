import { useContext } from 'react'
import { Moon, Sun } from 'lucide-react'
import { ThemeContext } from './ThemeProvider'

export function ThemeToggle({
  className = '',
  tone = 'light',
}: {
  className?: string
  /** `dark` = sobre barra verde/negra; `light` = sobre header claro */
  tone?: 'light' | 'dark'
}) {
  const ctx = useContext(ThemeContext)
  if (!ctx) return null
  const { theme, toggle } = ctx
  const dark = theme === 'dark'
  const base =
    tone === 'dark'
      ? 'bg-white/10 text-white hover:bg-white/20'
      : 'bg-ink/[0.05] text-ink/70 hover:bg-ink/[0.1] hover:text-ink'

  return (
    <button
      type="button"
      onClick={toggle}
      className={`tap inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${base} ${className}`}
      aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={dark ? 'Modo claro' : 'Modo oscuro'}
    >
      {dark ? <Sun size={18} strokeWidth={2.2} /> : <Moon size={18} strokeWidth={2.2} />}
    </button>
  )
}
