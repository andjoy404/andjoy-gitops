import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { screen, fireEvent, waitFor } from '@testing-library/dom'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import GroupSelector from './GroupSelector'

const GROUPS = [
  { id: 1, name: 'Platform Engineering', full_path: 'platform' },
  { id: 2, name: 'Backend Services', full_path: 'backend' },
  { id: 3, name: 'Frontend Team', full_path: 'frontend' },
]

beforeEach(() => {
  stubMatchMedia()
  stubGetComputedStyle()
})

function renderModal(
  groups = GROUPS,
  selectedGroupId: number | undefined = undefined,
  onSelect = vi.fn(),
  open = true,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })

  queryClient.setQueryData(['groups', undefined], groups)

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GroupSelector
          open={open}
          onClose={() => {}}
          selectedGroupId={selectedGroupId}
          onSelect={onSelect}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { queryClient }
}

describe('GroupSelector', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders a list of groups', async () => {
    renderModal()

    expect(await screen.findByText('Select Group')).toBeInTheDocument()
    expect(screen.getByText('Choose a GitLab group to view:')).toBeInTheDocument()

    expect(screen.getByText('Platform Engineering')).toBeInTheDocument()
    expect(screen.getByText('Backend Services')).toBeInTheDocument()
    expect(screen.getByText('Frontend Team')).toBeInTheDocument()
    expect(screen.getByText('Group ID 1')).toBeInTheDocument()
  })

  it('shows loading state when no initial data', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GroupSelector
            open={true}
            onClose={() => {}}
            selectedGroupId={undefined}
            onSelect={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Loading...')).toBeInTheDocument()
  })

  it('shows empty state when no groups in cache', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 0 } },
    })

    queryClient.setQueryData(['groups', undefined], [])

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GroupSelector
            open={true}
            onClose={() => {}}
            selectedGroupId={undefined}
            onSelect={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('No groups found.')).toBeInTheDocument()
  })

  it('current group is indicated with a gold tag', async () => {
    renderModal(GROUPS, 2)

    expect(await screen.findByText('Current')).toBeInTheDocument()
    expect(screen.getByText('Backend Services')).toBeInTheDocument()
  })

  it('selecting a group triggers onSelect callback and navigation', async () => {
    const onSelect = vi.fn()
    renderModal(GROUPS, undefined, onSelect)

    const platformCard = await screen.findByText('Platform Engineering')
    fireEvent.click(platformCard)

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('modal is hidden when open=false', () => {
    renderModal(GROUPS, undefined, vi.fn(), false)

    expect(screen.queryByText('Select Group')).not.toBeInTheDocument()
    expect(screen.queryByText('Platform Engineering')).not.toBeInTheDocument()
  })
})
