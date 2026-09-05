import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { getTheme, setTheme, applyThemeClass, clearThemeClass, useTheme } from './useTheme'

beforeEach(() => {
  document.documentElement.classList.remove('dark-theme')
  localStorage.clear()
  cleanup()
})

function Probe() {
  const theme = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme('dark')}>
        to-dark
      </button>
      <button type="button" onClick={() => setTheme('light')}>
        to-light
      </button>
    </div>
  )
}

function SecondProbe() {
  const theme = useTheme()
  return <span data-testid="second-theme">{theme}</span>
}

describe('useTheme store', () => {
  it('defaults to dark when no preference is stored', () => {
    expect(getTheme()).toBe('dark')
  })

  it('reads a stored dark preference on first access', () => {
    localStorage.setItem('theme', 'dark')
    expect(getTheme()).toBe('dark')
    // Reading the preference must not itself toggle the document class.
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false)
  })

  it('upgrades the former persisted dark-theme identifier', () => {
    localStorage.setItem('theme', ['dra', 'cula'].join(''))
    expect(getTheme()).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('applies the class, persists the value, and updates the store on setTheme', () => {
    setTheme('dark')
    expect(getTheme()).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true)
  })

  it('reverts to light and removes the class when set back', () => {
    setTheme('dark')
    setTheme('light')
    expect(getTheme()).toBe('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false)
  })

  it('persists theme on setTheme', () => {
    setTheme('light')
    expect(localStorage.getItem('theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false)
  })

  it('clearThemeClass removes the class without touching the stored preference', () => {
    setTheme('dark')
    clearThemeClass()
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false)
    expect(getTheme()).toBe('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('applyThemeClass re-applies the current theme to the document', () => {
    setTheme('dark')
    clearThemeClass()
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false)
    applyThemeClass()
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true)
  })
})

describe('useTheme hook (React)', () => {
  it('re-renders subscribers when the theme changes', () => {
    render(<Probe />)
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')

    fireEvent.click(screen.getByRole('button', { name: 'to-light' }))
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'to-dark' }))
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true)
  })

  it('reflects a stored preference to a fresh subscriber on mount', () => {
    localStorage.setItem('theme', 'dark')
    render(<Probe />)
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
  })

  it('updates every subscriber when the theme changes', () => {
    render(
      <div>
        <Probe />
        <SecondProbe />
      </div>,
    )
    expect(screen.getByTestId('second-theme')).toHaveTextContent('dark')

    fireEvent.click(screen.getByRole('button', { name: 'to-light' }))
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(screen.getByTestId('second-theme')).toHaveTextContent('light')
  })
})
