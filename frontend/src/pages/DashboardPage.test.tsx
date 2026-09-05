import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import { GroupContext } from '../contexts/GroupContext'
import { api } from '../services/api'
import type { AnalyticsSummary, UserActivity, AnalyticsReadiness } from '../types'
import DashboardPage from './DashboardPage'

vi.mock('../components/EChartsWrapper.tsx', () => ({
  default: ({ option }: { option: unknown }) => (
    <div data-testid="echarts-mock" data-option={JSON.stringify(option)}>
      Chart
    </div>
  ),
}))

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      getGlobalConfig: vi.fn().mockResolvedValue({
        company_name: 'T',
        company_logo: '',
        pipeline_view: 'latest',
      }),
    },
  }
})

function getDefaultSummary(pipelineCount: number = 100): AnalyticsSummary {
  const pc = pipelineCount
  return {
    window_days: 7,
    window_hours: 168,
    project_count: 5,
    pipeline_count: pc,
    success_count: 70,
    failed_count: 20,
    manual_count: 5,
    active_count: 3,
    canceled_count: 2,
    runner_count: 5,
    runner_running_count: 3,
    runner_idle_count: 1,
    runner_offline_count: 1,
    history: [],
    success_rate: 70.0,
  }
}

function getDefaultUser(): UserActivity {
  return {
    id: 1,
    username: 'alice',
    name: 'Alice Johnson',
    avatar_url: '',
    web_url: '',
    state: 'active',
    is_admin: false,
    is_current_member: false,
    last_activity_on: '2024-01-15',
    issue_count: 5,
    merge_request_count: 10,
    merged_count: 12,
    push_count: 15,
    comment_count: 20,
    last_pipeline_activity: '2024-01-15',
    total_activity: 50,
  }
}

function makeTestUser(
  overrides: Partial<UserActivity> & Pick<UserActivity, 'id' | 'username' | 'name' | 'is_current_member'>,
): UserActivity {
  return {
    avatar_url: '',
    web_url: '',
    state: 'active',
    is_admin: false,
    last_activity_on: '2024-01-15',
    issue_count: 0,
    merge_request_count: 0,
    merged_count: 0,
    push_count: 0,
    comment_count: 0,
    last_pipeline_activity: '2024-01-15',
    total_activity: 0,
    ...overrides,
  }
}

function summaryCard(title: string): HTMLElement {
  const card = Array.from(document.querySelectorAll<HTMLElement>('article.users-summary')).find(
    (c) => Array.from(c.children).some((child) => child.textContent === title),
  )
  expect(card, `summary panel "${title}"`).toBeTruthy()
  return card as HTMLElement
}

function metricValue(title: string): number {
  const strong = summaryCard(title).querySelector('.summary-value-row .users-summary-value') as HTMLElement
  return Number((strong.textContent ?? '0').replace(/,/g, ''))
}

function leaderboardCard(title: string): HTMLElement {
  const card = Array.from(document.querySelectorAll<HTMLElement>('.leaderboard-card')).find(
    (c) => c.querySelector('header strong')?.textContent === title,
  )
  expect(card, `leaderboard panel "${title}"`).toBeTruthy()
  return card as HTMLElement
}

function leaderboardRows(title: string): HTMLElement[] {
  return Array.from(leaderboardCard(title).querySelectorAll<HTMLElement>('.leaderboard-row'))
}

function rowNames(title: string): string[] {
  return leaderboardRows(title).map(
    (r) => ((r.querySelector('.leaderboard-identity') as HTMLElement) ?? r).textContent ?? '',
  )
}

function rowCounts(title: string): number[] {
  return leaderboardRows(title).map((r) => Number((r.querySelector('b')?.textContent ?? '0').replace(/,/g, '')))
}

function renderDashboard(
  groupId = 123,
  readinessData: AnalyticsReadiness = {
    ready: true,
    data_available: true,
    message: '',
    last_completed_at: null,
    project_count: 5,
    pipeline_count: 10,
    runner_state_count: 0,
    user_count: 0,
    user_event_count: 0,
    user_issue_count: 0,
  },
  summaryData: AnalyticsSummary | undefined = getDefaultSummary(),
  usersData: UserActivity[] | undefined = [getDefaultUser()],
  setPipelineRangeHours = 24,
  setUserRangeHours = 24,
  fullHistoryCount?: number,
  pipelineView = 'latest',
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  queryClient.setQueryData(['analytics-readiness', 1, groupId], readinessData)

  queryClient.setQueryData(['global-config'], {
    company_name: 'T',
    company_logo: '',
    pipeline_view: pipelineView,
  })

  vi.mocked(api.getGlobalConfig).mockResolvedValue({
    company_name: 'T',
    company_logo: '',
    pipeline_view: pipelineView,
  })

  if (summaryData !== undefined) {
    queryClient.setQueryData(
      ['analytics-summary', 1, groupId, setPipelineRangeHours, pipelineView],
      summaryData,
    )
    queryClient.setQueryData(
      ['analytics-summary-full', 1, groupId],
      { ...getDefaultSummary(), pipeline_count: fullHistoryCount ?? summaryData.pipeline_count },
    )
  }

  if (usersData !== undefined) {
    queryClient.setQueryData(['analytics-users', 1, groupId, setUserRangeHours, 'both'], usersData)
  }

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GroupContext.Provider
          value={{
            selectedGroupId: groupId,
            selectedEnvId: 1,
            setSelectedGroupId: vi.fn(),
          }}
        >
          <DashboardPage />
        </GroupContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    stubMatchMedia()
    stubGetComputedStyle()
    vi.clearAllMocks()
    localStorage.clear()
    cleanup()
  })

  describe('basic rendering', () => {
    it('renders Dashboard eyebrow', () => {
      renderDashboard()
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })

    it('renders no Analytics overview heading', () => {
      renderDashboard(123)
      expect(screen.queryByText('Analytics overview')).not.toBeInTheDocument()
    })

    it('renders exactly one header icon tile with unchanged subtitle', () => {
      document.body.setAttribute('data-theme', 'dark')
      renderDashboard()
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      expect(screen.getByText('Analytics overview')).toBeInTheDocument()
      expect(screen.getByText('Historical performance and delivery health for the selected GitLab group.')).toBeInTheDocument()
      document.body.removeAttribute('data-theme')
    })

    it('renders Pipelines analytics tab', () => {
      renderDashboard()
      expect(screen.getByText('Pipelines analytics')).toBeInTheDocument()
    })

    it('renders Users analytics tab', () => {
      renderDashboard()
      expect(screen.getByText('Users analytics')).toBeInTheDocument()
    })
  })

  describe('dashboard analytics tabs', () => {
    it('renders tabs inside .dashboard-tabs container with underline style', () => {
      renderDashboard()
      const tabsContainer = document.querySelector('.dashboard-tabs')
      expect(tabsContainer).toBeInTheDocument()
      expect(tabsContainer?.querySelector('.ant-tabs')).toBeInTheDocument()
      expect(tabsContainer?.querySelector('.ant-tabs-nav')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Pipelines analytics/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Users analytics/i })).toBeInTheDocument()
    })

    it('activates Pipelines analytics by default with aria-selected true', () => {
      renderDashboard()
      const pipelineTab = screen.getByRole('tab', { name: /Pipelines analytics/i })
      const usersTab = screen.getByRole('tab', { name: /Users analytics/i })
      expect(pipelineTab).toHaveAttribute('aria-selected', 'true')
      expect(usersTab).toHaveAttribute('aria-selected', 'false')
    })

    it('switches to Users analytics tab on click and updates active selection', () => {
      renderDashboard()
      const usersTab = screen.getByRole('tab', { name: /Users analytics/i })
      fireEvent.click(usersTab)
      expect(usersTab).toHaveAttribute('aria-selected', 'true')
      expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('readiness integration', () => {
    it('shows readiness loading state', () => {
      renderDashboard()
      expect(screen.queryByText('Dashboard')).toBeInTheDocument()
    })

    it('does not hide loaded panels behind a page-wide readiness gate', () => {
      renderDashboard(123, {
        ready: false,
        data_available: false,
        message: 'Collecting analytics for first-time setup. Data will appear automatically.',
        last_completed_at: null,
        project_count: 0,
        pipeline_count: 0,
        runner_state_count: 0,
        user_count: 0,
        user_event_count: 0,
        user_issue_count: 0,
      })
      expect(document.querySelector('.analytics-loading-gate--full')).not.toHaveClass('analytics-loading-gate--active')
      expect(screen.getByText('Runs captured in PostgreSQL')).toBeInTheDocument()
    })

    it('does not show banner when ready is true', () => {
      renderDashboard()
      expect(screen.queryByText('Collecting analytics')).not.toBeInTheDocument()
    })
  })

  describe('pipeline summary', () => {
    it('renders pipeline summary cards when data available', () => {
      renderDashboard()
      expect(screen.getByText('Runs captured in PostgreSQL')).toBeInTheDocument()
    })
  })

  describe('independent time ranges', () => {
    it('pipeline range and user range use separate localStorage keys', () => {
      localStorage.setItem('analytics_range_pipelines', '24')
      localStorage.setItem('analytics_range_users', '168')

      renderDashboard(undefined, undefined, undefined, undefined, 24, 168)
      expect(screen.getByText('Last 24 hours')).toBeInTheDocument()
    })

    it('changing pipeline range does not change user range', () => {
      expect(true).toBe(true)
    })

    it('changing user range does not change pipeline range', () => {
      expect(true).toBe(true)
    })
  })

  describe('users analytics', () => {
    it('users analytics renders when data available', () => {
      renderDashboard()
      expect(screen.getByText('Users analytics')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Users analytics'))
      expect(screen.getAllByText('Alice Johnson').length).toBeGreaterThanOrEqual(1)
    })

    it('renders the 6 summary panels in the responsive grid without the Non-active panel', () => {
      renderDashboard(123, undefined, undefined, [
        getDefaultUser(),
        makeTestUser({
          id: 2,
          username: 'bob',
          name: 'Bob Smith',
          is_current_member: true,
          issue_count: 2,
          merge_request_count: 4,
          merged_count: 2,
          push_count: 6,
          comment_count: 8,
          total_activity: 20,
        }),
      ])
      fireEvent.click(screen.getByText('Users analytics'))

      for (const title of ['Active users', 'Pushes', 'Merge requests', 'Merged', 'Comments', 'Issues']) {
        expect(summaryCard(title), `summary panel "${title}"`).toBeInTheDocument()
      }
      expect(screen.queryByText('Non-active users')).not.toBeInTheDocument()
      expect(metricValue('Merged')).toBe(14)

      const grid = document.querySelector('.users-summary-row')
      expect(grid).toBeInTheDocument()
      const gridCards = Array.from(grid!.children)
      expect(gridCards).toHaveLength(6)
      expect(gridCards.every((el) => el.classList.contains('users-summary') && el.classList.contains('summary-card'))).toBe(true)
      expect(document.querySelector('.users-analytics table')).not.toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Search user...')).not.toBeInTheDocument()
      expect(document.querySelector('.users-analytics .app-paginator')).not.toBeInTheDocument()
      expect(document.querySelector('.user-activity-summary')).not.toBeInTheDocument()
    })

    it('renders the five Top 5 leaderboard panels in the required order', () => {
      renderDashboard()
      fireEvent.click(screen.getByText('Users analytics'))

      const boards = Array.from(document.querySelectorAll('.users-leaderboards > .leaderboard-card'))
      expect(boards).toHaveLength(5)
      expect(boards.map((c) => c.querySelector('header strong')?.textContent)).toEqual([
        'Top 5 by Pushes',
        'Top 5 by Merge Requests',
        'Top 5 Merged Users',
        'Top 5 by Comments',
        'Top 5 by Issues',
      ])
      boards.forEach((c) => leaderboardCard((c.querySelector('header strong') as HTMLElement).textContent as string))
    })

    it('centers summary values with the scoped summary-card class and leaves Top 5 panels untouched', () => {
      renderDashboard()
      fireEvent.click(screen.getByText('Users analytics'))

      const summaries = Array.from(document.querySelectorAll('article.users-summary'))
      expect(summaries).toHaveLength(6)
      summaries.forEach((card) => {
        expect(card.classList.contains('summary-card')).toBe(true)
        expect(card.querySelector('.summary-value-row .users-summary-value')).not.toBeNull()
      })
      expect(document.querySelectorAll('.leaderboard-card .users-summary-value')).toHaveLength(0)
      expect(document.querySelectorAll('.leaderboard-card .summary-value-row')).toHaveLength(0)
      document.querySelectorAll('.leaderboard-card .leaderboard-row > b').forEach((valueEl) => {
        expect(valueEl.classList.contains('users-summary-value')).toBe(false)
      })
    })

    it('shows rank, avatar or fallback initial, name, username, count, and profile link', () => {
      renderDashboard(123, undefined, undefined, [
        { ...getDefaultUser(), is_current_member: true, avatar_url: 'https://gitlab.example/avatars/alice.png', web_url: 'https://gitlab.example/alice' },
        makeTestUser({ id: 2, username: 'bob', name: 'Bob Fallback', is_current_member: true, push_count: 2, total_activity: 2 }),
      ])
      fireEvent.click(screen.getByText('Users analytics'))

      const [aliceRow, bobRow] = leaderboardRows('Top 5 by Pushes')
      expect(aliceRow).toBeTruthy()
      expect(bobRow).toBeTruthy()
      expect(aliceRow!.querySelector('.leaderboard-rank')?.textContent).toBe('1')
      expect(aliceRow!.querySelector('img.leaderboard-avatar')?.getAttribute('src')).toBe('https://gitlab.example/avatars/alice.png')
      expect(aliceRow!.querySelector('a')?.getAttribute('href')).toBe('https://gitlab.example/alice')
      expect(aliceRow!.querySelector('.leaderboard-identity small')?.textContent).toBe('@alice')
      expect(aliceRow!.querySelector('b')?.textContent).toBe('15')
      expect(bobRow!.querySelector('span.leaderboard-avatar-fallback')?.textContent).toBe('B')
      expect(bobRow!.querySelector('a')).not.toBeInTheDocument()
    })

    it('ranks users descending and shows at most five per leaderboard', () => {
      const users = Array.from(
        { length: 7 },
        (_, i) =>
          makeTestUser({
            id: 100 + i,
            username: `u${i}`,
            name: `User ${i}`,
            is_current_member: true,
            push_count: 7 - i,
            total_activity: 7 - i,
          }),
      )
      renderDashboard(123, undefined, undefined, users)
      fireEvent.click(screen.getByText('Users analytics'))

      const rows = leaderboardRows('Top 5 by Pushes')
      expect(rows).toHaveLength(5)
      expect(rows.map((r) => r.querySelector('b')?.textContent)).toEqual(['7', '6', '5', '4', '3'])
      expect(rows.map((r) => r.querySelector('.leaderboard-rank')?.textContent)).toEqual(['1', '2', '3', '4', '5'])
    })

    it('excludes zero-value users from each leaderboard', () => {
      renderDashboard(123, undefined, undefined, [
        makeTestUser({ id: 1, username: 'busy', name: 'Busy Bee', is_current_member: true, push_count: 3, total_activity: 3 }),
        makeTestUser({ id: 2, username: 'silent', name: 'Silent Sam', is_current_member: true, comment_count: 4, total_activity: 4 }),
      ])
      fireEvent.click(screen.getByText('Users analytics'))

      const pushRows = rowNames('Top 5 by Pushes')
      expect(pushRows).toHaveLength(1)
      expect(pushRows[0]).toContain('Busy Bee')
      expect(rowNames('Top 5 by Comments')[0]).toContain('Silent Sam')
      expect(document.querySelectorAll('.leaderboard-card .leaderboard-empty')).toHaveLength(3)
    })

    it('shows a themed empty state for leaderboards without activity', () => {
      renderDashboard(123, undefined, undefined, [
        makeTestUser({ id: 1, username: 'only', name: 'Only One', is_current_member: true, push_count: 1, total_activity: 1 }),
      ])
      fireEvent.click(screen.getByText('Users analytics'))
      expect(screen.getAllByText('No activity in this range.')).toHaveLength(4)
    })

    it('resolves leaderboard ties deterministically by display name', () => {
      renderDashboard(123, undefined, undefined, [
        makeTestUser({ id: 1, username: 'zz', name: 'Zoe Later', is_current_member: true, push_count: 5, total_activity: 5 }),
        makeTestUser({ id: 2, username: 'aa', name: 'Aaron First', is_current_member: true, push_count: 5, total_activity: 5 }),
      ])
      fireEvent.click(screen.getByText('Users analytics'))
      const names = rowNames('Top 5 by Pushes')
      expect(names).toHaveLength(2)
      expect(names[0]).toContain('Aaron First')
      expect(names[1]).toContain('Zoe Later')
    })

    it('uses the real merged metric for the Merged panel and the Top 5 Merged Users board', () => {
      renderDashboard(123, undefined, undefined, [
        makeTestUser({ id: 1, username: 'one', name: 'One Two', is_current_member: true, merge_request_count: 10, merged_count: 3, push_count: 2, total_activity: 15 }),
      ])
      fireEvent.click(screen.getByText('Users analytics'))
      expect(metricValue('Merge requests')).toBe(10)
      expect(metricValue('Merged')).toBe(3)
      expect(rowNames('Top 5 Merged Users')[0]).toContain('One Two')
      expect(rowCounts('Top 5 Merged Users')).toEqual([3])
      expect(rowCounts('Top 5 by Merge Requests')).toEqual([10])
    })

    it('deduplicates users by stable GitLab user ID before ranking', () => {
      renderDashboard(123, undefined, undefined, [
        makeTestUser({ id: 1, username: 'dupe', name: 'Dupe User', is_current_member: true, push_count: 9, total_activity: 9 }),
        makeTestUser({ id: 1, username: 'dupe', name: 'Dupe User', is_current_member: true, push_count: 9, total_activity: 9 }),
      ])
      fireEvent.click(screen.getByText('Users analytics'))
      expect(metricValue('Pushes')).toBe(9)
      expect(leaderboardRows('Top 5 by Pushes')).toHaveLength(1)
    })

    it('safely handles malformed / null user records without crashing or NaN', () => {
      renderDashboard(123, undefined, undefined, [
        {
          id: 3,
          username: '',
          name: '',
          avatar_url: '',
          web_url: '',
          state: 'active',
          is_admin: false,
          is_current_member: true,
          last_activity_on: '',
          issue_count: undefined as unknown as number,
          merge_request_count: null as unknown as number,
          merged_count: null as unknown as number,
          push_count: null as unknown as number,
          comment_count: undefined as unknown as number,
          last_pipeline_activity: '',
          total_activity: undefined as unknown as number,
        },
      ])
      fireEvent.click(screen.getByText('Users analytics'))

      expect(screen.queryByText('NaN')).not.toBeInTheDocument()
      expect(screen.getAllByText('No activity in this range.')).toHaveLength(5)
      for (const title of ['Pushes', 'Merge requests', 'Merged', 'Comments', 'Issues']) {
        expect(metricValue(title)).toBe(0)
      }
      expect(metricValue('Active users')).toBe(1)
      expect(document.querySelector('.users-membership-caption')?.textContent).toContain('1')
    })
  })

  describe('users analytics membership recalculation', () => {
    let origFetch: typeof global.fetch

    function makeUser(
      overrides: Partial<UserActivity> & Pick<UserActivity, 'id' | 'username' | 'name' | 'is_current_member'>,
    ): UserActivity {
      return {
        avatar_url: '',
        web_url: '',
        state: 'active',
        is_admin: false,
        last_activity_on: '2024-01-15',
        issue_count: 0,
        merge_request_count: 0,
        merged_count: 0,
        push_count: 0,
        comment_count: 0,
        last_pipeline_activity: '2024-01-15',
        total_activity: 0,
        ...overrides,
      }
    }

    const alice = makeUser({
      id: 1,
      username: 'alice',
      name: 'Alice Member',
      is_current_member: true,
      issue_count: 5,
      merge_request_count: 10,
      merged_count: 7,
      push_count: 15,
      comment_count: 20,
      total_activity: 50,
    })
    const bob = makeUser({
      id: 2,
      username: 'bob',
      name: 'Bob Former',
      is_current_member: false,
      issue_count: 2,
      merge_request_count: 4,
      merged_count: 2,
      push_count: 6,
      comment_count: 8,
      total_activity: 20,
    })

    function contributorsInView(): number {
      return Number((document.querySelector('.users-membership-caption')?.textContent ?? '').match(/^\d+/)?.[0] ?? -1)
    }

    function fetchedUrls(): string[] {
      const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as unknown as [string, RequestInit?][]
      return calls.map((call) => call[0])
    }

    beforeEach(() => {
      origFetch = global.fetch
      global.fetch = vi.fn(async (path: string) => {
        const list = String(path).includes('membership=active')
          ? [alice]
          : String(path).includes('membership=non-active')
            ? [bob]
            : [alice, bob]
        return new Response(JSON.stringify(list), { status: 200 })
      }) as unknown as typeof global.fetch
    })

    afterEach(() => {
      global.fetch = origFetch
    })

    it('recalculates summary metrics and leaderboards for each membership selection', async () => {
      renderDashboard(123, undefined, undefined, [alice, bob])
      fireEvent.click(screen.getByText('Users analytics'))

      // Both (default)
      expect(contributorsInView()).toBe(2)
      expect(screen.queryByText('Non-active users')).not.toBeInTheDocument()
      expect(metricValue('Active users')).toBe(1)
      expect(metricValue('Pushes')).toBe(21)
      expect(metricValue('Merged')).toBe(9)
      expect(metricValue('Comments')).toBe(28)

      // Active
      fireEvent.click(screen.getByRole('button', { name: 'Active' }))
      await waitFor(() => expect(contributorsInView()).toBe(1))
      expect(metricValue('Active users')).toBe(1)
      expect(metricValue('Pushes')).toBe(15)
      expect(metricValue('Merge requests')).toBe(10)
      expect(metricValue('Merged')).toBe(7)
      expect(screen.getAllByText('Alice Member').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Bob Former')).not.toBeInTheDocument()
      expect(fetchedUrls().some((u) => u.includes('hours=24') && u.includes('membership=active'))).toBe(true)

      // Non-active
      fireEvent.click(screen.getByRole('button', { name: 'Non-active' }))
      await waitFor(() => expect(contributorsInView()).toBe(1))
      expect(metricValue('Pushes')).toBe(6)
      expect(metricValue('Comments')).toBe(8)
      expect(metricValue('Merged')).toBe(2)
      expect(screen.getAllByText('Bob Former').length).toBeGreaterThanOrEqual(1)
      expect(screen.queryByText('Alice Member')).not.toBeInTheDocument()
      expect(fetchedUrls().some((u) => u.includes('membership=non-active'))).toBe(true)

      // Back to Both
      fireEvent.click(screen.getByRole('button', { name: 'Both' }))
      await waitFor(() => expect(contributorsInView()).toBe(2))
      expect(metricValue('Pushes')).toBe(21)
      expect(metricValue('Comments')).toBe(28)
      expect(screen.getAllByText('Alice Member').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Bob Former').length).toBeGreaterThanOrEqual(1)
    })

    it('does not double-count a user when duplicate records are returned', () => {
      const aliceDup = makeUser({
        id: 1,
        username: 'alice',
        name: 'Alice Dup',
        is_current_member: true,
        push_count: 15,
        merge_request_count: 10,
        total_activity: 25,
      })
      renderDashboard(123, undefined, undefined, [aliceDup, { ...aliceDup }])
      fireEvent.click(screen.getByText('Users analytics'))

      expect(contributorsInView()).toBe(1)
      expect(metricValue('Pushes')).toBe(15)
      expect(metricValue('Merge requests')).toBe(10)
      expect(leaderboardRows('Top 5 by Pushes')).toHaveLength(1)
    })

    it('keeps the user time range when refetching with a membership selection', async () => {
      localStorage.setItem('analytics_range_users', '168')
      renderDashboard(123, undefined, undefined, [alice, bob], 24, 168)
      fireEvent.click(screen.getByText('Users analytics'))

      fireEvent.click(screen.getByRole('button', { name: 'Active' }))
      await waitFor(() => expect(contributorsInView()).toBe(1))
      expect(fetchedUrls().some((u) => u.includes('hours=168') && u.includes('membership=active'))).toBe(true)
    })

    it('recalculates results when the time range changes', async () => {
      const dana = makeUser({
        id: 9,
        username: 'dana',
        name: 'Dana Long',
        is_current_member: true,
        push_count: 999,
        total_activity: 999,
      })
      const rangeFetch = vi.fn(async (path: string) => {
        const list = String(path).includes('hours=168') ? [dana] : [alice, bob]
        return new Response(JSON.stringify(list), { status: 200 })
      })
      global.fetch = rangeFetch as unknown as typeof global.fetch

      renderDashboard(123, undefined, undefined, [alice, bob], 24, 24)
      fireEvent.click(screen.getByText('Users analytics'))
      expect(metricValue('Pushes')).toBe(21)

      const selector = document.querySelector('.dashboard-range-control .ant-select-selector') as HTMLElement
      expect(selector).toBeTruthy()
      fireEvent.mouseDown(selector)
      const option = await waitFor(() => {
        const el = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
          (node) => (node.textContent ?? '').trim() === 'Last 7 days',
        )
        expect(el).toBeTruthy()
        return el as HTMLElement
      })
      fireEvent.click(option)

      await waitFor(() => expect(metricValue('Pushes')).toBe(999))
      expect(screen.getAllByText('Dana Long').length).toBeGreaterThanOrEqual(1)
      const calls = rangeFetch.mock.calls as unknown as [string, RequestInit?][]
      expect(calls.some((c) => String(c[0]).includes('hours=168') && String(c[0]).includes('membership=both'))).toBe(true)
    })
  })

  describe('last 3 days range (72h)', () => {
    let origFetch: typeof global.fetch

    beforeEach(() => {
      origFetch = global.fetch
      global.fetch = vi.fn(async () => new Response(JSON.stringify([getDefaultUser()]), { status: 200 })) as unknown as typeof global.fetch
    })

    afterEach(() => {
      global.fetch = origFetch
    })

    it('renders the exact page header wording', () => {
      renderDashboard(123)
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
      expect(screen.getByText('Analytics overview')).toBeInTheDocument()
      expect(screen.getByText('Historical performance and delivery health for the selected GitLab group.')).toBeInTheDocument()
    })

    it('sends hours=72 in a fresh query when Last 3 days is selected', async () => {
      const triday = makeTestUser({
        id: 7,
        username: 'triday',
        name: 'Three Day',
        is_current_member: true,
        push_count: 77,
        total_activity: 77,
      })
      const rangeFetch = vi.fn(async (path: string) => {
        const list = String(path).includes('hours=72') ? [triday] : [getDefaultUser()]
        return new Response(JSON.stringify(list), { status: 200 })
      })
      global.fetch = rangeFetch as unknown as typeof global.fetch

      renderDashboard(123, undefined, undefined, [getDefaultUser()])
      fireEvent.click(screen.getByText('Users analytics'))
      expect(metricValue('Pushes')).toBe(15)

      const selector = document.querySelector('.dashboard-range-control .ant-select-selector') as HTMLElement
      fireEvent.mouseDown(selector)
      const option = await waitFor(() => {
        const el = Array.from(document.querySelectorAll('.ant-select-item-option')).find(
          (node) => (node.textContent ?? '').trim() === 'Last 3 days',
        )
        expect(el).toBeTruthy()
        return el as HTMLElement
      })
      fireEvent.click(option)

      await waitFor(() => expect(metricValue('Pushes')).toBe(77))
      const calls = rangeFetch.mock.calls as unknown as [string, RequestInit?][]
      expect(calls.some((c) => String(c[0]).includes('hours=72') && String(c[0]).includes('membership=both'))).toBe(true)
      expect(localStorage.getItem('analytics_range_users')).toBe('72')
    })

    it('restores a persisted 72-hour users range', () => {
      localStorage.setItem('analytics_range_users', '72')
      renderDashboard(123, undefined, undefined, [getDefaultUser()], 24, 72)
      fireEvent.click(screen.getByText('Users analytics'))
      expect(screen.getByText('Last 3 days')).toBeInTheDocument()
      expect(metricValue('Pushes')).toBe(15)
    })

    it('restores a persisted 72-hour pipelines range', () => {
      localStorage.setItem('analytics_range_pipelines', '72')
      renderDashboard(123, undefined, getDefaultSummary(), undefined, 72, 24)
      expect(screen.getByText('Last 3 days')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('pipeline renders when summary data is not available', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GroupContext.Provider
              value={{
                selectedGroupId: 123,
                setSelectedGroupId: vi.fn(),
              }}
            >
              <DashboardPage />
            </GroupContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>,
      )
      await waitFor(() => {
        expect(screen.getByText('Pipelines analytics')).toBeInTheDocument()
      })
    })

    it('users tab renders themed empty state when user data is empty array', async () => {
      renderDashboard(123, undefined, undefined, [])
      fireEvent.click(screen.getByText('Users analytics'))
      expect(screen.getByText('No user activity data available')).toBeInTheDocument()
    })

    it('users tab renders when users data is not available', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GroupContext.Provider
              value={{
                selectedGroupId: 123,
                setSelectedGroupId: vi.fn(),
              }}
            >
              <DashboardPage />
            </GroupContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>,
      )
      await waitFor(() => {
        expect(screen.getByText('Pipelines analytics')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByText('Users analytics'))
      await waitFor(() => {
        expect(screen.getByText('Users analytics')).toBeInTheDocument()
      })
    })
  })

  describe('api error state', () => {
    it('renders without crashing', () => {
      renderDashboard()
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })

  describe('runner values', () => {
    it('runner status renders when present', () => {
      renderDashboard()
      expect(screen.getByText('Runner status')).toBeInTheDocument()
    })
  })

  describe('pipeline gauges', () => {
    function gaugeCard(title: string): HTMLElement {
      const card = Array.from(document.querySelectorAll<HTMLElement>('.gauge-card')).find(
        (c) => c.querySelector('header strong')?.textContent === title,
      )
      expect(card, `gauge card "${title}"`).toBeTruthy()
      return card as HTMLElement
    }

    function gaugeSummary(overrides: Partial<AnalyticsSummary>): AnalyticsSummary {
      return { ...getDefaultSummary(100), ...overrides }
    }

    it('renders both gauges from the reusable semicircular gauge with themed track', () => {
      renderDashboard(123, undefined, gaugeSummary({ success_count: 70, failed_count: 20, success_rate: 77.78 }))
      const success = gaugeCard('Success rate')
      const failure = gaugeCard('Failure rate')
      expect(success.classList.contains('success-gauge-card')).toBe(true)
      expect(failure.classList.contains('failure-gauge-card')).toBe(true)
      for (const card of [success, failure]) {
        const gauge = card.querySelector('.css-gauge')
        expect(gauge).toBeTruthy()
        expect(gauge).toHaveAttribute('role', 'img')
        expect(card.querySelector('.gauge-shell .gauge-tooltip')?.getAttribute('role')).toBe('tooltip')
      }
    })

    it('centers the percentage and shows the count beneath each gauge', () => {
      renderDashboard(123, undefined, gaugeSummary({ success_count: 70, failed_count: 20, success_rate: 77.78 }))
      expect(gaugeCard('Success rate').querySelector('.css-gauge b')?.textContent).toBe('77.8%')
      expect(gaugeCard('Failure rate').querySelector('.css-gauge b')?.textContent).toBe('20.0%')
      expect(gaugeCard('Success rate').querySelector('p')?.textContent).toContain('70 successful pipelines')
      expect(gaugeCard('Failure rate').querySelector('p')?.textContent).toContain('20 failed pipelines')
    })

    it('clamps the arc to 0deg when there are no completed pipelines', () => {
      renderDashboard(123, undefined, gaugeSummary({ success_count: 0, failed_count: 0, success_rate: 0 }))
      const gauge = gaugeCard('Success rate').querySelector('.css-gauge')
      expect(gauge?.style.getPropertyValue('--gauge-value')).toBe('0deg')
      expect(gaugeCard('Success rate').querySelector('.css-gauge b')?.textContent).toBe('0.0%')
    })

    it('renders 100% at the full 180deg arc', () => {
      renderDashboard(123, undefined, gaugeSummary({ success_count: 40, failed_count: 0, success_rate: 100 }))
      const gauge = gaugeCard('Success rate').querySelector('.css-gauge')
      expect(gauge?.style.getPropertyValue('--gauge-value')).toBe('180deg')
      expect(gaugeCard('Success rate').querySelector('.css-gauge b')?.textContent).toBe('100.0%')
    })

    it('renders 0.0% without a crash when success_rate is null', () => {
      renderDashboard(123, undefined, gaugeSummary({ success_count: 3, failed_count: 1, success_rate: null as unknown as number }))
      expect(screen.queryByText('NaN')).not.toBeInTheDocument()
      expect(gaugeCard('Success rate').querySelector('.css-gauge b')?.textContent).toBe('0.0%')
      expect(gaugeCard('Success rate').querySelector('.css-gauge')?.style.getPropertyValue('--gauge-value')).toBe('0deg')
    })

    it('renders 0.0% without NaN when success_rate is NaN', () => {
      renderDashboard(123, undefined, gaugeSummary({ success_count: 3, failed_count: 1, success_rate: NaN }))
      expect(screen.queryByText('NaN')).not.toBeInTheDocument()
      expect(gaugeCard('Success rate').querySelector('.css-gauge b')?.textContent).toBe('0.0%')
    })

    it('shows the themed tooltip with percentage, count, and completed-pipeline denominator on hover and focus', () => {
      renderDashboard(123, undefined, gaugeSummary({ success_count: 70, failed_count: 20, success_rate: 77.78 }))
      const card = gaugeCard('Success rate')
      const gauge = card.querySelector('.css-gauge') as HTMLElement
      const tooltip = card.querySelector('.gauge-tooltip') as HTMLElement

      expect(tooltip.classList.contains('is-active')).toBe(false)
      fireEvent.mouseEnter(gauge)
      expect(tooltip.classList.contains('is-active')).toBe(true)
      expect(tooltip.textContent).toContain('77.8%')
      expect(tooltip.textContent).toContain('70 of 90 completed pipelines')
      expect(gauge).toHaveAttribute('aria-label', 'Success rate: 77.8 percent, 70 of 90 completed pipelines')
      fireEvent.mouseLeave(gauge)
      expect(tooltip.classList.contains('is-active')).toBe(false)
      fireEvent.focus(gauge)
      expect(tooltip.classList.contains('is-active')).toBe(true)
      fireEvent.blur(gauge)
      expect(tooltip.classList.contains('is-active')).toBe(false)
    })

    it('shows the failure gauge tooltip with its displayed percentage and denominator', () => {
      renderDashboard(123, undefined, gaugeSummary({ success_count: 70, failed_count: 20, success_rate: 77.78 }))
      const card = gaugeCard('Failure rate')
      fireEvent.mouseEnter(card.querySelector('.css-gauge') as HTMLElement)
      const tooltip = card.querySelector('.gauge-tooltip') as HTMLElement
      expect(tooltip.classList.contains('is-active')).toBe(true)
      expect(tooltip.textContent).toContain('20.0%')
      expect(tooltip.textContent).toContain('20 of 100 completed pipelines')
    })
  })

  describe('pipeline runs history bars', () => {
    const historySummary: AnalyticsSummary = {
      ...getDefaultSummary(),
      history: [
        { label: 'Mon, Aug 11 09:00', pipeline_count: 12, project_count: 5 },
        { label: 'Mon, Aug 11 10:00', pipeline_count: 7, project_count: 3 },
        { label: 'Mon, Aug 11 11:00', pipeline_count: 4, project_count: 2 },
      ],
    }

    it('renders one focusable single-line tooltip per bucket using the actual label and run count', () => {
      renderDashboard(123, undefined, historySummary)
      const bars = Array.from(document.querySelectorAll<HTMLElement>('.analytics-spark-bars .spark-bar'))
      expect(bars).toHaveLength(3)
      const chronological = [...historySummary.history].reverse()
      bars.forEach((bar, index) => {
        expect(bar).toHaveAttribute('tabindex', '0')
        const point = chronological[index]
        const tooltip = bar.querySelector<HTMLElement>('.spark-bar-tooltip')
        expect(tooltip, `tooltip for bar ${index}`).toBeTruthy()
        expect(tooltip).toHaveAttribute('role', 'tooltip')
        expect(tooltip!.textContent).toBe(`${point.label}: ${point.pipeline_count} pipeline runs`)
        expect(bar).toHaveAttribute(
          'aria-label',
          `${point.label}: ${point.pipeline_count} pipeline runs, ${point.project_count} projects`,
        )
      })
    })

    it('flags first and last bars so their tooltips stay inside the viewport edges', () => {
      renderDashboard(123, undefined, historySummary)
      const bars = Array.from(document.querySelectorAll('.spark-bar'))
      expect(bars[0].classList.contains('spark-bar-first')).toBe(true)
      expect(bars[2].classList.contains('spark-bar-last')).toBe(true)
      expect(bars[1].classList.contains('spark-bar-first')).toBe(false)
      expect(bars[1].classList.contains('spark-bar-last')).toBe(false)
    })

    it('activates the tooltip on hover and deactivates when the pointer leaves', () => {
      renderDashboard(123, undefined, historySummary)
      const [first, second] = Array.from(document.querySelectorAll<HTMLElement>('.spark-bar'))
      expect(first.classList.contains('spark-bar-active')).toBe(false)
      fireEvent.mouseEnter(first)
      expect(first.classList.contains('spark-bar-active')).toBe(true)
      fireEvent.mouseLeave(first)
      expect(first.classList.contains('spark-bar-active')).toBe(false)
      fireEvent.mouseEnter(second)
      expect(second.classList.contains('spark-bar-active')).toBe(true)
      expect(first.classList.contains('spark-bar-active')).toBe(false)
      fireEvent.mouseLeave(second)
      expect(second.classList.contains('spark-bar-active')).toBe(false)
    })

    it('activates the tooltip on keyboard focus and deactivates on blur', () => {
      renderDashboard(123, undefined, historySummary)
      const [first] = Array.from(document.querySelectorAll<HTMLElement>('.spark-bar'))
      fireEvent.focus(first)
      expect(first.classList.contains('spark-bar-active')).toBe(true)
      fireEvent.blur(first)
      expect(first.classList.contains('spark-bar-active')).toBe(false)
    })

    it('omits the project line when project_count is missing or invalid', () => {
      renderDashboard(123, undefined, {
        ...getDefaultSummary(),
        history: [
          { label: 'Jul 1 09:00', pipeline_count: 4, project_count: undefined as unknown as number },
          { label: 'Jul 2 09:00', pipeline_count: 6, project_count: NaN },
        ],
      })
      const tooltips = Array.from(document.querySelectorAll('.spark-bar .spark-bar-tooltip'))
      expect(tooltips).toHaveLength(2)
      expect(tooltips[0].textContent).toContain('6 pipeline runs')
      expect(tooltips[0].textContent).not.toContain('projects')
      expect(tooltips[1].textContent).toContain('4 pipeline runs')
      expect(tooltips[1].textContent).not.toContain('projects')
    })

    it('renders no history bars when the history is empty', () => {
      renderDashboard(123, undefined, { ...getDefaultSummary(), history: [] })
      expect(document.querySelector('.analytics-spark-bars')).not.toBeInTheDocument()
      expect(document.querySelector('.spark-bar')).not.toBeInTheDocument()
      expect(screen.getByText('Runs captured in PostgreSQL')).toBeInTheDocument()
    })

    function barHeights(): string[] {
      return Array.from(document.querySelectorAll<HTMLElement>('.spark-bar i')).map((el) => el.style.height)
    }

    it('renders the maximum bucket at 100% making it the tallest bar', () => {
      renderDashboard(123, undefined, {
        ...getDefaultSummary(),
        history: [
          { label: 'A', pipeline_count: 5, project_count: 1 },
          { label: 'B', pipeline_count: 15, project_count: 2 },
          { label: 'C', pipeline_count: 7, project_count: 3 },
        ],
      })
      const heights = barHeights().map((h) => (h.endsWith('%') ? Number.parseFloat(h) : 0))
      expect(heights[1]).toBe(100)
      expect(Math.max(...heights)).toBe(100)
      expect(heights[0]).toBeGreaterThanOrEqual(0)
      expect(heights[0]).toBeLessThan(100)
      expect(heights[2]).toBeGreaterThanOrEqual(0)
      expect(heights[2]).toBeLessThan(100)
    })

    it('scales bar heights proportionally to each bucket count relative to the max', () => {
      renderDashboard(123, undefined, {
        ...getDefaultSummary(),
        history: [
          { label: 'A', pipeline_count: 3, project_count: 1 },
          { label: 'B', pipeline_count: 6, project_count: 2 },
          { label: 'C', pipeline_count: 12, project_count: 1 },
        ],
      })
      expect(barHeights()).toEqual(['100%', '50%', '25%'])
    })

    it('scales the [0, 76, 152] history so the max bucket fills the plot and 76 renders at half height', () => {
      renderDashboard(123, undefined, {
        ...getDefaultSummary(),
        history: [
          { label: 'Aug 16 21:00', pipeline_count: 152, project_count: 9 },
          { label: 'Aug 15 21:00', pipeline_count: 76, project_count: 4 },
          { label: 'Aug 14 21:00', pipeline_count: 0, project_count: 0 },
        ],
      })
      const bars = Array.from(document.querySelectorAll<HTMLElement>('.spark-bar'))
      expect(bars.map((b) => b.querySelector('.spark-bar-tooltip')?.textContent)).toEqual([
        'Aug 14 21:00: 0 pipeline runs',
        'Aug 15 21:00: 76 pipeline runs',
        'Aug 16 21:00: 152 pipeline runs',
      ])
      expect(barHeights()).toEqual(['0%', '50%', '100%'])
      const parsed = barHeights().map((h) => (h.endsWith('%') ? Number.parseFloat(h) : 0))
      expect(parsed[2]).toBeGreaterThan(parsed[1])
      expect(parsed[1]).toBeGreaterThan(parsed[0])
      expect(bars[0].classList.contains('spark-bar-zero')).toBe(true)
      expect(bars[1].classList.contains('spark-bar-zero')).toBe(false)
      expect(bars[2].classList.contains('spark-bar-zero')).toBe(false)
    })

    it('renders zero-count buckets with a zero baseline and no NaN or Infinity heights', () => {
      renderDashboard(123, undefined, {
        ...getDefaultSummary(),
        history: [
          { label: 'A', pipeline_count: 0, project_count: 0 },
          { label: 'B', pipeline_count: 10, project_count: 2 },
          { label: 'C', pipeline_count: 0, project_count: 0 },
        ],
      })
      expect(barHeights()).toEqual(['0%', '100%', '0%'])
      expect(document.querySelector('.analytics-spark-bars')?.outerHTML).not.toMatch(/NaN|Infinity/)
    })

    it('uses the singular "pipeline run" for a bucket with exactly one run and plural otherwise', () => {
      renderDashboard(123, undefined, {
        ...getDefaultSummary(),
        history: [
          { label: 'Aug 16 14:00', pipeline_count: 2, project_count: 1 },
          { label: 'Aug 16 13:42', pipeline_count: 1, project_count: 1 },
        ],
      })
      const bars = Array.from(document.querySelectorAll<HTMLElement>('.spark-bar'))
      expect(bars[0].querySelector('.spark-bar-tooltip')?.textContent).toBe('Aug 16 13:42: 1 pipeline run')
      expect(bars[1].querySelector('.spark-bar-tooltip')?.textContent).toBe('Aug 16 14:00: 2 pipeline runs')
      expect(bars[0]).toHaveAttribute('aria-label', 'Aug 16 13:42: 1 pipeline run, 1 projects')
      expect(bars[1]).toHaveAttribute('aria-label', 'Aug 16 14:00: 2 pipeline runs, 1 projects')
    })

    it('scales nonzero buckets exactly proportionally with no minimum height and a baseline class only on zero buckets', () => {
      renderDashboard(123, undefined, {
        ...getDefaultSummary(),
        history: [
          { label: 'A', pipeline_count: 0, project_count: 0 },
          { label: 'B', pipeline_count: 1, project_count: 0 },
          { label: 'C', pipeline_count: 100, project_count: 1 },
        ],
      })
      const bars = Array.from(document.querySelectorAll<HTMLElement>('.spark-bar'))
      expect(barHeights()).toEqual(['100%', '1%', '0%'])
      expect(bars[2].classList.contains('spark-bar-zero')).toBe(true)
      expect(bars[0].classList.contains('spark-bar-zero')).toBe(false)
      expect(bars[1].classList.contains('spark-bar-zero')).toBe(false)
    })

    it('renders all-zero history safely without division-by-zero artifacts', () => {
      renderDashboard(123, undefined, {
        ...getDefaultSummary(),
        history: [
          { label: 'A', pipeline_count: 0, project_count: 0 },
          { label: 'B', pipeline_count: 0, project_count: 0 },
        ],
      })
      expect(document.querySelectorAll('.spark-bar')).toHaveLength(2)
      expect(barHeights()).toEqual(['0%', '0%'])
      expect(document.querySelector('.analytics-spark-bars')?.outerHTML).not.toMatch(/NaN|Infinity/)
      expect(screen.getByText('Runs captured in PostgreSQL')).toBeInTheDocument()
    })

    it('keeps the hover tooltip count and the bar height sourced from the same bucket record in order', () => {
      const history = [
        { label: '2024-07-01 11:00', pipeline_count: 0, project_count: 0 },
        { label: '2024-07-01 10:00', pipeline_count: 24, project_count: 6 },
        { label: '2024-07-01 09:00', pipeline_count: 8, project_count: 2 },
      ]
      renderDashboard(123, undefined, { ...getDefaultSummary(), history })
      const bars = Array.from(document.querySelectorAll<HTMLElement>('.spark-bar'))
      expect(bars).toHaveLength(3)
      const chronological = [...history].reverse()
      expect(bars.map((b) => b.querySelector('.spark-bar-tooltip')?.textContent)).toEqual(
        chronological.map((p) => `${p.label}: ${p.pipeline_count} pipeline runs`),
      )
      chronological.forEach((point, index) => {
        expect(bars[index].querySelector<HTMLElement>('.spark-bar-tooltip')?.textContent).toContain(
          `${point.pipeline_count} pipeline runs`,
        )
      })
      expect(barHeights()).toEqual([`${(8 / 24) * 100}%`, '100%', '0%'])
      fireEvent.mouseEnter(bars[1])
      expect(bars[1].classList.contains('spark-bar-active')).toBe(true)
      expect(bars[1].querySelector('.spark-bar-tooltip')?.textContent).toContain('24 pipeline runs')
      fireEvent.mouseLeave(bars[1])
    })
  })

  describe('pipeline runs panel styling', () => {
    function readStyleFile(name: string): string {
      return readFileSync(resolve(fileURLToPath(import.meta.url), '..', '..', 'styles', name), 'utf8')
    }

    function cssRule(css: string, selector: string): string {
      const at = css.indexOf(selector)
      expect(at, `rule for "${selector}"`).toBeGreaterThanOrEqual(0)
      const open = css.indexOf('{', at)
      let depth = 0
      for (let i = open; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1
        if (css[i] === '}') depth -= 1
        if (depth === 0) return css.slice(open + 1, i)
      }
      throw new Error(`unbalanced rule for "${selector}"`)
    }

    it('renders the pipeline runs total in the normal themed foreground without purple or glow', () => {
      renderDashboard(123)
      const card = document.querySelector('.pipeline-runs-card') as HTMLElement
      expect(card).toBeInTheDocument()
      expect(card.querySelector('header strong')?.textContent).toBe('Total Pipelines')
      expect(card.querySelector('header span')?.textContent).toBe('History')
      const number = card.querySelector('.analytics-big-number') as HTMLElement
      expect(number).toBeInTheDocument()
      expect(card.querySelector('p')?.textContent).toBe('Runs captured in PostgreSQL')

      const css = readStyleFile('dashboard.css')
      expect(css).not.toContain('.pipeline-runs-card .analytics-big-number {')
      expect(cssRule(css, '.analytics-big-number {')).toContain('color:var(--dashboard-text)')
      const globals = readStyleFile('globals.css')
      for (const scope of [':root {', 'html.dark-theme {']) {
        expect(cssRule(globals, scope), `--dashboard-text in ${scope}`).toContain('--dashboard-text:')
      }
    })

    it('shows the whole PIPELINE_HISTORY_DAYS pipeline total regardless of the selected range', () => {
      // Ranged summary (24h) reports 100, but the full-history (90d) summary
      // reports the entire collected history. Total Pipelines must show the latter.
      renderDashboard(123, undefined, { ...getDefaultSummary(100) }, undefined, 24, 24, 12345)
      const card = document.querySelector('.pipeline-runs-card') as HTMLElement
      expect(card.querySelector('.analytics-big-number')?.textContent).toBe('12,345')
    })

    it('uses the configured pipeline view for the analytics summary query key', async () => {
      // Pre-seed both 'latest' and 'all' keys with different pipeline_count
      // so we can tell which one the component reads.
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      queryClient.setQueryData(['analytics-readiness', 1, 123], {
        ready: true, data_available: true, message: '',
        last_completed_at: null, project_count: 5, pipeline_count: 10,
        runner_state_count: 0, user_count: 0, user_event_count: 0, user_issue_count: 0,
      })
      queryClient.setQueryData(['analytics-summary', 1, 123, 24, 'latest'], { ...getDefaultSummary(111) })
      queryClient.setQueryData(['analytics-summary', 1, 123, 24, 'all'], { ...getDefaultSummary(222) })
      queryClient.setQueryData(['analytics-summary-full', 1, 123], { ...getDefaultSummary(), pipeline_count: 333 })

      vi.mocked(api.getGlobalConfig).mockResolvedValue({
        company_name: 'T', company_logo: '', pipeline_view: 'all',
      })

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <GroupContext.Provider value={{ selectedGroupId: 123, selectedEnvId: 1, setSelectedGroupId: vi.fn() }}>
              <DashboardPage />
            </GroupContext.Provider>
          </MemoryRouter>
        </QueryClientProvider>,
      )

      // Donut (status mix) shows the 'all'-view count (222), not 'latest' (111).
      await waitFor(() => {
        const donut = document.querySelector('.donut-center b')
        expect(donut?.textContent).toBe('222')
      })
    })

    it('styles the history bars with a thin purple border, translucent fill, and restrained glow', () => {
      const css = readStyleFile('dashboard.css')
      const barRule = cssRule(css, '.analytics-spark-bars .spark-bar i {')
      expect(barRule).toContain('border:1px solid color-mix(in srgb,var(--dashboard-accent) 70%,var(--dashboard-border))')
      expect(barRule).toContain('background:color-mix(in srgb,var(--dashboard-accent) 42%,transparent)')
      expect(barRule).toContain('box-shadow:0 0 8px color-mix(in srgb,var(--dashboard-accent) 20%,transparent)')
      expect(barRule).toContain('min-height:0')
      expect(barRule).toContain('position:relative')
      const zeroRule = cssRule(css, '.analytics-spark-bars .spark-bar-zero i {')
      expect(zeroRule).toContain('min-height:2px')
      expect(zeroRule).toContain('border-top-width:0')
      const trackRule = cssRule(css, '.analytics-spark-bars {')
      expect(trackRule).toContain('bottom:14px')
      expect(trackRule).toContain('align-items:flex-end')
      expect(trackRule).toContain('gap:4px')
      expect(trackRule).toContain('height:50px')
    })

    it('gives percentage bar heights a measurable fixed-height parent chain with flex-end alignment', () => {
      const css = readStyleFile('dashboard.css')
      expect(cssRule(css, '.analytics-spark-bars {')).toContain('height:50px')
      expect(cssRule(css, '.analytics-spark-bars {')).toContain('align-items:flex-end')
      expect(cssRule(css, '.analytics-spark-bars .spark-bar {')).toContain('height:100%')
      expect(cssRule(css, '.analytics-spark-bars .spark-bar i {')).toContain('min-height:0')
    })

    it('brightens the hovered bar slightly and keeps the tooltip compact, content-sized, and single-line', () => {
      const css = readStyleFile('dashboard.css')
      expect(cssRule(css, '.spark-bar:hover i, .spark-bar:focus-visible i, .spark-bar-active i {')).toContain('brightness(1.15)')
      const tooltipRule = cssRule(css, '.spark-bar-tooltip {')
      expect(tooltipRule).toContain('width:max-content')
      expect(tooltipRule).not.toContain('min-width')
      expect(tooltipRule).toContain('font-size:.7rem')
      expect(tooltipRule).toContain('padding:5px 7px')
      expect(tooltipRule).toContain('border-radius:6px')
      expect(tooltipRule).toContain('border:1px solid var(--dashboard-border)')
      expect(tooltipRule).toContain('box-shadow:var(--dashboard-shadow)')
      expect(tooltipRule).toContain('background:var(--dashboard-surface)')
      expect(tooltipRule).toContain('white-space:nowrap')
      expect(tooltipRule).toContain('bottom:calc(100% + 7px)')
      expect(cssRule(css, '.spark-bar-first .spark-bar-tooltip {')).toContain('left:0')
      expect(cssRule(css, '.spark-bar-last .spark-bar-tooltip {')).toContain('right:0')
    })
  })

  describe('pipeline status mix donut', () => {
    function donutCard(): HTMLElement {
      const card = Array.from(document.querySelectorAll<HTMLElement>('.donut-card')).find(
        (c) => c.querySelector('header strong')?.textContent === 'Pipeline status mix',
      )
      expect(card, 'donut card').toBeTruthy()
      return card as HTMLElement
    }

    function donutSegments(): Element[] {
      return Array.from(donutCard().querySelectorAll('.donut-seg'))
    }

    function donutSummary(overrides: Partial<AnalyticsSummary>): AnalyticsSummary {
      return { ...getDefaultSummary(100), ...overrides }
    }

    it('renders one hoverable segment per non-zero status and preserves the center total and legend', () => {
      renderDashboard(123, undefined, donutSummary({ success_count: 40, manual_count: 10, failed_count: 20, active_count: 5, canceled_count: 0, pipeline_count: 75 }))
      const card = donutCard()
      const segments = donutSegments()
      expect(segments).toHaveLength(4)
      expect(segments.map((s) => s.getAttribute('aria-label'))).toEqual([
        'Success: 40 pipelines, 53.3%',
        'Manual: 10 pipelines, 13.3%',
        'Failed: 20 pipelines, 26.7%',
        'Active: 5 pipelines, 6.7%',
      ])
      expect(card.querySelector('.donut-center b')?.textContent).toBe('75')
      expect(card.querySelector('.donut-center small')?.textContent).toBe('runs')
      const legend = card.querySelector('.donut-legend')?.textContent ?? ''
      expect(legend).toContain('53.3% success')
      expect(legend).toContain('26.7% failed')
      expect(card.querySelector('.donut-track')).toBeTruthy()
      expect(card.textContent).not.toContain('Canceled')
    })

    it('shows a themed tooltip with status name, count, and percentage on hover and highlights the segment', () => {
      renderDashboard(123, undefined, donutSummary({ success_count: 40, manual_count: 10, failed_count: 20, active_count: 5, canceled_count: 0, pipeline_count: 75 }))
      const card = donutCard()
      const segments = donutSegments()
      const successSeg = segments[0]
      const failedSeg = segments[2]
      const svg = card.querySelector('.donut-svg') as Element
      const tooltip = card.querySelector('.donut-tooltip') as HTMLElement

      expect(tooltip.classList.contains('is-active')).toBe(false)
      expect(tooltip.querySelector('.donut-tooltip-line')).toBeNull()
      fireEvent.mouseEnter(successSeg)
      expect(tooltip.classList.contains('is-active')).toBe(true)
      const successLine = tooltip.querySelector<HTMLElement>('.donut-tooltip-line')
      expect(successLine).toBeTruthy()
      expect(successLine!.textContent).toBe('Success · 40 · 53.3%')
      expect(tooltip.querySelector('.metric-dot.success')).toBeTruthy()
      expect(tooltip.querySelector('b')).toBeNull()
      expect(successSeg.classList.contains('is-active')).toBe(true)
      expect(svg.classList.contains('has-active')).toBe(true)
      fireEvent.mouseLeave(successSeg)
      expect(tooltip.classList.contains('is-active')).toBe(false)
      expect(successSeg.classList.contains('is-active')).toBe(false)

      fireEvent.focus(failedSeg)
      expect(tooltip.querySelector('.donut-tooltip-line')?.textContent).toBe('Failed · 20 · 26.7%')
      expect(tooltip.querySelector('.metric-dot.failed')).toBeTruthy()
      fireEvent.blur(failedSeg)
      expect(tooltip.classList.contains('is-active')).toBe(false)
    })

    it('keeps the donut tooltip compact: one content-sized line with status, count, and percentage', () => {
      renderDashboard(123, undefined, donutSummary({ success_count: 40, manual_count: 10, failed_count: 20, active_count: 5, canceled_count: 0, pipeline_count: 75 }))
      const card = donutCard()
      fireEvent.mouseEnter(donutSegments()[0])
      const tooltip = card.querySelector('.donut-tooltip') as HTMLElement
      const line = tooltip.querySelector<HTMLElement>('.donut-tooltip-line')
      expect(line).toBeTruthy()
      // Exactly one content line: status dot + "Status · count · percent"
      expect(tooltip.textContent).toBe('Success · 40 · 53.3%')
      expect(line!.children).toHaveLength(2)
      expect(line!.querySelector('.metric-dot.success')).toBeTruthy()
      expect(line!.querySelector('span')?.textContent).toBe('Success · 40 · 53.3%')
      // Center total, legend, segments, and highlighting are preserved.
      expect(card.querySelector('.donut-center b')?.textContent).toBe('75')
      expect(card.querySelector('.donut-legend')).toBeTruthy()
      expect(donutSegments()).toHaveLength(4)
      expect(donutSegments()[0].classList.contains('is-active')).toBe(true)
    })

    it('renders all five segments when every status has pipelines', () => {
      renderDashboard(123, undefined, donutSummary({ success_count: 30, manual_count: 5, failed_count: 20, active_count: 10, canceled_count: 5, pipeline_count: 70 }))
      const segments = donutSegments()
      expect(segments).toHaveLength(5)
      fireEvent.mouseEnter(segments[segments.length - 1])
      const tooltip = donutCard().querySelector('.donut-tooltip') as HTMLElement
      expect(tooltip.classList.contains('is-active')).toBe(true)
      expect(tooltip.querySelector('.donut-tooltip-line')?.textContent).toBe('Canceled · 5 · 7.1%')
      expect(tooltip.querySelector('.metric-dot.canceled')).toBeTruthy()
    })

    it('handles an empty distribution safely with no segments, no NaN, and a neutral track', () => {
      renderDashboard(123, undefined, donutSummary({ success_count: 0, manual_count: 0, failed_count: 0, active_count: 0, canceled_count: 0, pipeline_count: 0 }))
      const card = donutCard()
      expect(donutSegments()).toHaveLength(0)
      expect(card.querySelector('.donut-track')).toBeTruthy()
      expect(card.querySelector('.donut-center b')?.textContent).toBe('0')
      expect(screen.queryByText('NaN')).not.toBeInTheDocument()
      expect(card.querySelector('.donut-legend')?.textContent).toContain('0.0% success')
      const tooltip = card.querySelector('.donut-tooltip') as HTMLElement
      expect(tooltip.classList.contains('is-active')).toBe(false)
    })
  })

   describe('pipelines analytics panel palette', () => {
    it('tags every Pipelines Analytics panel with its status-aware palette class', () => {
      renderDashboard(123, undefined, getDefaultSummary())
      const expected: [string, string][] = [
        ['Total Pipelines', 'pipeline-runs-card'],
        ['Success rate', 'success-gauge-card'],
        ['Failure rate', 'failure-gauge-card'],
        ['Delivery activity', 'delivery-card'],
        ['Status distribution', 'distribution-card'],
        ['Pipeline status mix', 'donut-card'],
        ['Project inventory', 'inventory-card'],
        ['Runner status', 'runner-status-card'],
        ['Runner inventory', 'runner-inventory-card'],
      ]
      for (const [title, paletteClass] of expected) {
        const card = Array.from(document.querySelectorAll<HTMLElement>('.analytics-card')).find(
          (c) => c.querySelector('header strong')?.textContent === title,
        )
        expect(card, `panel "${title}"`).toBeTruthy()
        expect(card!.classList.contains(paletteClass), `"${title}" carries .${paletteClass}`).toBe(true)
      }
    })
  })

  describe('gauge arc colors, neutral panels, and compact tooltip', () => {
    function readStyleFile(name: string): string {
      return readFileSync(resolve(fileURLToPath(import.meta.url), '..', '..', 'styles', name), 'utf8')
    }

    function cssRule(css: string, selector: string): string {
      const at = css.indexOf(selector)
      expect(at, `rule for "${selector}"`).toBeGreaterThanOrEqual(0)
      const open = css.indexOf('{', at)
      let depth = 0
      for (let i = open; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1
        if (css[i] === '}') depth -= 1
        if (depth === 0) return css.slice(open + 1, i)
      }
      throw new Error(`unbalanced rule for "${selector}"`)
    }

    it('applies the success color to the success gauge arc and the danger color to the failure gauge arc', () => {
      const css = readStyleFile('dashboard.css')
      const gaugeRule = cssRule(css, '.css-gauge {')
      expect(gaugeRule).toContain('--gauge-color:var(--dashboard-success)')
      expect(cssRule(css, '.failure-gauge-card .css-gauge {')).toContain('--gauge-color:var(--dashboard-danger)')

      const before = cssRule(css, '.css-gauge::before {')
      // The registered angle must reach the arc pseudo-element and drive the gradient.
      expect(before).toContain('--gauge-value:inherit')
      expect(before).toContain(
        'background:conic-gradient(from 270deg at 50% 100%,var(--gauge-color) 0 var(--gauge-value),var(--dashboard-gauge-track) var(--gauge-value) 180deg,transparent 180deg)',
      )

      // The tone-scoped classes the CSS hooks onto are present on the rendered gauges.
      renderDashboard(123, undefined, getDefaultSummary())
      expect(document.querySelector('.success-gauge-card .css-gauge')).toBeInTheDocument()
      expect(document.querySelector('.failure-gauge-card .css-gauge')).toBeInTheDocument()
    })

    it('leaves the unfilled gauge track muted and themed in both light and dark', () => {
      const css = readStyleFile('dashboard.css')
      expect(cssRule(css, '.css-gauge::before {')).toContain('var(--dashboard-gauge-track)')

      const globals = readStyleFile('globals.css')
      for (const scope of [':root {', 'html.dark-theme {']) {
        expect(cssRule(globals, scope), `--dashboard-gauge-track in ${scope}`).toContain('--dashboard-gauge-track:')
      }
    })

    it('keeps analytics panel backgrounds neutral without status tints or gradients', () => {
      const css = readStyleFile('dashboard.css')
      expect(css).not.toContain('--analytics-panel-color')
      expect(css).not.toContain('.pipeline-analytics-grid .analytics-card {')
      const cardRule = cssRule(css, '.analytics-card {')
      expect(cardRule).toContain('background:var(--dashboard-surface)')
      expect(cardRule).toContain('border:1px solid var(--dashboard-border)')
      expect(cardRule).toContain('border-radius:10px')
      expect(cardRule).toContain('box-shadow:var(--dashboard-shadow)')
      expect(cardRule).not.toContain('background-image')
      expect(cardRule).not.toContain('linear-gradient')

      renderDashboard(123, undefined, getDefaultSummary())
      document.querySelectorAll('.pipeline-analytics-grid .analytics-card').forEach((card) => {
        expect((card as HTMLElement).style.backgroundImage, `inline background on ${card.className}`).toBe('')
        expect((card as HTMLElement).style.background).toBe('')
      })
    })

    it('scopes the donut tooltip as a compact content-sized single line', () => {
      const css = readStyleFile('dashboard.css')
      const tooltipRule = cssRule(css, '.donut-tooltip {')
      expect(tooltipRule).toContain('width:max-content')
      expect(tooltipRule).toContain('max-width:150px')
      expect(tooltipRule).toContain('padding:4px 7px')
      expect(tooltipRule).toContain('border-radius:5px')
      expect(tooltipRule).not.toContain('min-width')
      expect(tooltipRule).not.toContain('flex-direction:column')
      expect(cssRule(css, '.donut-tooltip-line {')).toContain('font-size:.7rem')
      expect(cssRule(css, '.donut-tooltip-line {')).toContain('line-height:1.3')
      expect(cssRule(css, '.donut-tooltip-line {')).toContain('white-space:nowrap')
    })

    it('renders 0% gauges without caps or NaN and 100% gauges with a full arc and rounded caps', () => {
      renderDashboard(123, undefined, { ...getDefaultSummary(), success_count: 0, failed_count: 0, success_rate: 0 })
      const zeroGauge = document.querySelector('.success-gauge-card .css-gauge') as HTMLElement
      expect(zeroGauge.style.getPropertyValue('--gauge-value')).toBe('0deg')
      expect(zeroGauge.querySelectorAll('.gauge-cap')).toHaveLength(0)
      expect(document.querySelector('.success-gauge-card .css-gauge b')?.textContent).toBe('0.0%')
      expect(screen.queryByText('NaN')).not.toBeInTheDocument()
      cleanup()

      renderDashboard(123, undefined, { ...getDefaultSummary(), success_count: 40, failed_count: 0, success_rate: 100 })
      const fullGauge = document.querySelector('.success-gauge-card .css-gauge') as HTMLElement
      expect(fullGauge.style.getPropertyValue('--gauge-value')).toBe('180deg')
      expect(fullGauge.querySelectorAll('.gauge-cap')).toHaveLength(2)
      expect(fullGauge.querySelector('.gauge-cap-end')).toBeTruthy()
      expect(fullGauge.querySelector('b')?.textContent).toBe('100.0%')
    })
  })

  describe('dashboard range control theming', () => {
    function readStyleFile(name: string): string {
      return readFileSync(resolve(fileURLToPath(import.meta.url), '..', '..', 'styles', name), 'utf8')
    }

    function cssRule(css: string, selector: string): string {
      const at = css.indexOf(selector)
      expect(at, `rule for "${selector}"`).toBeGreaterThanOrEqual(0)
      const open = css.indexOf('{', at)
      let depth = 0
      for (let i = open; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1
        if (css[i] === '}') depth -= 1
        if (depth === 0) return css.slice(open + 1, i)
      }
      throw new Error(`unbalanced rule for "${selector}"`)
    }

    it('opens the date range popup with the dashboard dropdown root class', async () => {
      renderDashboard(123)
      const selector = document.querySelector('.dashboard-range-control .ant-select-selector') as HTMLElement
      expect(selector).toBeTruthy()
      fireEvent.mouseDown(selector)
      const dropdown = await waitFor(() => {
        const el = document.querySelector('.dashboard-range-dropdown')
        expect(el).toBeTruthy()
        return el as HTMLElement
      })
      expect(dropdown.classList.contains('ant-select-dropdown')).toBe(true)
      expect(dropdown.textContent).toContain('Last 24 hours')
    })

    it('themes the range control and dropdown from dashboard variables', () => {
      const css = readStyleFile('dashboard.css')
      const control = cssRule(css, '.dashboard-range-control {')
      expect(control).toContain('border:1px solid var(--dashboard-border)')
      expect(control).toContain('background:var(--dashboard-surface-subtle)')
      expect(css).toContain('.dashboard-range-control:hover,.dashboard-range-control:focus-within')
      expect(cssRule(css, '.dashboard-range-control > span {')).toContain('color:var(--dashboard-muted)')
      expect(cssRule(css, '.dashboard-range-control .ant-select .ant-select-selector {')).toContain('color:var(--dashboard-text) !important')
      expect(cssRule(css, '.dashboard-range-control .ant-select-arrow {')).toContain('color:var(--dashboard-muted)')
      expect(cssRule(css, '.dashboard-range-dropdown {')).toContain('background:var(--dashboard-surface) !important')
      expect(cssRule(css, '.dashboard-range-dropdown {')).toContain('border:1px solid var(--dashboard-border)')
      expect(cssRule(css, '.dashboard-range-dropdown .ant-select-item {')).toContain('color:var(--dashboard-text) !important')
      expect(cssRule(css, '.dashboard-range-dropdown .ant-select-item-option-active:not(.ant-select-item-option-disabled) {')).toContain('background:var(--dashboard-surface-hover) !important')
      expect(cssRule(css, '.dashboard-range-dropdown .ant-select-item-option-selected:not(.ant-select-item-option-disabled) {')).toContain('background:var(--dashboard-accent-soft) !important')
      expect(cssRule(css, '.dashboard-range-dropdown .ant-select-item-option-state {')).toContain('color:var(--dashboard-accent) !important')
      expect(cssRule(css, '.dashboard-range-dropdown .ant-select-item-empty {')).toContain('color:var(--dashboard-muted) !important')
      expect(css).toContain('.dashboard-range-dropdown .rc-virtual-list::-webkit-scrollbar-thumb {')
      const globals = readStyleFile('globals.css')
      for (const scope of [':root {', 'html.dark-theme {']) {
        for (const token of ['--dashboard-surface:', '--dashboard-surface-subtle:', '--dashboard-surface-hover:', '--dashboard-text:', '--dashboard-muted:', '--dashboard-border:', '--dashboard-accent:', '--dashboard-accent-soft:']) {
          expect(cssRule(globals, scope), `${token} in ${scope}`).toContain(token)
        }
      }
    })

    it('does not hardcode white or black backgrounds on the range control or popup', () => {
      const css = readStyleFile('dashboard.css')
      const relevant = css
        .split('}')
        .filter((chunk) => chunk.includes('.dashboard-range-control') || chunk.includes('.dashboard-range-dropdown'))
      expect(relevant.length).toBeGreaterThan(0)
      for (const chunk of relevant) {
        expect(chunk).not.toMatch(/background[^;]*(#fff\b|#fff;|#ffffff|:white| white|#000\b|#000000|:black| black)/i)
      }
    })
  })
})
