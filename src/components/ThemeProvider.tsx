import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyResolved,
  readPreference,
  resolveTheme,
  savePreference,
  systemTheme,
  type Theme,
  type ThemePreference,
} from '../lib/theme'

type ThemeContextValue = {
  theme: Theme
  preference: ThemePreference
  setTheme: (theme: Theme) => void
  setPreference: (pref: ThemePreference) => void
  toggle: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPrefState] = useState<ThemePreference>(() => readPreference())
  const [theme, setThemeState] = useState<Theme>(() => {
    const initial = resolveTheme(readPreference())
    applyResolved(initial)
    return initial
  })

  const applyPref = useCallback((pref: ThemePreference) => {
    const resolved = resolveTheme(pref)
    applyResolved(resolved)
    setThemeState(resolved)
  }, [])

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      savePreference(pref)
      setPrefState(pref)
      applyPref(pref)
    },
    [applyPref],
  )

  const setTheme = useCallback(
    (next: Theme) => {
      setPreference(next)
    },
    [setPreference],
  )

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next = systemTheme()
      applyResolved(next)
      setThemeState(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  const value = useMemo(
    () => ({ theme, preference, setTheme, setPreference, toggle }),
    [theme, preference, setTheme, setPreference, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme requiere ThemeProvider')
  return ctx
}
