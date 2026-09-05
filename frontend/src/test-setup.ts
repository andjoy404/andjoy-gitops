import '@testing-library/jest-dom/vitest'
import { beforeAll } from 'vitest'

// antd's useBreakpoint and responsiveObserver call window.matchMedia
// which is not available in jsdom. Stub it before any component renders.
beforeAll(() => {
  const matchMediaMock: typeof window.matchMedia = (() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  })) as never

  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    ;(window as any).matchMedia = matchMediaMock
  }

  const createStorageMock = () => {
    let store: Record<string, string> = {}
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value)
      },
      removeItem: (key: string) => {
        delete store[key]
      },
      clear: () => {
        store = {}
      },
      key: (index: number) => Object.keys(store)[index] ?? null,
      get length() {
        return Object.keys(store).length
      },
    }
  }

  const storageMock = createStorageMock()
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
    })
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storageMock,
    writable: true,
    configurable: true,
  })
})

