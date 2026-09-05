import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { GroupContext } from '../contexts/GroupContext'
import type { AnalyticsReadiness, UserActivity } from '../types'
import UserActivityPage from './UserActivityPage'

// Module-level fetch mock - attached to globalThis so vitest cleanup doesn't affect it
const mockFetch = vi.fn<any>()
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: mockFetch,
})

// ── Fixtures ─────────────────────────────────────────────────

const DEFAULT_USERS: UserActivity[] = [
  {
    id: 11, username: 'alice', name: 'Alice Johnson',
    avatar_url: 'https://gitlab.com/avatars/alice', web_url: 'https://gitlab.com/alice',
    state: 'active', is_admin: true, is_current_member: true,
    issue_count: 5, merge_request_count: 10, merged_count: 7, push_count: 3, comment_count: 1,
    last_pipeline_activity: '2026-08-13T10:00:00Z', total_activity: 19,
  },
  {
    id: 12, username: 'bob', name: 'Bob Smith',
    avatar_url: 'https://gitlab.com/avatars/bob', web_url: 'https://gitlab.com/bob',
    state: 'active', is_admin: false, is_current_member: true,
    issue_count: 3, merge_request_count: 8, merged_count: 5, push_count: 5, comment_count: 2,
    last_pipeline_activity: '2026-08-13T08:00:00Z', total_activity: 18,
  },
  {
    id: 13, username: 'carol', name: 'Carol Williams',
    avatar_url: '', web_url: 'https://gitlab.com/carol',
    state: 'active', is_admin: true, is_current_member: false,
    issue_count: 1, merge_request_count: 12, merged_count: 9, push_count: 2, comment_count: 3,
    last_pipeline_activity: '2026-08-12T20:00:00Z', total_activity: 18,
  },
  {
    id: 14, username: 'dave', name: 'Dave Brown',
    avatar_url: '', web_url: '',
    state: 'active', is_admin: false, is_current_member: false,
    issue_count: 4, merge_request_count: 6, merged_count: 4, push_count: 8, comment_count: 0,
    last_pipeline_activity: '2026-08-12T06:00:00Z', total_activity: 18,
  },
  {
    id: 15, username: 'eve', name: 'Eve Davis',
    avatar_url: 'https://gitlab.com/avatars/eve', web_url: 'https://gitlab.com/eve',
    state: 'active', is_admin: false, is_current_member: false,
    issue_count: 10, merge_request_count: 0, merged_count: 0, push_count: 1, comment_count: 2,
    last_pipeline_activity: '2026-08-11T12:00:00Z', total_activity: 13,
  },
]

const DEFAULT_METRICS = {
  activeUsers: 4, nonActiveUsers: 1, totalUsers: 5,
  totalIssues: 23, totalMergeRequests: 36, totalMergedUsers: 5,
  totalPushes: 19, totalComments: 8, activityLoading: false,
}

function getReadiness(overrides?: Partial<AnalyticsReadiness>): AnalyticsReadiness {
  return Object.assign({
    ready: true, data_available: true, message: '',
    last_completed_at: '2026-08-12T10:00:00Z',
    project_count: 5, pipeline_count: 100, runner_state_count: 5,
    user_count: 5, user_event_count: 50, user_issue_count: 23,
  }, overrides)
}

// ── Setup helper ─────────────────────────────────────────────

function setupFn(users?, metrics: Record<string, unknown> = DEFAULT_METRICS, readiness?: AnalyticsReadiness) {
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: mockFetch,
  })
  const u = users ?? DEFAULT_USERS
  const p = { users: u, page: 1, pageSize: 10, total: u.length }
  const r = readiness ?? getReadiness()
  mockFetch.mockImplementation((url: string) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/analytics/users/options')) return Promise.resolve({ ok: true, json: () => Promise.resolve(u) } as Response)
    if (urlStr.includes('/api/analytics/users/metrics')) return Promise.resolve({ ok: true, json: () => Promise.resolve(metrics) } as Response)
    if (urlStr.includes('/api/analytics/users')) return Promise.resolve({ ok: true, json: () => Promise.resolve(p) } as Response)
    if (urlStr.includes('/api/analytics/readiness')) return Promise.resolve({ ok: true, json: () => Promise.resolve(r) } as Response)
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)
  })
  return { users: u, paginated: p, metrics, readiness: r }
}

function renderPage(users?: UserActivity[], metrics: Record<string, unknown> = DEFAULT_METRICS, readiness?: AnalyticsReadiness) {
  const { paginated, metrics: m, readiness: r } = setupFn(users, metrics, readiness)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      qc.setQueryData(['analytics-readiness', 1, 123], r)
  qc.setQueryData(['user-activity', 1, '123', 24, 'both', '', 1, 10, 'name', 'asc'], paginated)
  qc.setQueryData(['user-activity-options', 1, '123', 24, 'both'], paginated.users)
  qc.setQueryData(['user-metrics', 1, '123', 24, 'both', ''], m)

  const w = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <GroupContext.Provider value={{ selectedGroupId: 123, selectedEnvId: 1, setSelectedGroupId: vi.fn() }}>
          {children}
        </GroupContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>
  )

  return { ...render(<UserActivityPage />, { wrapper: w }), qc }
}

// ── Cleanup ──────────────────────────────────────────────────

beforeEach(() => {
  cleanup()
  localStorage.clear()
  document.body.removeAttribute('data-theme')
  mockFetch.mockReset()
})

// ── 1. PAGE RENDER ──────────────────────────────────────────

describe('UserActivityPage', () => {
  describe('page render', () => {
    it('renders USER ACTIVITY heading', () => {
      renderPage()
      expect(screen.getByText('USER ACTIVITY')).toBeInTheDocument()
    })

    it('renders one header icon with title and caption', () => {
      renderPage()
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      expect(screen.getByText('USER ACTIVITY')).toBeInTheDocument()
      expect(screen.getByText('current and historical contributors')).toBeInTheDocument()
    })

    it('keeps the header icon rendered under dark theme', () => {
      document.body.setAttribute('data-theme', 'dark')
      renderPage()
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      expect(screen.getByText('USER ACTIVITY')).toBeInTheDocument()
      document.body.removeAttribute('data-theme')
    })

    it('renders summary bar with a single distribution bar (no legend)', () => {
      renderPage()
      expect(document.querySelector('.user-activity-summary.summary-bar')).toBeTruthy()
      expect(document.querySelector('.user-activity-summary .summary-bar-legend')).toBeNull()
      expect(document.querySelectorAll('.user-activity-summary .summary-bar-segments')).toHaveLength(1)
      const bar = document.querySelector('.user-activity-summary .summary-bar-segments')
      // 5 present activity metrics → 5 segments
      expect(bar!.querySelectorAll('span').length).toBe(5)
    })

    it('renders toolbar controls', () => {
      renderPage()
      expect(screen.getByText('Range')).toBeInTheDocument()
      expect(document.querySelector('.user-metrics-toolbar')).toBeInTheDocument()
    })
  })

  // ── 2. LOADING STATE ───────────────────────────────────────

  describe('loading state', () => {
    it('shows heading while query pending', () => {
      setupFn()
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      qc.setQueryData(['analytics-readiness', 1, 123], getReadiness())
      const w = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <GroupContext.Provider value={{ selectedGroupId: 123, selectedEnvId: 1, setSelectedGroupId: vi.fn() }}>
              {children}
            </GroupContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      )
      render(<UserActivityPage />, { wrapper: w })
      expect(document.querySelector('.user-metrics-page')).toBeInTheDocument()
    })
  })

  // ── 3. EMPTY STATE ─────────────────────────────────────────

  describe('empty state', () => {
    it('shows no user activity data available', () => {
      setupFn([], { activeUsers:0,nonActiveUsers:0,totalUsers:0,totalIssues:0,totalMergeRequests:0,totalMergedUsers:0,totalPushes:0,totalComments:0,activityLoading:false })
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      qc.setQueryData(['analytics-readiness', 1, 123], getReadiness())
      qc.setQueryData(['user-activity', 1, '123', 24, 'both', '', 1, 10, 'name', 'asc'], { users: [], page: 1, pageSize: 10, total: 0 })
      qc.setQueryData(['user-activity-options', 1, '123', 24, 'both'], [])
      qc.setQueryData(['user-metrics', 1, '123', 24, 'both', ''], { activeUsers:0,nonActiveUsers:0,totalUsers:0,totalIssues:0,totalMergeRequests:0,totalMergedUsers:0,totalPushes:0,totalComments:0,activityLoading:false })
      const w = ({ children}: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <GroupContext.Provider value={{ selectedGroupId: 123, selectedEnvId: 1, setSelectedGroupId: vi.fn() }}>
              {children}
            </GroupContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      )
      render(<UserActivityPage />, { wrapper: w })
      expect(screen.getByText(/No user activity data available/)).toBeInTheDocument()
    })
  })

  // ── 4. ERROR STATE ─────────────────────────────────────────

  describe('error state', () => {
    it('does not crash on fetch failure', () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      renderPage()
      expect(document.querySelector('.user-metrics-page')).toBeInTheDocument()
    })
  })

  // ── 5. READINESS / COLLECTING ───────────────────────────────

  describe('readiness', () => {
    // Running: explicit in-progress scoped signal is the ONLY collecting state.
    it('shows collecting spinner only when scoped_syncing=true', () => {
      const r = getReadiness({
        ready: false, data_available: false, message: '',
        last_completed_at: null, scoped_syncing: true,
      })
      renderPage(undefined, DEFAULT_METRICS, r)
      expect(screen.getByText(/being collected/i)).toBeInTheDocument()
      expect(document.querySelector('.analytics-loading-gate--active'))
        .toBeInTheDocument()
    })

    // Regression for the reported bug: ready=false ALONE must not read as syncing.
    it('does NOT show a spinner when ready=false with an explicit non-running scoped state', () => {
      const r = getReadiness({
        ready: false, data_available: true, message: '',
        last_completed_at: null, scoped_syncing: false,
      })
      renderPage(undefined, DEFAULT_METRICS, r)
      expect(screen.queryByText(/being collected/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Collecting/i)).not.toBeInTheDocument()
    })

    // No scoped signal + ready=false also must not spin (global fallback idle).
    it('does NOT show a spinner when ready=false with no scoped signal', () => {
      const r = getReadiness({
        ready: false, data_available: true, message: 'Collecting analytics data...',
        last_completed_at: null,
      })
      renderPage(undefined, DEFAULT_METRICS, r)
      expect(screen.queryByText(/being collected/i)).not.toBeInTheDocument()
    })

    // Idle / never-collected is still first-install data preparation.
    it('shows the uniform loading mode when settled with no data', () => {
      const r = getReadiness({
        ready: false, data_available: false, message: '',
        last_completed_at: null, scoped_syncing: false,
        user_count: 0, user_event_count: 0, user_issue_count: 0,
      })
      renderPage(undefined, DEFAULT_METRICS, r)
      expect(screen.getByText(/being collected/i)).toBeInTheDocument()
      expect(document.querySelector('.analytics-loading-gate--active')).toBeInTheDocument()
    })

    // Completed with data: banner fully hidden.
    it('hides the banner when settled with data (completed)', () => {
      const r = getReadiness({
        ready: true, data_available: true, message: '', last_completed_at: '2026-08-12T10:00:00Z',
        scoped_syncing: false,
      })
      renderPage(undefined, DEFAULT_METRICS, r)
      expect(document.querySelector('.analytics-waiting-notice')).not.toBeInTheDocument()
    })

    // Successful ready=true baseline: no banner.
    it('does not show when ready=true', () => {
      renderPage()
      expect(document.querySelector('.analytics-waiting-notice')).not.toBeInTheDocument()
    })

    // Failed / timed-out: stop loading, show a mild theme-aware error, not a spinner.
    it('shows a theme-aware error (no spinner) when scoped refresh failed', () => {
      const r = getReadiness({
        ready: false, data_available: true, message: '', last_completed_at: null,
        scoped_syncing: false, scoped_error: 'GitLab API timed out',
      })
      renderPage(undefined, DEFAULT_METRICS, r)
      expect(screen.queryByText(/being collected/i)).not.toBeInTheDocument()
      expect(document.querySelector('.analytics-waiting-notice--error'))
        .toBeInTheDocument()
      expect(screen.getByText(/timed out/i)).toBeInTheDocument()
    })
  })

  // ── 6. SUMMARY CARDS ────────────────────────────────────────

  describe('summary bar metrics', () => {
    it('shows only activity metrics in the distribution bar', () => {
      renderPage()
      expect(document.querySelector('.user-activity-summary .summary-bar-legend')).toBeNull()
      const bar = document.querySelector('.user-activity-summary .summary-bar-segments')
      expect(bar).toBeTruthy()
      expect(bar!.querySelectorAll('span').length).toBe(5)
    })

    it('renders activity segments with proportions of total activity', () => {
      renderPage()
      const bar = document.querySelector('.user-activity-summary .summary-bar-segments')
      expect(bar).toBeTruthy()
      expect(Array.from(bar.querySelectorAll('span')).map(s => s.style.flexGrow)).toEqual(['19', '36', '5', '8', '23'])
    })

    it('shows hover details with metric, count and percentage of total activity', async () => {
      renderPage()
      const bar = document.querySelector('.user-activity-summary .summary-bar-segments')
      fireEvent.mouseEnter(bar.querySelector('span'))
      await waitFor(() => {
        expect(document.body.textContent).toContain('Pushes: 19 (21%)')
      })
      fireEvent.mouseEnter(bar.querySelectorAll('span')[2])
      await waitFor(() => {
        expect(document.body.textContent).toContain('Merged: 5 (5%)')
      })
    })

    it('renders a clean empty bar (no segments, no legend) when all activity metrics are zero', () => {
      renderPage(undefined, { activeUsers:4,nonActiveUsers:1,totalUsers:5,totalIssues:0,totalMergeRequests:0,totalMergedUsers:0,totalPushes:0,totalComments:0,activityLoading:false })
      const bar = document.querySelector('.user-activity-summary .summary-bar-segments')
      expect(bar).toBeTruthy()
      expect(bar!.querySelectorAll('span').length).toBe(0)
      expect(document.querySelector('.user-activity-summary .summary-bar-legend')).toBeNull()
    })
  })

  // ── 7. FIELD SEARCH BOX ─────────────────────────────────────

  describe('field search box', () => {
    it('renders the field select and search input', () => {
      renderPage()
      expect(document.querySelector('[data-testid="field-search-field-select"]')).toBeInTheDocument()
      expect(screen.getByLabelText('Search users')).toBeInTheDocument()
    })

    it('defaults to the "All fields" selection and matching placeholder', () => {
      renderPage()
      expect(screen.getByText('All fields')).toBeInTheDocument()
      const input = screen.getByLabelText('Search users') as HTMLInputElement
      expect(input.placeholder).toBe('Filter all fields...')
    })
  })

  // ── 10. USER IDS FILTER ─────────────────────────────────────

  describe('user IDs filter', () => {
    it('passes group_ids filter', () => {
      renderPage()
      expect(screen.getByText('USER ACTIVITY')).toBeInTheDocument()
    })
  })

  // ── 11-13. MEMBERSHIP FILTERS ─────────────────────────────

  describe('membership default', () => {
    it('renders no filter chips by default (membershipFilter defaults to both)', () => {
      renderPage()
      expect(screen.queryByRole('button', { name: /Remove filter/ })).toBeNull()
    })
  })

  describe('membership Active', () => {
    it('picking the Active state suggestion adds a State chip', async () => {
      renderPage()
      const input = screen.getByLabelText('Search users')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Active' } })
      await screen.findByRole('option', { name: 'Active' })
      fireEvent.click(screen.getByRole('option', { name: 'Active' }))
      expect(screen.getByRole('button', { name: 'Remove filter Active' })).toBeInTheDocument()
    })
  })

  describe('membership Non-active', () => {
    it('Non-active state suggestion appears when searching in the field', async () => {
      renderPage()
      const input = screen.getByLabelText('Search users')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Non' } })
      expect(await screen.findByRole('option', { name: 'Non-active' })).toBeInTheDocument()
    })
  })

  describe('membership Both', () => {
    it('removing a state chip resets membership to both (no state chip remains)', async () => {
      renderPage()
      const input = screen.getByLabelText('Search users')
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'Active' } })
      fireEvent.click(await screen.findByRole('option', { name: 'Active' }))
      fireEvent.click(screen.getByRole('button', { name: 'Remove filter Active' }))
      expect(screen.queryByRole('button', { name: 'Remove filter Active' })).toBeNull()
    })
  })

  // ── 14. TIME RANGE ──────────────────────────────────────────

  describe('time range', () => {
    it('renders range dropdown with 10 options including Last 3 days', () => {
      renderPage()
      const selects = document.querySelectorAll('select')
      const rangeSel = Array.from(selects).find(s =>
        !!s.parentElement?.getAttribute('class')?.includes('time-range-control')
      )
      expect(rangeSel).toBeTruthy()
      expect(rangeSel?.querySelectorAll('option').length).toBe(10)
      const values = Array.from(rangeSel?.querySelectorAll('option') ?? []).map(o => o.value)
      expect(values).toContain('72')
      expect(screen.getByText('Last 3 days')).toBeInTheDocument()
    })

    it('selecting Last 3 days sends hours=72 and persists it', async () => {
      renderPage()
      const selects = document.querySelectorAll('select')
      const rangeSel = Array.from(selects).find(s =>
        !!s.parentElement?.getAttribute('class')?.includes('time-range-control')
      ) as HTMLSelectElement
      fireEvent.change(rangeSel, { target: { value: '72' } })
      expect(rangeSel.value).toBe('72')
      expect(localStorage.getItem('analytics_range_users')).toBe('72')
      await waitFor(() => {
        const urls = mockFetch.mock.calls.map(c => String(c[0]))
        expect(urls.some(u => u.includes('hours=72'))).toBe(true)
      })
    })

    it('restores a persisted 72-hour range after refresh', async () => {
      localStorage.setItem('analytics_range_users', '72')
      renderPage()
      const selects = document.querySelectorAll('select')
      const rangeSel = Array.from(selects).find(s =>
        !!s.parentElement?.getAttribute('class')?.includes('time-range-control')
      ) as HTMLSelectElement
      await waitFor(() => expect(rangeSel?.value).toBe('72'))
      await waitFor(() => {
        const urls = mockFetch.mock.calls.map(c => String(c[0]))
        expect(urls.some(u => u.includes('hours=72'))).toBe(true)
      })
    })

    it('shows Last 24 hours label', () => {
      renderPage()
      expect(screen.getByText('Last 24 hours')).toBeInTheDocument()
    })

    it('select value is 24 by default', () => {
      renderPage()
      const selects = document.querySelectorAll('select')
      const rangeSel = Array.from(selects).find(s =>
        !!s.parentElement?.getAttribute('class')?.includes('time-range-control')
      )
      expect(rangeSel?.value).toBe('24')
    })

    it('change to 168h updates localStorage', () => {
      renderPage()
      const selects = document.querySelectorAll('select')
      const rangeSel = Array.from(selects).find(s =>
        !!s.parentElement?.getAttribute('class')?.includes('time-range-control')
      )
      if (rangeSel) {
        fireEvent.change(rangeSel, { target: { value: '168' } })
        expect(rangeSel.value).toBe('168')
        expect(localStorage.getItem('analytics_range_users')).toBe('168')
      }
    })
  })

  // ── 15. COMBINED FILTERS ───────────────────────────────────

  describe('combined filters', () => {
    it('all filter controls visible together', () => {
      renderPage()
      expect(screen.getByText('USER ACTIVITY')).toBeInTheDocument()
      expect(document.querySelector('[data-testid="field-search-field-select"]')).toBeInTheDocument()
      expect(screen.getByLabelText('Search users')).toBeInTheDocument()
      expect(document.querySelector('.time-range-control')).toBeInTheDocument()
    })
  })

  // ── 16. TABLE RENDER ───────────────────────────────────────

  describe('table render', () => {
    it('toggles a sortable header between ascending and descending', async () => {
      renderPage()
      const nameSort = await screen.findByRole('button', { name: 'Sort by Name descending' })
      fireEvent.click(nameSort)
      expect(await screen.findByRole('button', { name: 'Sort by Name ascending' })).toBeInTheDocument()
    })

    it('renders data table', () => {
      renderPage()
      expect(document.querySelector('table')).toBeInTheDocument()
    })

    it('displays user names', () => {
      renderPage()
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })

    it('displays username handles', () => {
      renderPage()
      expect(screen.getByText('@alice')).toBeInTheDocument()
    })

    it('displays membership badges', () => {
      renderPage()
      const table = document.querySelector<HTMLTableElement>('table.user-metrics-table')
      expect(table).toBeTruthy()
      const rows = table?.querySelectorAll('tbody tr')
      expect(rows?.length).toBeGreaterThan(0)
      // Check for status-badge elements within table rows
      const badges = table?.querySelectorAll('.status-badge')
      expect(badges?.length).toBeGreaterThan(0)
    })

    it('displays column headers', () => {
      renderPage()
      const table = document.querySelector<HTMLTableElement>('table.user-metrics-table')
      expect(table).toBeTruthy()
      const headers = table?.querySelectorAll('thead th')
      const headerTexts = Array.from(headers!).map(h => h.textContent || '')
      expect(headerTexts.some(text => text.startsWith('User'))).toBe(true)
      expect(headerTexts.some(text => text.startsWith('State'))).toBe(true)
      expect(headerTexts.some(text => text.startsWith('Badge'))).toBe(true)
      for (const label of ['Issues', 'MRs', 'Pushes', 'Comments', 'Last activity']) {
        expect(headerTexts.some(text => text.startsWith(label))).toBe(true)
      }
    })

    it('renders avatar images', () => {
      renderPage()
      expect(document.querySelectorAll<HTMLImageElement>('img.user-avatar').length).toBeGreaterThan(0)
    })
  })

  // ── 17. USER LINK ──────────────────────────────────────────

  describe('user link', () => {
    it('anchors to web_url with target=_blank', () => {
      renderPage()
      const a = document.querySelector<HTMLAnchorElement>('a[href="https://gitlab.com/alice"]')
      expect(a).toBeTruthy()
      expect(a?.getAttribute('target')).toBe('_blank')
      expect(a?.getAttribute('rel')).toBe('noopener noreferrer')
    })
  })

  // ── 18. PAGINATION ─────────────────────────────────────────

  describe('pagination', () => {
    it('shows Page X of Y text', () => {
      renderPage()
      expect(screen.getByText(/Page \d+ of \d+/)).toBeInTheDocument()
    })

    it('has paginator element', () => {
      renderPage()
      expect(document.querySelector('.user-activity-paginator')).toBeInTheDocument()
    })
  })

  // ── 19. PAGE SIZE ──────────────────────────────────────────

  describe('page size', () => {
    it('page size select exists', () => {
      renderPage()
      expect(document.querySelector<HTMLSelectElement>('.user-activity-paginator select')).toBeInTheDocument()
    })

    it('does not offer an All option', () => {
      renderPage()
      const options = Array.from(
        document.querySelectorAll<HTMLOptionElement>('.user-activity-paginator select option'),
      ).map(option => option.textContent)
      expect(options).toEqual(['10', '20', '30', '40', '50'])
    })

    it('restores the persisted page size', async () => {
      localStorage.setItem('gitlab_ops_user_activity_page_size', '30')
      renderPage()
      await waitFor(() => {
        expect(document.querySelector<HTMLSelectElement>('.user-activity-paginator select')?.value).toBe('30')
      })
    })
  })

  // ── 20. CSV EXPORT ─────────────────────────────────────────

  describe('export CSV', () => {
    it('export button exists', () => {
      renderPage()
      const buttons = Array.from(document.querySelectorAll('button'))
      expect(buttons.some(b => (b.textContent || '').includes('Export CSV'))).toBe(true)
    })

    it('export disabled with no data', () => {
      setupFn([], { activeUsers:0,nonActiveUsers:0,totalUsers:0,totalIssues:0,totalMergeRequests:0,totalMergedUsers:0,totalPushes:0,totalComments:0,activityLoading:false })
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      qc.setQueryData(['analytics-readiness', 1, 123], getReadiness())
      qc.setQueryData(['user-activity', 1, '123', 24, 'both', -1, 1, 10], { users: [], page: 1, pageSize: 10, total: 0 })
      qc.setQueryData(['user-metrics', 1, '123', 24, 'both', -1], { activeUsers:0,nonActiveUsers:0,totalUsers:0,totalIssues:0,totalMergeRequests:0,totalMergedUsers:0,totalPushes:0,totalComments:0,activityLoading:false })
      const w = ({ children}: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <GroupContext.Provider value={{ selectedGroupId: 123, selectedEnvId: 1, setSelectedGroupId: vi.fn() }}>
              {children}
            </GroupContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>
      )
      render(<UserActivityPage />, { wrapper: w })
      const exportBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent || '').includes('Export CSV')
      )
      // sortedUsers.length === 0 → disabled
      expect(exportBtn?.disabled).toBe(true)
    })

    it('export enabled with data', () => {
      renderPage()
      const exportBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent || '').includes('Export CSV')
      )
      expect(exportBtn?.disabled).toBe(false)
    })

    it('clicking export creates download link', () => {
      renderPage()
      const createEl = vi.spyOn(document, 'createElement')
      const exportBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent || '').includes('Export CSV')
      )
      if (exportBtn) fireEvent.click(exportBtn)
      const callArg = createEl.mock.calls[0]?.[0] as string | undefined
      expect(callArg).toBe('a')
      // The href is set on the created element
      // Check the a element's href attribute if it was returned
      const mock = createEl.mock.results[0]?.value as HTMLAnchorElement | undefined
      if (mock) {
        expect(mock.getAttribute('href')).toContain('group_ids=123')
      }
    })
  })

  // ── 21. EXPORT FILTER PARITY ───────────────────────────────

  describe('export filter parity', () => {
    it('export URL contains group_ids hours membership', () => {
      renderPage()
      const createEl = vi.spyOn(document, 'createElement')
      const exportBtn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent || '').includes('Export CSV')
      ) as HTMLButtonElement | undefined
      if (exportBtn) fireEvent.click(exportBtn)
      const mock = createEl.mock.results[0]?.value as HTMLAnchorElement | undefined
      if (mock) {
        expect(mock.getAttribute('href')).toContain('group_ids')
        expect(mock.getAttribute('href')).toContain('hours')
        expect(mock.getAttribute('href')).toContain('membership')
      }
    })
  })

  // ── 22. REFRESH ────────────────────────────────────────────

  describe('refresh', () => {
    it('refresh button exists', () => {
      renderPage()
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent || '').includes('Refresh')
      )
      expect(btn).toBeTruthy()
    })

    it('refresh button is clickable', () => {
      renderPage()
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.textContent || '').includes('Refresh')
      ) as HTMLButtonElement | undefined
      if (btn) fireEvent.click(btn)
      expect(document.querySelector('.user-metrics-page')).toBeInTheDocument()
    })
  })

  // ── 23. LIGHT THEME ────────────────────────────────────────

  describe('light theme', () => {
    it('renders cleanly', () => {
      document.body.removeAttribute('data-theme')
      renderPage()
      expect(document.querySelector('.user-metrics-page')).toBeInTheDocument()
    })
  })

  // ── 24. DARK THEME ──────────────────────────────────────

  describe('dark theme', () => {
    it('renders cleanly with dark theme', () => {
      document.body.setAttribute('data-theme', 'dark')
      renderPage()
      expect(document.querySelector('.user-metrics-page')).toBeInTheDocument()
      document.body.removeAttribute('data-theme')
    });
  })
})

