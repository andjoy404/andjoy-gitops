import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import RunnersPage from './RunnersPage'
import { GroupContext } from '../contexts/GroupContext'

// Exactly same pattern as working UserActivityPage.test.tsx
const mockFetch = vi.fn<any>()
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: mockFetch,
})

const DEFAULT_RUNNERS = [
  {
    group_id: 1,
    runner: {
      id: 101, description: 'Linux Build Runner', paused: false, is_shared: false,
      online: true, runner_type: 'instance_type', status: 'online',
      job_execution_status: 'running', tag_list: ['linux', 'docker', 'build'],
      ip_address: '192.168.1.10', projects: [], scope_name: 'All projects',
    },
    jobs: [{ id: 5001, name: 'build-app', stage: 'build', status: 'running', ref: 'main', pipeline_id: 30001, web_url: 'https://gitlab.com/j/5001' }],
  },
  {
    group_id: 1,
    runner: {
      id: 102, description: 'Windows Test Runner', paused: false, is_shared: false,
      online: true, runner_type: 'project_type', status: 'idle',
      job_execution_status: 'idle', tag_list: ['windows', 'test'],
      ip_address: '192.168.1.20', projects: [{ id: 5, name: 'My Project', path_with_namespace: 'group/my-project' }], scope_name: 'group/my-project',
    },
    jobs: [],
  },
  {
    group_id: 1,
    runner: {
      id: 103, description: 'Stale Runner', paused: true, is_shared: true,
      online: false, runner_type: 'group_type', status: 'paused',
      job_execution_status: 'paused', tag_list: ['docker'],
      ip_address: '', projects: [], scope_name: 'All runners',
    },
    jobs: [],
  },
  {
    group_id: 1,
    runner: {
      id: 104, description: '', paused: false, is_shared: false,
      online: false, runner_type: 'instance_type', status: 'offline',
      job_execution_status: 'offline', tag_list: [],
      ip_address: '10.0.0.5', projects: [], scope_name: 'All projects',
    },
    jobs: [],
  },
]

function setupFetch(runners = DEFAULT_RUNNERS) {
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes('/api/runners')) {
      return Promise.resolve({ ok: true, json: async () => runners } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
}

function setupEmpty() {
  mockFetch.mockImplementation((url: string) => {
    if (String(url).includes('/api/runners')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
}

function setupFetchError() {
  mockFetch.mockRejectedValue(new Error('Network error'))
}

const groupContextValue = () => ({
  selectedGroupId: 42,
  selectedEnvId: 99,
  setSelectedGroupId: vi.fn(),
})

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
}

function withProvider(ui: ReactElement) {
  return (
    <QueryClientProvider client={makeQc()}>
      <GroupContext.Provider value={groupContextValue()}>
        {ui}
      </GroupContext.Provider>
    </QueryClientProvider>
  )
}

function withProviderNoGroup(ui: ReactElement) {
  return (
    <QueryClientProvider client={makeQc()}>
      <GroupContext.Provider value={{ selectedGroupId: undefined, selectedEnvId: undefined, setSelectedGroupId: vi.fn() }}>
        {ui}
      </GroupContext.Provider>
    </QueryClientProvider>
  )
}

function renderPage(runners = DEFAULT_RUNNERS) {
  setupFetch(runners)
  return render(withProvider(<RunnersPage />))
}

async function setSearchField(label: string) {
  const selector = document.querySelector('[class*="searchFieldSelect"] .ant-select-selector')
  if (selector) fireEvent.mouseDown(selector)
  const option = await screen.findByRole('option', { name: label })
  fireEvent.click(option)
}

function getSearchInput() {
  return screen.getByRole('textbox', { name: /search runners/i }) as HTMLInputElement
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  document.body.removeAttribute('data-theme')
  mockFetch.mockReset()
})

describe('RunnersPage', () => {
  describe('loading state', () => {
    it('shows loading spinner when API not resolved', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))
      render(withProvider(<RunnersPage />))
      expect(screen.getByText('Analytics data is being collected in the background…')).toBeInTheDocument()
    })

    it('shows the no-groups empty state and skips the request without a selected group', async () => {
      setupFetch()
      render(withProviderNoGroup(<RunnersPage />))
      expect(await screen.findByText('No groups available for this environment.')).toBeInTheDocument()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('loaded state', () => {
    it('requests runners for the selected group', async () => {
      setupFetch()
      render(
        <QueryClientProvider client={makeQc()}>
          <GroupContext.Provider value={{ selectedGroupId: 42, selectedEnvId: 99, setSelectedGroupId: vi.fn() }}>
            <RunnersPage />
          </GroupContext.Provider>
        </QueryClientProvider>,
      )
      await screen.findByText('#101')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('group_id=42'),
        expect.any(Object),
      )
    })

    it('renders one header icon with title and refresh action under dark theme', async () => {
      document.body.setAttribute('data-theme', 'dark')
      renderPage()
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      expect(screen.getByText('RUNNERS')).toBeInTheDocument()
      expect(screen.getByText('self-hosted runner inventory')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
      document.body.removeAttribute('data-theme')
    })

    it('renders safely when optional runner arrays and strings are null', async () => {
      renderPage([{
        group_id: 1,
        runner: {
          id: 999,
          description: null,
          paused: false,
          is_shared: false,
          online: false,
          runner_type: null,
          status: null,
          job_execution_status: null,
          tag_list: null,
          ip_address: null,
          projects: null,
          scope_name: null,
        },
        jobs: null,
      }] as any)
      expect(await screen.findByText('#999')).toBeInTheDocument()
      expect(screen.getByText('unknown')).toBeInTheDocument()
    })

    it('shows runner rows when data loaded', async () => {
      renderPage()
      expect(await screen.findByText('#101')).toBeInTheDocument()
      expect(await screen.findByText('#102')).toBeInTheDocument()
    })

    it('shows runner status chips', async () => {
      renderPage()
      await screen.findByText('#101')
      const table = document.querySelector('table')
      expect(table).toBeTruthy()
      const allText = table?.textContent || ''
      expect(allText).toContain('running')
      expect(allText).toContain('idle')
    })

    it('shows runner types', async () => {
      renderPage()
      const table = await screen.findByRole('table')
      const typeCells = Array.from(table.querySelectorAll('tbody td:nth-child(2)'))
      const allText = typeCells.map(c => c.textContent || '').join(' ')
      expect(allText).toContain('instance')
      expect(allText).toContain('project')
    })

    it('shows group/project column data', async () => {
      renderPage()
      await screen.findByText('#101')
      const table = document.querySelector('table')
      const scopeCols = Array.from(table?.querySelectorAll('tbody td:nth-child(3)') || [])
      const scopes = scopeCols.map(c => c.textContent || '')
      expect(scopes).toContain('All projects')
      expect(scopes).toContain('group/my-project')
    })

    it('shows IP addresses when available', async () => {
      renderPage()
      expect(await screen.findByText('192.168.1.10')).toBeInTheDocument()
    })

    it('shows "Unavailable" when IP is missing', async () => {
      renderPage()
      expect(await screen.findByText('Unavailable')).toBeInTheDocument()
    })

    it('shows tag list for runners', async () => {
      renderPage()
      expect(await screen.findByText('linux')).toBeInTheDocument()
    })

    it('shows runner jobs', async () => {
      renderPage()
      expect(await screen.findByText('build-app · #30001')).toBeInTheDocument()
    })

    it('shows status counts in the summary bar segments', async () => {
      renderPage()
      await screen.findByText('#101')
      const bar = document.querySelector('[class*="summary-bar-segments"]')
      expect(bar).toBeTruthy()
      const segments = Array.from(bar?.querySelectorAll('span') || [])
      // Four statuses are present (running, idle, offline, paused); online/stale are absent.
      expect(segments).toHaveLength(4)
      expect(bar?.textContent).toBe('')
    })

    it('renders a proportional segmented bar with hover details', async () => {
      renderPage()
      await screen.findByText('#101')
      const bar = document.querySelector('[class*="summary-bar-segments"]')
      expect(bar).toBeTruthy()
      const segments = Array.from(bar?.querySelectorAll('span') || [])
      expect(segments).toHaveLength(4)
      expect(segments.map((s) => s.style.flexBasis)).toEqual(['25%', '25%', '25%', '25%'])
      fireEvent.mouseEnter(segments[0])
      await waitFor(() => {
        expect(document.body.textContent).toContain('running: 1 (25%)')
      })
    })
  })

  describe('field-aware search', () => {
    it('renders one search input and a field selector with All fields default', async () => {
      renderPage()
      await screen.findByRole('textbox', { name: /search runners/i })
      expect(document.querySelectorAll('[class*="runnersFilters"] input[type="text"]')).toHaveLength(1)
    })

    it('searches across every field with All fields by default', async () => {
      const runners = [
        { group_id: 1, runner: { id: 101, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: [], ip_address: '999.999.999.1', projects: [], scope_name: 'group/alpha-scope' }, jobs: [] },
        { group_id: 1, runner: { id: 102, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['alpha-tag'], ip_address: '999.999.999.2', projects: [], scope_name: 'group/beta-scope' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#101')
      const input = getSearchInput()
      // No field selected -> All fields; 'alpha' matches scope+tag across fields on both runners.
      fireEvent.change(input, { target: { value: 'alpha' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(await screen.findByText('#101')).toBeInTheDocument()
      expect(await screen.findByText('#102')).toBeInTheDocument()
    })

    it('unions multiple All-fields filters instead of requiring one runner to match both', async () => {
      const runners = [
        // Matches the docker tag only.
        { group_id: 1, runner: { id: 1, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker'], ip_address: '', projects: [], scope_name: 'grp/alpha' }, jobs: [] },
        // Matches the shell tag only.
        { group_id: 1, runner: { id: 2, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['shell'], ip_address: '', projects: [], scope_name: 'grp/beta' }, jobs: [] },
        // Matches only the group name.
        { group_id: 1, runner: { id: 3, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['other'], ip_address: '', projects: [], scope_name: 'grp/gamma' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#1')
      // Two All-fields chips: tag:docker OR tag:shell → union of #1 and #2 (no single runner has both).
      let input = getSearchInput()
      fireEvent.change(input, { target: { value: 'docker' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      input = getSearchInput()
      fireEvent.change(input, { target: { value: 'shell' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(await screen.findByText('#1')).toBeInTheDocument()
      expect(await screen.findByText('#2')).toBeInTheDocument()
      // #3 matches neither value.
      expect(screen.queryByText('#3')).not.toBeInTheDocument()
    })

    it('unions multiple values within the same field', async () => {
      const runners = [
        { group_id: 1, runner: { id: 10, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['agis-builder-docker'], ip_address: '', projects: [], scope_name: 'grp/example-org' }, jobs: [] },
        { group_id: 1, runner: { id: 11, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['agis-builder-shell'], ip_address: '', projects: [], scope_name: 'grp/example-org' }, jobs: [] },
        { group_id: 1, runner: { id: 12, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['agis-builder-ruby'], ip_address: '', projects: [], scope_name: 'grp/example-org' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#10')
      await setSearchField('Tag')
      let input = getSearchInput()
      fireEvent.change(input, { target: { value: 'agis-builder-docker' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      input = getSearchInput()
      fireEvent.change(input, { target: { value: 'agis-builder-shell' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      // tag:docker OR tag:shell → #10 and #11; #12 (ruby) is excluded.
      expect(await screen.findByText('#10')).toBeInTheDocument()
      expect(await screen.findByText('#11')).toBeInTheDocument()
      expect(screen.queryByText('#12')).not.toBeInTheDocument()
    })

    it('deduplicates runners that match several filters into a single row', async () => {
      const runners = [
        // Matches both the tag 'docker' and the group 'example-org' → must appear once.
        { group_id: 1, runner: { id: 20, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker'], ip_address: '', projects: [], scope_name: 'grp/example-org' }, jobs: [] },
        { group_id: 1, runner: { id: 21, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['shell'], ip_address: '', projects: [], scope_name: 'grp/other' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#20')
      await setSearchField('Tag')
      let input = getSearchInput()
      fireEvent.change(input, { target: { value: 'docker' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await setSearchField('Group / Project')
      input = getSearchInput()
      fireEvent.change(input, { target: { value: 'example-org' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await screen.findByText('#20')
      // Only #20 satisfies tag:docker OR shell AND group:example-org; it must render exactly once.
      const rows = Array.from(document.querySelectorAll('tbody tr'))
      const matches = rows.filter((r) => r.textContent?.includes('#20'))
      expect(matches).toHaveLength(1)
      expect(screen.queryByText('#21')).not.toBeInTheDocument()
    })

    it('clicking a suggestion creates a chip, filters results, and closes the popup', async () => {
      const runners = [
        { group_id: 1, runner: { id: 30, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker'], ip_address: '', projects: [], scope_name: 'grp/alpha' }, jobs: [] },
        { group_id: 1, runner: { id: 31, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['shell'], ip_address: '', projects: [], scope_name: 'grp/beta' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#30')
      await setSearchField('Tag')
      const input = getSearchInput()
      fireEvent.focus(input)
      // 'docker' comes from the runner tag, not browser history.
      const option = screen.getByRole('option', { name: 'docker' })
      fireEvent.click(option)
      // A chip is created for the clicked suggestion and the input cleared.
      const chips = document.querySelectorAll('span[class*="filterChip"]')
      expect(chips).toHaveLength(1)
      expect(chips[0].textContent).toContain('docker')
      expect(getSearchInput().value).toBe('')
      // Only the docker runner remains; the popup closed.
      expect(await screen.findByText('#30')).toBeInTheDocument()
      expect(screen.queryByText('#31')).not.toBeInTheDocument()
      expect(document.querySelector('[class*="suggestList"]')).not.toBeInTheDocument()
    })

    it('does not create a duplicate chip when the same suggestion is selected twice', async () => {
      const runners = [
        { group_id: 1, runner: { id: 32, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker'], ip_address: '', projects: [], scope_name: 'grp/alpha' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#32')
      await setSearchField('Tag')
      // First selection via suggestion click.
      fireEvent.focus(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: 'docker' }))
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      // Second selection of the same value via Enter must not duplicate the chip.
      fireEvent.focus(getSearchInput())
      fireEvent.change(getSearchInput(), { target: { value: 'docker' } })
      fireEvent.keyDown(getSearchInput(), { key: 'Enter' })
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
    })

    it('selects a highlighted suggestion with Enter', async () => {
      const runners = [
        { group_id: 1, runner: { id: 40, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker'], ip_address: '', projects: [], scope_name: 'grp/alpha' }, jobs: [] },
        { group_id: 1, runner: { id: 41, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['shell'], ip_address: '', projects: [], scope_name: 'grp/beta' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#40')
      await setSearchField('Tag')
      const input = getSearchInput()
      fireEvent.focus(input)
      const dockerOption = screen.getByRole('option', { name: 'docker' })
      const shellOption = screen.getByRole('option', { name: 'shell' })
      // Navigate down to the second option ('shell') and confirm with Enter.
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      expect(input.getAttribute('aria-activedescendant')).toBe(shellOption.getAttribute('id'))
      expect(input.getAttribute('aria-activedescendant')).not.toBe(dockerOption.getAttribute('id'))
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      expect(getSearchInput().value).toBe('')
      expect(await screen.findByText('#41')).toBeInTheDocument()
      expect(screen.queryByText('#40')).not.toBeInTheDocument()
      expect(dockerOption).not.toBeInTheDocument()
    })

    it('reopens the suggestion list when typing after a selection', async () => {
      const runners = [
        { group_id: 1, runner: { id: 50, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker', 'shell'], ip_address: '', projects: [], scope_name: 'grp/alpha' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#50')
      await setSearchField('Tag')
      fireEvent.focus(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: 'docker' }))
      // After selection: chip kept, input cleared, popup closed.
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      expect(getSearchInput().value).toBe('')
      expect(document.querySelector('[class*="suggestList"]')).not.toBeInTheDocument()
      // Typing the next keyword must reopen the list immediately.
      fireEvent.change(getSearchInput(), { target: { value: 'sh' } })
      expect(await screen.findByRole('option', { name: 'shell' })).toBeInTheDocument()
      // The already-chipped value is not offered again.
      expect(screen.queryByRole('option', { name: 'docker' })).not.toBeInTheDocument()
    })

    it('reopens the suggestion list when clicking the empty input after a selection', async () => {
      const runners = [
        { group_id: 1, runner: { id: 51, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker', 'shell', 'ruby'], ip_address: '', projects: [], scope_name: 'grp/alpha' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#51')
      await setSearchField('Tag')
      fireEvent.click(getSearchInput())
      // First mouse selection creates a chip.
      fireEvent.click(screen.getByRole('option', { name: 'docker' }))
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      // Input is empty and still focused; the popup is closed.
      expect(getSearchInput().value).toBe('')
      expect(document.querySelector('[class*="suggestList"]')).not.toBeInTheDocument()
      // Clicking the (already-focused, empty) input reopens the full list.
      fireEvent.click(getSearchInput())
      expect(await screen.findByRole('option', { name: 'shell' })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'ruby' })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: 'docker' })).not.toBeInTheDocument()
    })

    it('consecutive mouse selections produce three chips', async () => {
      const runners = [
        { group_id: 1, runner: { id: 52, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['alpha', 'beta', 'gamma'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#52')
      await setSearchField('Tag')
      fireEvent.click(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: 'alpha' }))
      fireEvent.click(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: 'beta' }))
      fireEvent.click(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: 'gamma' }))
      const chipTexts = Array.from(document.querySelectorAll('span[class*="filterChip"]')).map((c) => c.textContent ?? '')
      expect(chipTexts).toHaveLength(3)
      expect(chipTexts.some((t) => t.includes('alpha'))).toBe(true)
      expect(chipTexts.some((t) => t.includes('beta'))).toBe(true)
      expect(chipTexts.some((t) => t.includes('gamma'))).toBe(true)
    })

    it('Status appears directly below All fields in the search-kind dropdown', async () => {
      renderPage()
      await screen.findByText('#101')
      const selector = document.querySelector('[class*="searchFieldSelect"] .ant-select-selector')
      if (selector) fireEvent.mouseDown(selector)
      const options = await waitFor(() => {
        const opts = Array.from(document.querySelectorAll('.ant-select-dropdown .ant-select-item-option'))
        expect(opts.length).toBe(7)
        return opts
      })
      expect(options.map((o) => (o.textContent ?? '').trim())).toEqual(
        ['All fields', 'Status', 'Group / Project', 'Number', 'IP Address', 'Job', 'Tag'],
      )
    })

    it('Number search still matches runner id and description using existing underlying data', async () => {
      const runners = [
        { group_id: 1, runner: { id: 2001, description: 'builder-a', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: [], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
        { group_id: 1, runner: { id: 2002, description: 'builder-b', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: [], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#2001')
      // The dropdown now labels this kind "Number".
      await setSearchField('Number')
      // The placeholder reflects the new label (lowercased).
      expect((getSearchInput() as HTMLInputElement).placeholder).toBe('Filter number...')
      // id 2001 is suggested and creates a chip from the underlying runner id.
      fireEvent.click(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: '2001' }))
      expect(await screen.findByText('#2001')).toBeInTheDocument()
      expect(screen.queryByText('#2002')).not.toBeInTheDocument()
      // Description 'builder-b' is equally matchable; same-field chips OR, so both
      // runner id and description selections union the results.
      fireEvent.click(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: 'builder-b' }))
      expect(await screen.findByText('#2002')).toBeInTheDocument()
      expect(await screen.findByText('#2001')).toBeInTheDocument()
    })

    it('selects two suggestions consecutively by mouse', async () => {
      const runners = [
        { group_id: 1, runner: { id: 60, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['alpha', 'beta', 'gamma'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#60')
      await setSearchField('Tag')
      fireEvent.focus(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: 'alpha' }))
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      // Reopen and pick the next value with the mouse.
      fireEvent.change(getSearchInput(), { target: { value: 'beta' } })
      fireEvent.click(await screen.findByRole('option', { name: 'beta' }))
      const chips = Array.from(document.querySelectorAll('span[class*="filterChip"]')).map((c) => c.textContent ?? '')
      expect(chips).toHaveLength(2)
      expect(chips.some((t) => t.includes('alpha'))).toBe(true)
      expect(chips.some((t) => t.includes('beta'))).toBe(true)
    })

    it('selects two suggestions consecutively by keyboard', async () => {
      const runners = [
        { group_id: 1, runner: { id: 70, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['alpha', 'beta'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#70')
      await setSearchField('Tag')
      const input = getSearchInput()
      fireEvent.focus(input)
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      // Reopen, narrow to the remaining value, and confirm with Enter.
      fireEvent.change(getSearchInput(), { target: { value: 'beta' } })
      fireEvent.keyDown(getSearchInput(), { key: 'ArrowDown' })
      fireEvent.keyDown(getSearchInput(), { key: 'Enter' })
      const chips = Array.from(document.querySelectorAll('span[class*="filterChip"]')).map((c) => c.textContent ?? '')
      expect(chips).toHaveLength(2)
      expect(chips.some((t) => t.includes('alpha'))).toBe(true)
      expect(chips.some((t) => t.includes('beta'))).toBe(true)
    })

    it('excludes a value already in a chip but keeps other options', async () => {
      const runners = [
        { group_id: 1, runner: { id: 80, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['alpha', 'beta', 'gamma'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#80')
      await setSearchField('Tag')
      fireEvent.focus(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: 'alpha' }))
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      // Reopen the full list; the chipped value must not be offered again.
      fireEvent.focus(getSearchInput())
      const options = Array.from(document.querySelectorAll('#runner-search-listbox [role="option"]')).map((o) => (o.textContent ?? '').trim())
      expect(options).toContain('beta')
      expect(options).toContain('gamma')
      expect(options).not.toContain('alpha')
    })

    it('reopens suggestions after Escape and after blur', async () => {
      const runners = [
        { group_id: 1, runner: { id: 90, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker', 'other'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#90')
      await setSearchField('Tag')
      const input = getSearchInput()
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'do' } })
      expect(document.querySelector('[class*="suggestList"]')).toBeInTheDocument()
      // Escape closes the popup and clears the query.
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(getSearchInput().value).toBe('')
      expect(document.querySelector('[class*="suggestList"]')).not.toBeInTheDocument()
      // Typing again reopens it.
      fireEvent.change(input, { target: { value: 'do' } })
      expect(await screen.findByRole('option', { name: 'docker' })).toBeInTheDocument()
      // Blurring closes it; focusing and typing again reopens it.
      fireEvent.blur(input)
      expect(document.querySelector('[class*="suggestList"]')).not.toBeInTheDocument()
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'do' } })
      expect(await screen.findByRole('option', { name: 'docker' })).toBeInTheDocument()
    })

    it('recomputes suggestions and resets the highlight when the field changes', async () => {
      renderPage()
      await screen.findByText('#101')
      const input = getSearchInput()
      fireEvent.focus(input)
      // With "All fields" a tag value is offered and a row is highlighted.
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      expect(input).toHaveAttribute('aria-activedescendant')
      // Switching to IP Address recomputes the list and clears the highlight.
      await setSearchField('IP Address')
      expect(input).not.toHaveAttribute('aria-activedescendant')
      const options = Array.from(document.querySelectorAll('#runner-search-listbox [role="option"]')).map((o) => (o.textContent ?? '').trim())
      expect(options).toContain('192.168.1.10')
      expect(options).not.toContain('docker')
    })

    describe('status filtering (integrated into the field-aware search)', () => {
      const statusRunners = [
        { group_id: 1, runner: { id: 601, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['alpha'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
        { group_id: 1, runner: { id: 602, description: '', paused: true, is_shared: false, online: false, runner_type: 'group_type', status: 'paused', job_execution_status: 'idle', tag_list: ['alpha'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
        { group_id: 1, runner: { id: 603, description: '', paused: false, is_shared: false, online: false, runner_type: 'group_type', status: 'offline', job_execution_status: 'stopped', tag_list: ['beta'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
      ]

      it('no longer renders the separate "Filter by status" row', async () => {
        renderPage(statusRunners)
        await screen.findByText('#601')
        expect(screen.queryByText('Filter by status')).not.toBeInTheDocument()
        expect(document.querySelector('[class*="statusFilter"]')).not.toBeInTheDocument()
      })

      it('offers a Status option in the search-kind selector', async () => {
        renderPage(statusRunners)
        await screen.findByText('#601')
        const selector = document.querySelector('[class*="searchFieldSelect"] .ant-select-selector')
        if (selector) fireEvent.mouseDown(selector)
        const fieldOptions = await screen.findAllByRole('option')
        const labels = fieldOptions.map((o) => (o.textContent ?? '').trim())
        expect(labels).toContain('Status')
        expect(labels).toContain('All fields')
        expect(labels).toContain('Group / Project')
        expect(labels).toContain('Number')
        expect(labels).toContain('IP Address')
        expect(labels).toContain('Job')
        expect(labels).toContain('Tag')
      })

      it('offers only statuses that are present in the loaded dataset', async () => {
        renderPage(statusRunners)
        await screen.findByText('#601')
        await setSearchField('Status')
        fireEvent.focus(getSearchInput())
        const options = Array.from(document.querySelectorAll('#runner-search-listbox [role="option"]')).map((o) => (o.textContent ?? '').trim())
        expect(options).toContain('idle')
        expect(options).toContain('paused')
        expect(options).toContain('offline')
        // These statuses are absent from the dataset and must not be suggested.
        expect(options).not.toContain('running')
        expect(options).not.toContain('stale')
      })

      it('filters with a single selected status', async () => {
        renderPage(statusRunners)
        await screen.findByText('#601')
        await setSearchField('Status')
        const input = getSearchInput()
        fireEvent.focus(input)
        fireEvent.click(screen.getByRole('option', { name: 'paused' }))
        const chips = document.querySelectorAll('span[class*="filterChip"]')
        expect(chips).toHaveLength(1)
        expect(chips[0].textContent).toContain('paused')
        expect(await screen.findByText('#602')).toBeInTheDocument()
        expect(screen.queryByText('#601')).not.toBeInTheDocument()
        expect(screen.queryByText('#603')).not.toBeInTheDocument()
      })

      it('unions multiple selected statuses (OR within the status field)', async () => {
        renderPage(statusRunners)
        await screen.findByText('#601')
        await setSearchField('Status')
        fireEvent.focus(getSearchInput())
        fireEvent.click(screen.getByRole('option', { name: 'idle' }))
        expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
        fireEvent.change(getSearchInput(), { target: { value: 'paused' } })
        fireEvent.click(await screen.findByRole('option', { name: 'paused' }))
        expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(2)
        // idle OR paused → #601 and #602; #603 (offline) excluded.
        expect(await screen.findByText('#601')).toBeInTheDocument()
        expect(await screen.findByText('#602')).toBeInTheDocument()
        expect(screen.queryByText('#603')).not.toBeInTheDocument()
      })

      it('uses AND when a status chip is combined with another field', async () => {
        const runners = [
          { group_id: 1, runner: { id: 701, description: '', paused: true, is_shared: false, online: false, runner_type: 'group_type', status: 'paused', job_execution_status: 'idle', tag_list: ['alpha'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
          { group_id: 1, runner: { id: 702, description: '', paused: true, is_shared: false, online: false, runner_type: 'group_type', status: 'paused', job_execution_status: 'idle', tag_list: ['beta'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
          { group_id: 1, runner: { id: 703, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['alpha'], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
        ]
        renderPage(runners)
        await screen.findByText('#701')
        await setSearchField('Status')
        fireEvent.focus(getSearchInput())
        fireEvent.click(screen.getByRole('option', { name: 'paused' }))
        await setSearchField('Tag')
        fireEvent.change(getSearchInput(), { target: { value: 'alpha' } })
        fireEvent.keyDown(getSearchInput(), { key: 'Enter' })
        // status:paused AND tag:alpha → only #701.
        expect(await screen.findByText('#701')).toBeInTheDocument()
        expect(screen.queryByText('#702')).not.toBeInTheDocument()
        expect(screen.queryByText('#703')).not.toBeInTheDocument()
      })

      it('removes a status chip and clears all filters', async () => {
        renderPage(statusRunners)
        await screen.findByText('#601')
        await setSearchField('Status')
        fireEvent.focus(getSearchInput())
        fireEvent.click(screen.getByRole('option', { name: 'paused' }))
        expect(screen.queryByText('#601')).not.toBeInTheDocument()
        // Removing the status chip restores all rows.
        fireEvent.click(screen.getByRole('button', { name: 'Remove filter paused' }))
        expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(0)
        expect(await screen.findByText('#601')).toBeInTheDocument()
        // A fresh chip can then be cleared with "Clear all".
        fireEvent.focus(getSearchInput())
        fireEvent.click(screen.getByRole('option', { name: 'offline' }))
        expect(screen.queryByText('#601')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
        expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(0)
        expect(await screen.findByText('#601')).toBeInTheDocument()
      })
    })

    it.each([
      ['Group / Project', 'agis', '#1001'],
      ['Number', 'solo-runner', '#1002'],
      ['IP Address', '2.4.0.1', '#1003'],
      ['Job', 'build-api', '#1004'],
      ['Tag', 'docker', '#1005'],
    ])('filters on the "%s" field only', async (label, value, expectedId) => {
      const runners = [
        { group_id: 1, runner: { id: 1001, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker'], ip_address: '', projects: [], scope_name: 'group/example-org/agis' }, jobs: [] },
        { group_id: 1, runner: { id: 1002, description: 'solo-runner', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: [], ip_address: '', projects: [], scope_name: 'no-match' }, jobs: [] },
        { group_id: 1, runner: { id: 1003, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: [], ip_address: '2.4.0.1', projects: [], scope_name: 'no-match' }, jobs: [] },
        { group_id: 1, runner: { id: 1004, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: [], ip_address: '', projects: [], scope_name: 'no-match' }, jobs: [{ id: 1, name: 'build-api', stage: 'ci', status: 'running', ref: 'main', pipeline_id: 900, web_url: 'https://x' }] },
        { group_id: 1, runner: { id: 1005, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker'], ip_address: '', projects: [], scope_name: 'no-match' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#1001')
      await setSearchField(label)
      const input = getSearchInput()
      fireEvent.change(input, { target: { value } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(await screen.findByText(expectedId)).toBeInTheDocument()
    })

    it('applies multiple filters with AND', async () => {
      const runners = [
        { group_id: 1, runner: { id: 1, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker'], ip_address: '10.0.0.1', projects: [], scope_name: 'example-org/agis' }, jobs: [] },
        { group_id: 1, runner: { id: 2, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: ['docker'], ip_address: '10.0.0.2', projects: [], scope_name: 'example-org/agis' }, jobs: [] },
        { group_id: 1, runner: { id: 3, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: [], ip_address: '10.0.0.1', projects: [], scope_name: 'example-org/agis' }, jobs: [] },
      ]
      renderPage(runners)
      await screen.findByText('#1')
      await setSearchField('Group / Project')
      let input = getSearchInput()
      fireEvent.change(input, { target: { value: 'agis' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await setSearchField('Tag')
      input = getSearchInput()
      fireEvent.change(input, { target: { value: 'docker' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(await screen.findByText('#1')).toBeInTheDocument()
      expect(await screen.findByText('#2')).toBeInTheDocument()
      expect(screen.queryByText('#3')).not.toBeInTheDocument()
    })

    it('only shows values from the currently loaded runner data (all fields)', async () => {
      renderPage()
      await screen.findByText('#101')
      const input = getSearchInput()
      fireEvent.focus(input)
      const suggestions = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).map((o) => (o.textContent ?? '').trim())
      expect(suggestions).toContain('192.168.1.10')
      expect(suggestions).toContain('101')
      // '101' is from the runner id; 'build-app' from job; 'docker' from tag; '192.168.1.10' from ip.
      expect(suggestions).toContain('build-app')
      expect(suggestions).toContain('docker')
      // A value not present in the dataset must not appear.
      expect(suggestions).not.toContain('does-not-exist')
    })

    it('offers field-scoped suggestions only from matching fields', async () => {
      renderPage()
      await screen.findByText('#101')
      await setSearchField('IP Address')
      fireEvent.focus(getSearchInput())
      const suggestions = Array.from(document.querySelectorAll('[role="listbox"] [role="option"]')).map((o) => (o.textContent ?? '').trim())
      expect(suggestions).toContain('192.168.1.10')
      // Non-IP values should not appear when scoped to IP Address.
      expect(suggestions).not.toContain('docker')
    })

    it('removes an individual chip and clears all', async () => {
      renderPage()
      await screen.findByText('#101')
      const input = getSearchInput()
      fireEvent.change(input, { target: { value: 'linux' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.change(getSearchInput(), { target: { value: 'docker' } })
      fireEvent.keyDown(getSearchInput(), { key: 'Enter' })
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(2)
      fireEvent.click(screen.getByRole('button', { name: 'Remove filter linux' }))
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(0)
    })

    it('searches across the full dataset, not just the visible page', async () => {
      // 11 runners; the one with a unique tag (#1110) sits past page 1 (default page size 10).
      const runners = Array.from({ length: 11 }, (_, i) => {
        const id = 1100 + i
        const isTarget = id === 1110
        return {
          group_id: 1,
          runner: {
            id, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type',
            status: 'online', job_execution_status: 'idle', tag_list: ['common', ...(isTarget ? ['rare-tag-25'] : [])],
            ip_address: `10.11.0.${id % 250}`, projects: [], scope_name: 'All projects',
          },
          jobs: [],
        }
      })
      renderPage(runners)
      await screen.findByText('#1100')
      // The target is on page 2, so page 1 shows none of its rows.
      expect(screen.queryByText('#1110')).not.toBeInTheDocument()
      // Filtering must scan the whole dataset, not just the visible page.
      const input = getSearchInput()
      fireEvent.change(input, { target: { value: 'rare-tag-25' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(await screen.findByText('#1110')).toBeInTheDocument()
      expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument()
    })

    it('keeps filters across Refresh and page navigation', async () => {
      const runners = Array.from({ length: 20 }, (_, i) => ({
        group_id: 1,
        runner: {
          id: 2000 + i, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type',
          status: 'online', job_execution_status: 'idle', tag_list: ['stable'], ip_address: `10.20.0.${i}`,
          projects: [], scope_name: 'All projects',
        },
        jobs: [],
      }))
      renderPage(runners)
      await screen.findByText('#2000')
      const input = getSearchInput()
      fireEvent.change(input, { target: { value: 'stable' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      // All 20 still match 'stable'; two pages of 10. Move to page 2.
      fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
      expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument()
      // Refresh must keep the filter applied.
      fireEvent.click(screen.getByText('Refresh'))
      await waitFor(() => {
        expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument()
      })
      expect(screen.queryByText(/No runners match/i)).not.toBeInTheDocument()
    })

    it('creates a filter on Enter and clears the draft', async () => {
      renderPage()
      await screen.findByText('#101')
      const input = getSearchInput()
      fireEvent.change(input, { target: { value: 'linux' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(input.value).toBe('')
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
    })

    it('clears the draft field on Escape without adding a filter', async () => {
      renderPage()
      await screen.findByText('#101')
      const input = getSearchInput()
      fireEvent.change(input, { target: { value: 'partial' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(input.value).toBe('')
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(0)
    })

    it('disables browser autocomplete on the search input', async () => {
      renderPage()
      await screen.findByText('#101')
      const input = getSearchInput()
      expect(input.getAttribute('autocomplete')).toBe('off')
    })
  })

  describe('pagination', () => {
    it('renders pagination controls', async () => {
      renderPage()
      expect(await screen.findByText(/Page \d+ of \d+/)).toBeInTheDocument()
    })
  })

  describe('refresh button', () => {
    it('refresh button exists', async () => {
      renderPage()
      expect(await screen.findByText('Refresh')).toBeInTheDocument()
    })

    it('preserves status chips across a Refresh re-fetch', async () => {
      const runners = [
        { group_id: 1, runner: { id: 801, description: '', paused: false, is_shared: false, online: true, runner_type: 'group_type', status: 'online', job_execution_status: 'idle', tag_list: [], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
        { group_id: 1, runner: { id: 802, description: '', paused: true, is_shared: false, online: false, runner_type: 'group_type', status: 'paused', job_execution_status: 'idle', tag_list: [], ip_address: '', projects: [], scope_name: 'grp/x' }, jobs: [] },
      ]
      const qc = makeQc()
      setupFetch(runners)
      render(
        <QueryClientProvider client={qc}>
          <GroupContext.Provider value={groupContextValue()}>
            <RunnersPage />
          </GroupContext.Provider>
        </QueryClientProvider>,
      )
      await screen.findByText('#801')
      await setSearchField('Status')
      fireEvent.focus(getSearchInput())
      fireEvent.click(screen.getByRole('option', { name: 'paused' }))
      expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      expect(screen.queryByText('#801')).not.toBeInTheDocument()
      // Re-fetch the same data; the chip must survive and keep filtering.
      fireEvent.click(screen.getByText('Refresh'))
      await waitFor(() => {
        expect(document.querySelectorAll('span[class*="filterChip"]')).toHaveLength(1)
      })
      expect(await screen.findByText('#802')).toBeInTheDocument()
      expect(screen.queryByText('#801')).not.toBeInTheDocument()
      expect(screen.getAllByText('paused').length).toBeGreaterThan(0)
    })
  })

  describe('paused-state regression', () => {
    function entry(id: number, paused: boolean) {
      return {
        group_id: 42,
        runner: {
          id, description: 'builder-runner', paused, is_shared: false,
          online: true, runner_type: 'group_type', status: paused ? 'paused' : 'online',
          job_execution_status: 'idle', tag_list: ['gitlab'],
          ip_address: '10.0.0.50', projects: [], scope_name: 'All projects',
        },
        jobs: [],
      }
    }

    it('classifies a live runner as idle, then reclassifies it as paused after a Refresh re-fetch', async () => {
      let current = [entry(201, false)]
      mockFetch.mockImplementation((url: string) => {
        if (String(url).includes('/api/runners')) {
          return Promise.resolve({ ok: true, json: async () => current } as Response)
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      })
      const qc = makeQc()
      render(
        <QueryClientProvider client={qc}>
          <GroupContext.Provider value={groupContextValue()}>
            <RunnersPage />
          </GroupContext.Provider>
        </QueryClientProvider>,
      )

      // Initial fetch: paused=false → classified idle.
      expect(await screen.findByText('#201')).toBeInTheDocument()
      let statusCell = Array.from(document.querySelectorAll('td')).find((td) => td.textContent === 'idle')
      expect(statusCell).toBeTruthy()
      expect(document.querySelector('[class*="summary-bar-segments"]')).toBeTruthy()

      // API now reports the same runner as paused. Refresh must re-fetch and
      // invalidate the cached snapshot, flipping the status to paused.
      current = [entry(201, true)]
      fireEvent.click(screen.getByText('Refresh'))

      await waitFor(() => {
        const cell = Array.from(document.querySelectorAll('td')).find((td) => td.textContent === 'paused')
        expect(cell).toBeTruthy()
      })

      // The row is now paused and no longer idle.
      expect(Array.from(document.querySelectorAll('td')).some((td) => td.textContent === 'idle')).toBe(false)
      expect(document.querySelector('[class*="summary-bar-segments"]')).toBeTruthy()
      // And the summary total was re-derived from the refreshed data.
      expect(Array.from(document.querySelectorAll('tbody tr')).length).toBe(1)
    })
  })

  describe('empty state', () => {
    it('shows empty state when no runners', async () => {
      renderPage([])
      expect(await screen.findByText(/No runner data available/)).toBeInTheDocument()
      const bar = document.querySelector('[class*="summary-bar-segments"]')
      expect(bar?.querySelectorAll('span').length).toBe(0)
    })
  })

  describe('filtered empty state', () => {
    it('shows no match message when filters eliminate results', async () => {
      renderPage()
      await screen.findByText('#101')
      const input = getSearchInput()
      fireEvent.change(input, { target: { value: 'zzzzz' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(await screen.findByText(/No runners match/i)).toBeInTheDocument()
    })
  })

  describe('runner table structure', () => {
    it('renders table with correct header columns', async () => {
      renderPage()
      const table = await screen.findByRole('table')
      const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.textContent || '')
      expect(headers).toContain('Number')
      expect(headers).toContain('Status')
      expect(headers).toContain('Type')
      expect(headers).toContain('Group / Project')
      expect(headers).toContain('Address')
      expect(headers).toContain('Tags')
      expect(headers).toContain('Jobs')
    })

    it('has runner table wrapper', async () => {
      renderPage()
      await waitFor(() => {
        expect(document.querySelector('[class*="runnerTableWrapper"]')).toBeTruthy()
      })
    })
  })

  describe('theme support', () => {
    it('renders cleanly in light theme', async () => {
      document.body.removeAttribute('data-theme')
      renderPage()
      expect(await screen.findByText('#101')).toBeInTheDocument()
    })

    it('renders cleanly in dark theme', async () => {
      document.body.setAttribute('data-theme', 'dark')
      renderPage()
      expect(await screen.findByText('#101')).toBeInTheDocument()
      document.body.removeAttribute('data-theme')
    })
  })
})
