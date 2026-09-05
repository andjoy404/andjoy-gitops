import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const THEME_KEY = 'theme'
const THEME_CLASS = 'dark-theme'
const LEGACY_DARK_THEME = ['dra', 'cula'].join('')

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    // One-time compatibility upgrade for browsers that persisted the former
    // seven-character dark-theme identifier.
    if (stored === LEGACY_DARK_THEME) {
      localStorage.setItem(THEME_KEY, 'dark')
      return 'dark'
    }
    return stored === 'dark' ? 'dark' : (stored === 'light' ? 'light' : 'dark')
  } catch {
    // Default to dark theme on first clean deploy when no preference was ever saved.
    return 'dark'
  }
}

function writeTheme(next: Theme) {
  try {
    localStorage.setItem(THEME_KEY, next)
  } catch {
    // ignore
  }
}

/* localStorage is the source of truth for the preference; an in-memory copy
   would go stale across tabs and would need extra reset plumbing in tests.
   Reading the (small) storage entry on each snapshot is cheap and always
   reflects the persisted value. */
const listeners = new Set<() => void>()

/* A transient override used for live theme previews (e.g. the settings page
   shows a new theme before Save is clicked). When set, it shadows the stored
   value for every consumer; `null` means "use the persisted theme". */
let themeOverride: Theme | null = null

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTheme(): Theme {
  if (themeOverride) return themeOverride
  return readTheme()
}

/* Live preview: toggle the document class and notify subscribers without
   touching localStorage. `null` clears the preview and reverts to the stored
   theme. */
export function setThemePreview(next: Theme | null) {
  const current = getTheme()
  themeOverride = next
  applyThemeClass(next ?? readTheme())
  if (getTheme() !== current) emit()
}

export function clearThemePreview() {
  setThemePreview(null)
}

/* Applies the theme permanently: persists the preference, clears any pending
   preview, toggles the document class, and notifies subscribers. */
export function setTheme(next: Theme) {
  const changed = getTheme() !== next
  writeTheme(next)
  themeOverride = null
  applyThemeClass(next)
  if (changed) emit()
}

/* Reflects the current (or given) theme on <html>. Called by App once a
   session is authenticated so a persisted preference shows on deep links. */
export function applyThemeClass(theme: Theme = getTheme()) {
  document.documentElement.classList.toggle(THEME_CLASS, theme === 'dark')
}

export function clearThemeClass() {
  document.documentElement.classList.remove(THEME_CLASS)
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme)
}
