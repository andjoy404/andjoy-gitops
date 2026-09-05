import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import { GroupContext } from '../contexts/GroupContext'
import RelationsMapPage from './RelationsMapPage'

// federated group id: namespace_id << 44 | local_id
const NS = 5
const FED = (local: number) => NS * 17592186044416 + local
const GROUP_A = FED(11)
const GROUP_B = FED(12)

const groupsResponse = [
  { id: GROUP_A, name: 'alpha', full_path: 'alpha' },
  { id: GROUP_B, name: 'beta', full_path: 'beta' },
]

const ugpGraph = {
  nodes: [
    { id: 'user:11', type: 'user', label: 'Alice', secondary_label: '@alice' },
    { id: 'group:11', type: 'group', label: 'alpha', secondary_label: 'alpha' },
    { id: 'project:101', type: 'project', label: 'web', secondary_label: 'alpha/web' },
  ],
  edges: [
    { id: 'user:11->group:11', source: 'user:11', target: 'group:11', type: 'user-group' },
    { id: 'group:11->project:101', source: 'group:11', target: 'project:101', type: 'group-project' },
    { id: 'user:11->project:101', source: 'user:11', target: 'project:101', type: 'user-project' },
  ],
  metadata: { map_type: 'user-group-project', node_count: 3, edge_count: 3 },
}

const graphOptions = {
  users: [{ id: 11, username: 'alice', name: 'Alice' }],
  projects: [{ id: 101, name: 'web', path_with_ns: 'alpha/web' }],
  branches: ['main', 'dev'],
}

// Route-aware mock fetch: groups + graph + options all succeed.
const routeFetch = async (url: RequestInfo | URL) => {
  const u = String(url)
  if (u.includes('/api/groups')) return { ok: true, status: 200, json: () => Promise.resolve(groupsResponse) } as Response
  if (u.includes('/api/graph/options')) return { ok: true, status: 200, json: () => Promise.resolve(graphOptions) } as Response
  if (u.includes('/api/graph')) return { ok: true, status: 200, json: () => Promise.resolve(ugpGraph) } as Response
  return { ok: false, status: 404 } as Response
}

function mount(context?: { selectedGroupId?: number; selectedEnvId?: number; envNamespaceId?: number }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const value = {
    selectedGroupId: GROUP_A,
    selectedEnvId: 99,
    envNamespaceId: NS,
    setSelectedGroupId: vi.fn(),
    ...context,
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <GroupContext.Provider value={value}>
        <MemoryRouter>
          <RelationsMapPage />
        </MemoryRouter>
      </GroupContext.Provider>
    </QueryClientProvider>,
  )
}

// The root entry picker is a searchbox; click it to open the starting-options dropdown.
const openRootDropdown = async () => {
  let rootEl: HTMLElement | null = null
  await waitFor(() => {
    rootEl = document.querySelector<HTMLElement>('.drill-root-select')
    expect(rootEl, 'root select').toBeTruthy()
  }, { timeout: 5000 })
  const selector = rootEl!.querySelector('.ant-select-selector') as HTMLElement | null
  expect(selector, 'root select handle').toBeTruthy()
  fireEvent.mouseDown(selector!)
  await waitFor(() => {
    expect(document.querySelectorAll('.ant-select-item-option').length).toBeGreaterThan(0)
  }, { timeout: 5000 })
}

const pickRoot = async (label: string) => {
  await openRootDropdown()
  let opt: HTMLElement | null = null
  await waitFor(() => {
    opt = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option')).find(
      (n) => (n.textContent ?? '').trim() === label,
    ) ?? null
    expect(opt, `root option "${label}"`).toBeTruthy()
  }, { timeout: 5000 })
  fireEvent.click(opt!)
  await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBe(0), { timeout: 2000 }).catch(() => {})
}

const rowLabel = (label: string): HTMLElement | null =>
  Array.from(document.querySelectorAll<HTMLElement>('.drill-row-label')).find(
    (n) => (n.textContent ?? '').trim() === label,
  ) ?? null

// A level dropdown is present once its row label is on screen.
const expectLevel = async (label: string, timeout = 5000) =>
  await waitFor(() => expect(rowLabel(label), `level "${label}"`).toBeTruthy(), { timeout })

const expectNoLevel = (label: string) => expect(rowLabel(label), `level "${label}"`).toBeNull()

// Open a level dropdown by its row label, then click an option by text.
const pickInDropdown = async (label: string, option: string) => {
  await expectLevel(label)
  const row = rowLabel(label)?.closest('.drill-row') as HTMLElement | null
  const selector = row?.querySelector('.ant-select-selector') as HTMLElement | null
  expect(selector, `dropdown for "${label}"`).toBeTruthy()
  fireEvent.mouseDown(selector!)
  // The dropdown opens in a portal; wait for the option to be present.
  let opt: HTMLElement | null = null
  await waitFor(() => {
    opt = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option')).find(
      (n) => (n.textContent ?? '').trim() === option,
    ) ?? null
    expect(opt, `option "${option}"`).toBeTruthy()
  }, { timeout: 5000 })
  fireEvent.click(opt!)
  await waitFor(() => expect(document.querySelectorAll('.ant-select-item-option').length).toBe(0), { timeout: 2000 }).catch(() => {})
}

describe('RelationsMapPage — drill-down dropdowns', () => {
  beforeEach(() => {
    cleanup()
    stubMatchMedia()
    stubGetComputedStyle()
    vi.stubGlobal('fetch', routeFetch)
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows an empty entry searchbox; opening it lists the three starting options', async () => {
    mount()
    expect(await screen.findByText('RELATIONSHIPS', {}, { timeout: 5000 })).toBeInTheDocument()
    // No root picked yet: no drill-down levels present.
    expectNoLevel('Groups')
    expectNoLevel('Projects')
    expectNoLevel('Users')

    await openRootDropdown()
    let opts: HTMLElement[] = []
    await waitFor(() => {
      opts = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option'))
      expect(opts.length).toBeGreaterThanOrEqual(3)
    }, { timeout: 5000 })
    const labels = opts.map((n) => (n.textContent ?? '').trim())
    for (const label of ['Groups', 'Projects', 'Users']) {
      expect(labels, `starting option "${label}"`).toContain(label)
    }
    expect(labels, 'Branches is not a starting option').not.toContain('Branches')
  })

  it('Groups root: selecting a group reveals the Projects dropdown', async () => {
    mount()
    await pickRoot('Groups')

    // Only Groups is visible at first.
    await expectLevel('Groups')
    expectNoLevel('Projects')
    expectNoLevel('Branches')
    expectNoLevel('Users')

    // Pick group "alpha" inside the Groups dropdown.
    await pickInDropdown('Groups', 'alpha')

    // Projects dropdown now appears (one step revealed at a time).
    await expectLevel('Projects')
    expectNoLevel('Branches')
    expectNoLevel('Users')
  })

  it('does not offer groups that have no related projects', async () => {
    mount()
    await pickRoot('Groups')
    await expectLevel('Groups')

    const row = rowLabel('Groups')?.closest('.drill-row') as HTMLElement | null
    const selector = row?.querySelector('.ant-select-selector') as HTMLElement | null
    fireEvent.mouseDown(selector!)

    await waitFor(() => {
      const labels = Array.from(document.querySelectorAll<HTMLElement>('.ant-select-item-option'))
        .map((option) => (option.textContent ?? '').trim())
      expect(labels).toContain('alpha')
      expect(labels).not.toContain('beta')
    })
  })

  it('Groups root: selecting a project reveals Branches (CICD map, no Users)', async () => {
    mount()
    await pickRoot('Groups')
    await pickInDropdown('Groups', 'alpha')
    await expectLevel('Projects')

    // Project labels are relative to the selected group, so the group's own
    // path prefix ("alpha/") is stripped from the option text.
    await pickInDropdown('Projects', 'web')

    await expectLevel('Branches')
    expectNoLevel('Users')
  })

  it('Projects root: selecting a project reveals Branches (no Users — CICD map)', async () => {
    mount()
    await pickRoot('Projects')
    await expectLevel('Projects')
    expectNoLevel('Branches')
    expectNoLevel('Users')

    await pickInDropdown('Projects', 'alpha/web')

    await expectLevel('Branches')
    expectNoLevel('Users')
  })

  it('Users root: shows the Users dropdown first, then Groups after a selection', async () => {
    mount()
    await pickRoot('Users')
    await expectLevel('Users')
    expectNoLevel('Groups')

    await pickInDropdown('Users', 'alice')

    await expectLevel('Groups')
  })

  it('Reset positions keeps filters and only reverts node layout', async () => {
    mount()
    await pickRoot('Groups')
    await pickInDropdown('Groups', 'alpha')
    await expectLevel('Projects')

    // The button now reverts node positions; it must not clear the filters.
    fireEvent.click(screen.getByText('Reset positions'))

    // The drill-down chain is intact after resetting position.
    await waitFor(() => expect(rowLabel('Projects')).toBeTruthy(), { timeout: 5000 })
    expect(screen.queryByText('Pick a starting point to build the map.')).toBeNull()
  })

  it('renders under the dark theme', async () => {
    document.documentElement.classList.add('dark-theme')
    mount()
    expect(await screen.findByText('RELATIONSHIPS', {}, { timeout: 5000 })).toBeInTheDocument()
    document.documentElement.classList.remove('dark-theme')
  })

  it('shows the no-groups empty state when the environment has none', async () => {
    mount({ envNamespaceId: 99999 })
    expect(await screen.findByText('No groups available for this environment.', {}, { timeout: 5000 })).toBeInTheDocument()
  })
})
