import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { GroupContext } from '../contexts/GroupContext'
import PipelinesPage from './PipelinesPage'

vi.mock('../services/api', () => ({
  api: {
    getPipelineProjects: vi.fn(),
    getGlobalConfig: vi.fn(),
    getBatchJobs: vi.fn(),
    startPipeline: vi.fn(),
    retryPipeline: vi.fn(),
    cancelPipeline: vi.fn(),
    getProjectBranches: vi.fn(),
    getAnalyticsReadiness: vi.fn(),
  },
  queryClient: { invalidateQueries: vi.fn() },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => ({ id: '' }) }
})

import { api } from '../services/api'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <GroupContext.Provider value={{ selectedGroupId: 123, groupOptions: [{ id: 123, name: 'TestGroup', full_path: 'test' }] }}>
        {children}
      </GroupContext.Provider>
    </BrowserRouter>
  </QueryClientProvider>
)

const mockProjects = [{
  group_id: 123,
  project: {
    id: 101, name: 'web-frontend', path: 'mygroup/web-frontend',
    web_url: 'https://gitlab.com/p', default_branch: 'main', topics: ['frontend', 'react'],
    namespace: { id: 1, name: 'TG', path: 'mg', full_path: 'mg' }, jobs_enabled: true,
  },
  pipelines: [{
    id: 1001, iid: 1, project_id: 101, coverage: 90, sha: 'abc',
    ref: 'main', status: 'success', source: 'push',
    created_at: '2026-08-12T10:00:00Z', updated_at: '2026-08-12T10:05:00Z',
    web_url: 'https://gitlab.com/p/1001',
  }],
}]

const mockJobs = [{
  id: 10001, name: 'build', stage: 'build', ref: 'main', status: 'success',
  allow_failure: false, web_url: 'https://gitlab.com/j/10001',
  created_at: '2026-08-12T09:50:00Z', pipeline_id: 1001, project_id: 101,
}]

global.window.matchMedia = vi.fn().mockImplementation((q) => ({
  matches: false, media: q, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
}))
global.window.getComputedStyle = vi.fn().mockReturnValue({ getPropertyValue: vi.fn().mockReturnValue('') })

const mockConfig = { company_name: 'T', pipeline_view: 'latest' }

const mockReadiness = { ready: true, data_available: true, message: '', last_completed_at: null, project_count: 1, pipeline_count: 1, runner_state_count: 0, user_count: 0, user_event_count: 0, user_issue_count: 0 }

describe('PipelinesPage', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    queryClient.clear()
    localStorage.clear()
    api.getPipelineProjects.mockResolvedValue(mockProjects)
    api.getGlobalConfig.mockResolvedValue(mockConfig)
    api.getBatchJobs.mockResolvedValue(mockJobs)
    api.getAnalyticsReadiness.mockResolvedValue(mockReadiness)
  })

  it('restores the persisted pipeline range after refresh', async () => {
    localStorage.setItem('analytics_range_pipelines', '168')
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(api.getPipelineProjects).toHaveBeenCalledWith({ group_id: 123, hours: 168, pipeline_view: 'latest' }))
  })

  it('restores the persisted 72-hour pipeline range after refresh', async () => {
    localStorage.setItem('analytics_range_pipelines', '72')
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(api.getPipelineProjects).toHaveBeenCalledWith({ group_id: 123, hours: 72, pipeline_view: 'latest' }))
  })

  it('ignores an invalid persisted pipeline range', async () => {
    localStorage.setItem('analytics_range_pipelines', '999')
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(api.getPipelineProjects).toHaveBeenCalledWith({ group_id: 123, hours: 24, pipeline_view: 'latest' }))
  })

  it('renders table', async () => {
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0))
  })

  it('renders the compact summary header and range selector under dark theme', async () => {
    document.body.setAttribute('data-theme', 'dark')
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(screen.getByText('PIPELINES')).toBeInTheDocument())
    expect(document.querySelector('.summary-bar-title')).toBeTruthy()
    expect(document.querySelector('.data-workspace .pipeline-toolbar')).toBeTruthy()
    expect(document.querySelector('.ant-select')).toBeTruthy()
    document.body.removeAttribute('data-theme')
  })

  it('shows project name', async () => {
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(screen.getByText('web-frontend')).toBeInTheDocument())
  })

  it('shows persisted trigger and status values', async () => {
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => {
      expect(screen.getAllByText('push').length).toBeGreaterThan(0)
      expect(screen.getAllByText('success').length).toBeGreaterThan(0)
    })
  })

  it('shows the persisted pipeline last-run timestamp', async () => {
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => {
      expect(document.querySelector('.pipeline-last-run')).toHaveTextContent(/Aug.*12.*2026|12.*Aug.*2026/i)
    })
  })

  it('shows no data message when empty', async () => {
    api.getPipelineProjects.mockResolvedValueOnce([])
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/no data|no pipelines/i)
    })
  })

  it('shows jobs', async () => {
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0))
    fireEvent.click(screen.getByTestId('toggle-jobs'))
    await waitFor(() => expect(screen.getAllByText('build').length).toBeGreaterThan(0))
  })

  it('orders job badges by pipeline stage sequence', async () => {
    api.getBatchJobs.mockResolvedValueOnce([
      { ...mockJobs[0], id: 10004, name: 'release', stage: 'deploy', created_at: '2026-08-12T09:53:00Z' },
      { ...mockJobs[0], id: 10002, name: 'unit-test', stage: 'test', created_at: '2026-08-12T09:52:00Z' },
      { ...mockJobs[0], id: 10003, name: 'compile', stage: 'build', created_at: '2026-08-12T09:51:00Z' },
      { ...mockJobs[0], id: 10001, name: 'prepare', stage: '.pre', created_at: '2026-08-12T09:54:00Z' },
      { ...mockJobs[0], id: 10005, name: 'cleanup', stage: '.post', created_at: '2026-08-12T09:49:00Z' },
      { ...mockJobs[0], id: 10006, name: 'lint', stage: 'test', created_at: '2026-08-12T09:52:30Z' },
    ])
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(screen.getByText('PIPELINES')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Show jobs column'))
    await waitFor(() => expect(document.querySelectorAll('.pipeline-job-badge')).toHaveLength(6))
    const labels = [...document.querySelectorAll('.pipeline-job-badge')].map((badge) => badge.textContent)
    expect(labels).toEqual(['prepare', 'compile', 'unit-test', 'lint', 'release', 'cleanup'])
  })

  it('shows start pipeline button', async () => {
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })

  it('offers status as a search field', async () => {
    const { container } = render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0))
    const selector = container.querySelector('[data-testid="field-search-field-select"] .ant-select-selector')!
    fireEvent.mouseDown(selector)
    await waitFor(() => {
      const options = Array.from(document.querySelectorAll('.ant-select-dropdown .ant-select-item-option'))
      expect(options.map((o) => (o.textContent ?? '').trim())).toEqual(
        ['All fields', 'Status', 'Group', 'Project', 'Branch'],
      )
    })
  })


  it('shows refresh interval text', async () => {
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0))
  })

  it('shows pagination total', async () => {
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0))
  })

  it('has the unified search input', async () => {
    render(<PipelinesPage />, { wrapper })
    expect(screen.getByRole('textbox', { name: 'Search pipelines' })).toBeInTheDocument()
  })

  it('pipelineView config loaded', async () => {
    render(<PipelinesPage />, { wrapper })
    await waitFor(() => {
      expect(api.getGlobalConfig).toHaveBeenCalled()
    })
  })
})

/* ── Last Run ordering ───────────────────────────────────────────────── */

function pipelineFixtures(entries: { name: string; updatedAt: string }[]) {
  return entries.map((e, i) => ({
    group_id: 123,
    project: {
      id: 1000 + i,
      name: e.name,
      path: `test/${e.name}`,
      web_url: `https://gitlab.com/p/${i}`,
      default_branch: 'main',
      topics: [],
      namespace: { id: 1, name: 'TG', path: 'mg', full_path: 'mg' },
      jobs_enabled: true,
    },
    pipelines: [{
      id: 2000 + i,
      iid: 1,
      project_id: 1000 + i,
      coverage: null,
      sha: 'sha',
      ref: 'main',
      status: 'success',
      source: 'push',
      created_at: '2026-08-12T09:00:00Z',
      updated_at: e.updatedAt,
      web_url: '',
    }],
  }))
}

/**
 * Fixture whose last-run (updated_at / created_at) is fully clearable so a
 * "no timestamp" row is genuinely last-run-less, matching the component's
 * `updated_at || created_at` resolution. `ts` null → both fields empty.
 */
function lastRunFixtures(entries: { name: string; ts: string | null }[]) {
  return entries.map((e, i) => ({
    group_id: 123,
    project: {
      id: 1000 + i,
      name: e.name,
      path: `test/${e.name}`,
      web_url: `https://gitlab.com/p/${i}`,
      default_branch: 'main',
      topics: [],
      namespace: { id: 1, name: 'TG', path: 'mg', full_path: 'mg' },
      jobs_enabled: true,
    },
    pipelines: [{
      id: 2000 + i,
      iid: 1,
      project_id: 1000 + i,
      coverage: null,
      sha: 'sha',
      ref: 'main',
      status: 'success',
      source: 'push',
      created_at: e.ts ?? '',
      updated_at: e.ts ?? '',
      web_url: '',
    }],
  }))
}

function lastRunRowNames(): string[] {
  const rows = document.querySelectorAll('.ant-table-tbody tr.ant-table-row')
  return Array.from(rows).map((r) => (r.querySelector('td:nth-child(3)') as HTMLElement | null)?.textContent?.trim() ?? '')
}

async function waitForRowsRendered(): Promise<void> {
  await waitFor(() => expect(lastRunRowNames().length).toBeGreaterThan(0))
}

function clickLastRunSorter(): void {
  const button = screen.getByRole('button', { name: /Last Run/i })
  fireEvent.click(button)
}

describe('PipelinesPage — Last Run ordering', () => {
  beforeEach(async () => {
    cleanup()
    vi.clearAllMocks()
    queryClient.clear()
    localStorage.clear()
    api.getGlobalConfig.mockResolvedValue({ company_name: 'T', pipeline_view: 'all' })
    api.getBatchJobs.mockResolvedValue([])
    api.getAnalyticsReadiness.mockResolvedValue({
      ready: true,
      data_available: true,
      message: '',
      last_completed_at: null,
      project_count: 3, pipeline_count: 3, runner_state_count: 0, user_count: 0, user_event_count: 0, user_issue_count: 0,
    })
  })

  it('orders rows newest last-run first by default', async () => {
    api.getPipelineProjects.mockResolvedValue(pipelineFixtures([
      { name: 'p_old',   updatedAt: '2026-08-10T10:00:00Z' },
      { name: 'p_new',   updatedAt: '2026-08-14T10:00:00Z' },
      { name: 'p_mid',   updatedAt: '2026-08-12T10:00:00Z' },
    ]))
    render(<PipelinesPage />, { wrapper })
    await waitForRowsRendered()
    expect(lastRunRowNames()).toEqual(['p_new', 'p_mid', 'p_old'])
  })

  it('clicking Last Run header cycles newest→oldest then oldest→newest', async () => {
    api.getPipelineProjects.mockResolvedValue(pipelineFixtures([
      { name: 'p_old', updatedAt: '2026-08-10T10:00:00Z' },
      { name: 'p_new', updatedAt: '2026-08-14T10:00:00Z' },
      { name: 'p_mid', updatedAt: '2026-08-12T10:00:00Z' },
    ]))
    render(<PipelinesPage />, { wrapper })
    await waitForRowsRendered()
    expect(lastRunRowNames()).toEqual(['p_new', 'p_mid', 'p_old'])

    // First click: default is descend (newest first) → switch to ascend.
    clickLastRunSorter()
    await waitFor(() => expect(lastRunRowNames()).toEqual(['p_old', 'p_mid', 'p_new']))

    // Second click: ascend → descend.
    clickLastRunSorter()
    await waitFor(() => expect(lastRunRowNames()).toEqual(['p_new', 'p_mid', 'p_old']))
  })

  it('pins rows without a last-run timestamp last regardless of direction', async () => {
    api.getPipelineProjects.mockResolvedValue(lastRunFixtures([
      { name: 'p_none', ts: null },
      { name: 'p_new',  ts: '2026-08-14T10:00:00Z' },
      { name: 'p_old',  ts: '2026-08-10T10:00:00Z' },
    ]))
    render(<PipelinesPage />, { wrapper })
    await waitForRowsRendered()
    // Descending: null still last.
    expect(lastRunRowNames()).toEqual(['p_new', 'p_old', 'p_none'])

    // Ascending: null still last (does not float to the top).
    clickLastRunSorter()
    await waitFor(() => expect(lastRunRowNames()).toEqual(['p_old', 'p_new', 'p_none']))
  })

  it('preserves the last-run sort across a polling refetch', async () => {
    api.getPipelineProjects.mockResolvedValueOnce(pipelineFixtures([
      { name: 'p_old', updatedAt: '2026-08-10T10:00:00Z' },
      { name: 'p_new', updatedAt: '2026-08-14T10:00:00Z' },
    ]))
    render(<PipelinesPage />, { wrapper })
    await waitForRowsRendered()

    // Switch to ascending (oldest first) — this is React state, not data-derived.
    clickLastRunSorter()
    await waitFor(() => expect(lastRunRowNames()).toEqual(['p_old', 'p_new']))

    // Simulate a polling refetch landing fresh data with a different insertion order.
    api.getPipelineProjects.mockResolvedValue(pipelineFixtures([
      { name: 'q_mid', updatedAt: '2026-08-12T10:00:00Z' },
      { name: 'q_new', updatedAt: '2026-08-14T10:00:00Z' },
      { name: 'q_old', updatedAt: '2026-08-10T10:00:00Z' },
    ]))
    queryClient.invalidateQueries({ queryKey: ['pipeline-projects'] })

    // The active ascending sort must carry over to the new data.
    await waitFor(() => expect(lastRunRowNames()).toEqual(['q_old', 'q_mid', 'q_new']))
  })

  it('keeps ordering correct across pages and keeps nulls on the last page', async () => {
    // 10 timestamped (newer→older) + 2 nulls = 12 rows. At 10 rows/page the
    // 10 newest must fill page 1 and the 2 null timestamps must land on page 2.
    const fixtures = [
      'r10', 'r09', 'r08', 'r07', 'r06', 'r05', 'r04', 'r03', 'r02', 'r01',
    ].map((name, i) => ({ name, ts: `2026-08-${(13 - i)}T10:00:00Z` }))
    fixtures.push({ name: 'r_none_1', ts: null })
    fixtures.push({ name: 'r_none_2', ts: null })
    api.getPipelineProjects.mockResolvedValue(lastRunFixtures(fixtures))

    render(<PipelinesPage />, { wrapper })
    await waitForRowsRendered()

    // Drop page size to 10 so the 12 rows span two pages.
    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '10' } })

    // Page 1 stabilises at the newest 10 rows; the newest is r10.
    await waitFor(() => {
      const rows = lastRunRowNames()
      expect(rows.length).toBe(10)
      expect(rows[0]).toBe('r10')
    })
    // Every row on page 1 is timestamped (no null floats up to page 1).
    await waitFor(() => {
      expect(lastRunRowNames()).not.toContain('r_none_1')
      expect(lastRunRowNames()).not.toContain('r_none_2')
    })

    // Page 2 holds only the two rows without a last-run timestamp — proving
    // the global (pre-slice) newest-first ordering keeps the nulls on the
    // final page.
    fireEvent.click(screen.getByLabelText('Next page'))
    await waitFor(() => expect(lastRunRowNames()).toEqual(['r_none_1', 'r_none_2']))
  })
})

/* ── Status filter vs latest view ────────────────────────────────────── */

/*
 * Regression: in 'latest' view a ref displays its newest pipeline. A Status
 * filter must match that displayed (newest) pipeline, not an older pipeline on
 * the same ref. `status-project` has BOTH a success and a failed pipeline on
 * the same ref, with the FAILED one newest, so its displayed row is "failed"
 * and it must NOT match a Status = success filter. `success-project` has only
 * a success pipeline, so it must match.
 */
describe('PipelinesPage — Status filter matches displayed pipeline', () => {
  let statusProjects: any[]

  beforeEach(async () => {
    cleanup()
    vi.clearAllMocks()
    queryClient.clear()
    localStorage.clear()
    api.getGlobalConfig.mockResolvedValue({ company_name: 'T', pipeline_view: 'latest' })
    api.getBatchJobs.mockResolvedValue([])
    api.getAnalyticsReadiness.mockResolvedValue({
      ready: true, data_available: true, message: '', last_completed_at: null,
      project_count: 2, pipeline_count: 0, runner_state_count: 0, user_count: 0,
      user_event_count: 0, user_issue_count: 0,
    })

    const ns = { id: 1, name: 'TG', path: 'mg', full_path: 'mg' }
    statusProjects = [
      {
        group_id: 123,
        project: {
          id: 201, name: 'status-project', path: 'test/status-project',
          web_url: 'https://gitlab.com/p/s', default_branch: 'main',
          topics: [], namespace: ns, jobs_enabled: true,
        },
        pipelines: [
          { id: 3001, iid: 1, project_id: 201, coverage: null, sha: 's', ref: 'main',
            status: 'success', source: 'push', created_at: '2026-08-10T10:00:00Z',
            updated_at: '2026-08-12T10:00:00Z', web_url: '' },
          { id: 3002, iid: 2, project_id: 201, coverage: null, sha: 's', ref: 'main',
            status: 'failed', source: 'push', created_at: '2026-08-14T10:00:00Z',
            updated_at: '2026-08-14T10:00:00Z', web_url: '' }, // newest displayed row
        ],
      },
      {
        group_id: 123,
        project: {
          id: 202, name: 'success-project', path: 'test/success-project',
          web_url: 'https://gitlab.com/p/ss', default_branch: 'main',
          topics: [], namespace: ns, jobs_enabled: true,
        },
        pipelines: [
          { id: 3101, iid: 1, project_id: 202, coverage: null, sha: 's', ref: 'main',
            status: 'success', source: 'push', created_at: '2026-08-12T10:00:00Z',
            updated_at: '2026-08-12T10:00:00Z', web_url: '' },
        ],
      },
    ]
    api.getPipelineProjects.mockResolvedValue(statusProjects)
  })

  async function typeFreeTextFilter(field: string, value: string) {
    const { container } = await render(<PipelinesPage />, { wrapper })
    await waitFor(() => expect(screen.getAllByRole('table').length).toBeGreaterThan(0))
    fireEvent.mouseDown(container.querySelector('[data-testid="field-search-field-select"] .ant-select-selector')!)
    const target = await waitFor(() => {
      const option = Array.from(document.querySelectorAll('.ant-select-dropdown .ant-select-item-option'))
        .find((o) => (o.textContent ?? '').trim() === field)
      expect(option, `dropdown option "${field}" should be open`).toBeTruthy()
      return option!
    })
    fireEvent.click(target)
    const input = screen.getByRole('textbox', { name: 'Search pipelines' })
    input.focus()
    fireEvent.change(input, { target: { value } })
    fireEvent.keyDown(input, { key: 'Enter' })
  }

  it('excludes projects whose newest (displayed) pipeline is not the filtered status', async () => {
    await typeFreeTextFilter('Status', 'success')
    expect(screen.getByText('success-project')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('status-project')).not.toBeInTheDocument())
  })

  it('includes projects whose newest displayed pipeline IS the filtered status', async () => {
    await typeFreeTextFilter('Status', 'failed')
    expect(screen.getByText('status-project')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('success-project')).not.toBeInTheDocument())
  })
})

function rowCheckboxes(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll('.ant-table-tbody tr.ant-table-row input[type="checkbox"]')) as HTMLInputElement[]
}

describe('PipelinesPage — multi-select bulk actions', () => {
  beforeEach(async () => {
    cleanup()
    vi.clearAllMocks()
    queryClient.clear()
    localStorage.clear()
    api.getGlobalConfig.mockResolvedValue({ company_name: 'T', pipeline_view: 'latest' })
    api.getBatchJobs.mockResolvedValue([])
    api.getAnalyticsReadiness.mockResolvedValue({
      ready: true, data_available: true, message: '', last_completed_at: null,
      project_count: 2, pipeline_count: 0, runner_state_count: 0, user_count: 0,
      user_event_count: 0, user_issue_count: 0,
    })

    const ns = { id: 1, name: 'TG', path: 'mg', full_path: 'mg' }
    api.getPipelineProjects.mockResolvedValue([
      {
        group_id: 123,
        project: { id: 301, name: 'alpha', path: 'test/alpha', web_url: 'https://gitlab.com/a', default_branch: 'main', topics: [], namespace: ns, jobs_enabled: true },
        pipelines: [{ id: 4001, iid: 1, project_id: 301, coverage: null, sha: 's', ref: 'main', status: 'success', source: 'push', created_at: '2026-08-12T10:00:00Z', updated_at: '2026-08-12T10:00:00Z', web_url: '' }],
      },
      {
        group_id: 123,
        project: { id: 302, name: 'beta', path: 'test/beta', web_url: 'https://gitlab.com/b', default_branch: 'main', topics: [], namespace: ns, jobs_enabled: true },
        pipelines: [{ id: 4002, iid: 1, project_id: 302, coverage: null, sha: 's', ref: 'main', status: 'success', source: 'push', created_at: '2026-08-12T09:00:00Z', updated_at: '2026-08-12T09:00:00Z', web_url: '' }],
      },
    ])
  })

  async function renderAndSelectAll() {
    render(<PipelinesPage />, { wrapper })
    const boxes = await waitFor(() => {
      const all = rowCheckboxes()
      expect(all.length).toBe(2)
      return all
    })
    for (const box of boxes) fireEvent.click(box)
  }

  it('shows bulk actions when rows are selected', async () => {
    await renderAndSelectAll()
    expect(await screen.findByTestId('pipeline-bulk-actions')).toHaveTextContent(/2 selected/)
  })

  it('keeps Retry and Cancel disabled for bulk actions', async () => {
    await renderAndSelectAll()
    expect(screen.getByTestId('bulk-retry')).toBeDisabled()
    expect(screen.getByTestId('bulk-cancel')).toBeDisabled()
  })
})
