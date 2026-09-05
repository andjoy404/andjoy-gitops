import { vi } from 'vitest'

export function stubMatchMedia(matches: (query: string) => boolean = () => false) {
  const matchMediaMock = ((query: string) => ({
    matches: matches(query),
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

export function stubGetComputedStyle() {
  const mockGetComputedStyle = (
    elt: globalThis.Element,
    pseudoElt?: string | null,
  ) =>
    ({
      getPropertyValue: () => '',
      getPropertyPriority: () => '',
      item: () => '',
      forEach: () => {},
    }) as unknown as CSSStyleDeclaration
  vi.stubGlobal('getComputedStyle', mockGetComputedStyle)
}
