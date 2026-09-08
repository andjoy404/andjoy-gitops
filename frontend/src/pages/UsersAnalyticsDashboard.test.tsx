import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { UsersAnalyticsDashboard } from './DashboardPage'
import type { UserActivity } from '../types'

beforeEach(() => {
  cleanup()
})

const SAMPLE_USERS: UserActivity[] = [
  {
    id: 1,
    name: 'Imron Rosyadi',
    username: 'imron.rosyadi',
    comment_count: 7,
    push_count: 10,
    merge_request_count: 5,
    merged_count: 4,
    issue_count: 2,
    is_current_member: true,
  },
  {
    id: 2,
    name: 'mobile-reviewer adb',
    username: 'adb-mobile-reviewer',
    comment_count: 1,
    push_count: 0,
    merge_request_count: 0,
    merged_count: 0,
    issue_count: 0,
    is_current_member: true,
  },
  {
    id: 3,
    name: 'Adhityo Priyambodo',
    username: 'adhityo.priyambodo',
    comment_count: 0,
    push_count: 0,
    merge_request_count: 0,
    merged_count: 0,
    issue_count: 0,
    is_current_member: true,
  },
  {
    id: 4,
    name: 'Administrator Appfuxion',
    username: 'root',
    comment_count: 0,
    push_count: 0,
    merge_request_count: 0,
    merged_count: 0,
    issue_count: 0,
    is_current_member: true,
  },
  {
    id: 5,
    name: 'Adrian Khoo Kai Xuan',
    username: 'adrian.khoo',
    comment_count: 0,
    push_count: 0,
    merge_request_count: 0,
    merged_count: 0,
    issue_count: 0,
    is_current_member: true,
  },
]

describe('UsersAnalyticsDashboard leaderboard panels', () => {
  it('renders top 5 leaderboard with active users and dash for empty slots', () => {
    render(<UsersAnalyticsDashboard users={SAMPLE_USERS} loading={false} />)

    // Find the Comments table via its unique subtitle
    const commentsHeader = screen.getByText('Top 5 Comments')
    const container = commentsHeader.closest('.leaderboard-card-container')
    expect(container).toBeTruthy()

    const rows = container!.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(5)

    // Row 1: Imron Rosyadi
    expect(rows[0].textContent).toContain('1')
    expect(rows[0].textContent).toContain('Imron Rosyadi')
    expect(rows[0].textContent).toContain('7')

    // Row 2: mobile-reviewer adb
    expect(rows[1].textContent).toContain('2')
    expect(rows[1].textContent).toContain('mobile-reviewer adb')
    expect(rows[1].textContent).toContain('1')

    // Rows 3, 4, 5: empty dash
    expect(rows[2].textContent).toContain('3')
    expect(rows[2].textContent).toContain('-')
    expect(rows[2].textContent).not.toContain('Adhityo Priyambodo')

    expect(rows[3].textContent).toContain('4')
    expect(rows[3].textContent).toContain('-')
    expect(rows[3].textContent).not.toContain('Administrator Appfuxion')

    expect(rows[4].textContent).toContain('5')
    expect(rows[4].textContent).toContain('-')
    expect(rows[4].textContent).not.toContain('Adrian Khoo Kai Xuan')

    // Check center alignment on the empty dash td
    const emptyTd = rows[2].querySelector('td[colspan="2"]') as HTMLElement
    expect(emptyTd).toBeTruthy()
    expect(emptyTd.style.textAlign).toBe('center')
  })

  it('renders all dashes when all users have 0 for a metric', () => {
    const zeroUsers = SAMPLE_USERS.map((u) => ({ ...u, issue_count: 0, comment_count: 0 }))
    render(<UsersAnalyticsDashboard users={zeroUsers} loading={false} />)

    const issuesHeader = screen.getByText('Top 5 Issues')
    const container = issuesHeader.closest('.leaderboard-card-container')
    expect(container).toBeTruthy()

    const rows = container!.querySelectorAll('tbody tr')
    expect(rows).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      expect(rows[i].textContent).toContain(String(i + 1))
      expect(rows[i].textContent).toContain('-')
    }
  })
})
