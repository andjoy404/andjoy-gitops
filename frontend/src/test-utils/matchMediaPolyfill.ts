import { vi } from 'vitest'

export function stubMatchMedia() {
  const matchMediaMock = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  })) as never

  vi.stubGlobal('matchMedia', matchMediaMock)
}
