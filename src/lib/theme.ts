export type Theme = 'light' | 'dark'
export type ThemePreference = 'system' | Theme

export const THEME_KEY = 'polleria-theme'

export function systemTheme(): Theme {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

export function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light' || saved === 'system') return saved
  } catch {
    /* ignore */
  }
  return 'system'
}

export function resolveTheme(pref: ThemePreference = readPreference()): Theme {
  return pref === 'system' ? systemTheme() : pref
}

/** Aplica clase/color. No guarda: el default del sistema no se pisa hasta que el usuario elija. */
export function applyResolved(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#121612' : '#f4f5f7')
}

export function savePreference(pref: ThemePreference) {
  try {
    localStorage.setItem(THEME_KEY, pref)
  } catch {
    /* ignore */
  }
}

/** Compat: lee el tema ya resuelto (sistema o elección). */
export function readTheme(): Theme {
  return resolveTheme()
}

export function applyTheme(theme: Theme) {
  savePreference(theme)
  applyResolved(theme)
}
