import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import UsersPage from './UsersPage'

const mockFetch = vi.fn<any>()
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: mockFetch,
})

const DEFAULT_USERS = [
  { id: 1, username: 'admin-user', display_name: 'Admin User', email: 'admin@example.com', role: 'admin' as const, enabled: true, created_at: '2025-01-01T00:00:00Z' },
  { id: 2, username: 'editor-user', display_name: 'Editor User', email: 'editor@example.com', role: 'editor' as const, enabled: true, created_at: '2025-02-01T00:00:00Z' },
  { id: 3, username: 'disabled-user', display_name: 'Disabled User', email: 'disabled@example.com', role: 'editor' as const, enabled: false, created_at: '2025-03-01T00:00:00Z' },
] as const

function setupFetch() {
  mockFetch.mockImplementation((url: string) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/users') && !urlStr.includes('/api/users/')) {
      return Promise.resolve({ ok: true, json: async () => DEFAULT_USERS } as Response)
    }
    if (urlStr.includes('/api/users/')) {
      return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
}

function setupEmptyUsers() {
  mockFetch.mockImplementation((url: string) => {
    const urlStr = String(url)
    if (urlStr.includes('/api/users') && !urlStr.includes('/api/users/')) {
      return Promise.resolve({ ok: true, json: async () => [] } as Response)
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
  })
}

function renderPage() {
  setupFetch()
  return render(<UsersPage />)
}

function renderEmptyUsers() {
  setupEmptyUsers()
  return render(<UsersPage />)
}

beforeEach(() => {
  cleanup()
  localStorage.clear()
  document.body.removeAttribute('data-theme')
  mockFetch.mockReset()
})

describe('UsersPage', () => {
  describe('loading state', () => {
    it('shows loading indicator when API not resolved', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}))
      render(<UsersPage />)
      expect(screen.getByText('Loading users...')).toBeInTheDocument()
    })
  })

  describe('loaded state', () => {
    it('shows user table with rows', async () => {
      renderPage()
      const table = await screen.findByRole('table')
      expect(table).toBeTruthy()
    })

    it('renders one header icon with title and subtitle under dark theme', async () => {
      document.body.setAttribute('data-theme', 'dark')
      renderPage()
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      expect(await screen.findByRole('heading', { level: 2, name: 'Users' })).toBeInTheDocument()
      expect(screen.getByText('Manage dashboard users and access permissions')).toBeInTheDocument()
      document.body.removeAttribute('data-theme')
    })

    it('displays all usernames', async () => {
      renderPage()
      expect(await screen.findByText('admin-user')).toBeInTheDocument()
      expect(await screen.findByText('editor-user')).toBeInTheDocument()
    })

    it('displays display names', async () => {
      renderPage()
      expect(await screen.findByText('Admin User')).toBeInTheDocument()
      expect(await screen.findByText('Editor User')).toBeInTheDocument()
    })

    it('displays emails', async () => {
      renderPage()
      expect(await screen.findByText('admin@example.com')).toBeInTheDocument()
    })

    it('shows user avatar initials', async () => {
      renderPage()
      await screen.findByText('admin-user')
      const avatars = document.querySelectorAll('[class*="userAvatar"]')
      expect(avatars.length).toBe(3)
      expect(avatars[0]?.textContent).toBe('AU')
    })
  })

  describe('role chips', () => {
    it('displays role tags', async () => {
      renderPage()
      await screen.findByText('admin-user')
      const table = document.querySelector('table')
      expect(table?.querySelectorAll('[class*="paletteBadge"]').length).toBe(6)
    })

    it('admin role uses pink class', async () => {
      renderPage()
      await screen.findByText('Admin User')
      const table = document.querySelector('table')
      const adminRow = Array.from(table?.querySelectorAll('tbody tr') || []).find(
        (tr) => tr.textContent?.includes('admin-user')
      )
      expect(adminRow?.querySelector('[class*="adminBadge"]')).toBeTruthy()
    })

    it('editor role uses blue class', async () => {
      renderPage()
      const table = await screen.findByRole('table')
      const editorRow = Array.from(table.querySelectorAll('tbody tr')).find(
        (tr) => tr.textContent?.includes('editor-user')
      )
      expect(editorRow?.querySelector('[class*="editorBadge"]')).toBeTruthy()
    })
  })

  describe('search input', () => {
    it('search input exists', async () => {
      renderPage()
      const input = document.querySelector<HTMLInputElement>('input[type="search"]')
      expect(input).toBeTruthy()
    })

    it('search filters by username', async () => {
      renderPage()
      await screen.findByText('admin-user')
      const input = document.querySelector<HTMLInputElement>('input[type="search"]')
      if (input) {
        fireEvent.change(input, { target: { value: 'disabled-user' } })
        expect(screen.queryByText('admin-user')).not.toBeInTheDocument()
      }
    })

    it('search filters by display name', async () => {
      renderPage()
      await screen.findByText('admin-user')
      const input = document.querySelector<HTMLInputElement>('input[type="search"]')
      if (input) {
        fireEvent.change(input, { target: { value: 'Editor' } })
        expect(screen.queryByText('admin-user')).not.toBeInTheDocument()
      }
    })
  })

  describe('search control', () => {
    interface CustomUser {
      id: number
      username: string
      display_name: string
      email: string
      role: 'admin' | 'editor'
      enabled: boolean
      created_at: string
    }

    function setupCustomUsers(customUsers: CustomUser[]) {
      mockFetch.mockImplementation((url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/users') && !urlStr.includes('/api/users/')) {
          return Promise.resolve({ ok: true, json: async () => customUsers } as Response)
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
      })
    }

    async function waitForDropdown(predicate?: (dropdown: Element) => boolean): Promise<Element> {
      const startedAt = Date.now()
      while (Date.now() - startedAt < 3000) {
        const dropdown = document.querySelector('.search-suggest-dropdown')
        if (dropdown && (!predicate || predicate(dropdown))) return dropdown
        await new Promise((resolve) => setTimeout(resolve, 15))
      }
      throw new Error('search suggestion dropdown did not appear in time')
    }

    function dropdownLabels(dropdown: Element): string[] {
      return Array.from(dropdown.querySelectorAll('.ant-select-item-option')).map(
        (el) => (el.textContent ?? '').trim()
      )
    }

    it('renders a single search container without a nested wrapper box', async () => {
      renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      const suggestRoot = input.closest('.search-suggest')
      expect(suggestRoot).toBeTruthy()
      expect(suggestRoot?.className).toContain('ant-select')
      const usersSearchNodes = Array.from(document.querySelectorAll('[class*="usersSearch"]'))
      expect(usersSearchNodes).toHaveLength(1)
      expect(usersSearchNodes[0]).toBe(suggestRoot)
      expect(suggestRoot?.querySelector('.ant-input-affix-wrapper')).toBeTruthy()
    })

    it('disables browser autocomplete and history on the real input', async () => {
      renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      expect(input.tagName).toBe('INPUT')
      expect(input).toHaveAttribute('autocomplete', 'off')
      expect(input).toHaveAttribute('name', 'gitlab_ops_users_search')
      expect(input).not.toHaveAttribute('list')
      expect(document.querySelector('datalist')).toBeNull()
    })

    it('does not persist search text in storage or URL', async () => {
      renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('admin-user')
      fireEvent.change(input, { target: { value: 'persist-me' } })
      expect(window.location.search).toBe('')
      expect(localStorage.length).toBe(0)
      expect(sessionStorage.length).toBe(0)
    })

    it('clears the search field when leaving and reopening the page', async () => {
      const { unmount } = renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('admin-user')
      fireEvent.change(input, { target: { value: 'admin' } })
      expect(input.value).toBe('admin')
      unmount()
      renderPage()
      const reopened = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('admin-user')
      expect(reopened.value).toBe('')
      expect(screen.getByText('3 users')).toBeInTheDocument()
    })

    it('offers suggestions only from the loaded dashboard users', async () => {
      renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('admin-user')
      input.focus()
      const dropdown = await waitForDropdown()
      const labels = dropdownLabels(dropdown)
      expect(labels).toHaveLength(9)
      for (const expected of [
        'admin-user', 'Admin User', 'admin@example.com',
        'editor-user', 'Editor User', 'editor@example.com',
        'disabled-user', 'Disabled User', 'disabled@example.com',
      ]) {
        expect(labels).toContain(expected)
      }
      expect(labels).not.toContain('admin')
      expect(labels).not.toContain('editor')
    })

    it('matches suggestions case-insensitively as the user types', async () => {
      renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('admin-user')
      input.focus()
      await waitForDropdown()
      fireEvent.change(input, { target: { value: 'ADMIN@' } })
      const dropdown = await waitForDropdown(
        (d) => !(d.textContent ?? '').includes('admin-user')
      )
      const labels = dropdownLabels(dropdown)
      expect(labels).toContain('admin@example.com')
      expect(labels).not.toContain('admin-user')
      expect(labels).not.toContain('Editor User')
    })

    it('filters the users table when a suggestion is selected', async () => {
      renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('admin-user')
      input.focus()
      const dropdown = await waitForDropdown((d) => d.querySelector('.ant-select-item-option'))
      const option = Array.from(dropdown.querySelectorAll('.ant-select-item-option')).find(
        (el) => (el.textContent ?? '').trim() === 'admin@example.com'
      )
      expect(option).toBeTruthy()
      fireEvent.click(option!)
      expect(input.value).toBe('admin@example.com')
      await waitFor(() => {
        const rows = Array.from(document.querySelectorAll('tbody tr'))
        expect(rows).toHaveLength(1)
        expect(rows[0].textContent).toContain('admin-user')
        expect(document.querySelector('tbody')?.textContent ?? '').not.toContain('editor-user')
      })
      expect(screen.getByText('1 users')).toBeInTheDocument()
    })

    it('deduplicates suggestions without losing any user match', async () => {
      setupCustomUsers([
        { id: 1, username: 'alice', display_name: 'alice', email: 'alice@example.com', role: 'editor', enabled: true, created_at: '2025-01-01T00:00:00Z' },
        { id: 2, username: 'bob', display_name: 'Alice', email: 'bob@example.com', role: 'editor', enabled: true, created_at: '2025-02-01T00:00:00Z' },
        { id: 3, username: 'carol', display_name: '', email: '', role: 'editor', enabled: true, created_at: '2025-03-01T00:00:00Z' },
      ])
      render(<UsersPage />)
      const input = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('carol')
      input.focus()
      const dropdown = await waitForDropdown()
      const labels = dropdownLabels(dropdown)
      const normalized = labels.map((label) => label.toLowerCase())
      expect(new Set(normalized).size).toBe(normalized.length)
      expect(labels).toHaveLength(5)
      for (const expected of ['alice', 'alice@example.com', 'bob', 'bob@example.com', 'carol']) {
        expect(labels).toContain(expected)
      }
    })

    it('shows a themed no-matching-users state when nothing matches', async () => {
      renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('admin-user')
      input.focus()
      await waitForDropdown()
      fireEvent.change(input, { target: { value: 'zzzzz' } })
      const dropdown = await waitForDropdown(
        (d) => (d.textContent ?? '').includes('No matching users')
      )
      const emptyState = dropdown.querySelector('[class*="noMatchingUsers"]')
      expect(emptyState?.textContent).toBe('No matching users')
      expect(dropdownLabels(dropdown)).toHaveLength(0)
      expect((dropdown.textContent ?? '')).not.toContain('zzz')
      expect(await screen.findByText('No users match search')).toBeInTheDocument()
    })

    it('does not surface arbitrary historical or typed terms as suggestions', async () => {
      renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('admin-user')
      input.focus()
      fireEvent.change(input, { target: { value: 'legacy-browser-history-term' } })
      const dropdown = await waitForDropdown(
        (d) => (d.textContent ?? '').includes('No matching users')
      )
      expect(dropdownLabels(dropdown)).toHaveLength(0)
      expect((dropdown.textContent ?? '')).not.toContain('legacy-browser-history-term')
    })

    it('clearing the field restores the full users table', async () => {
      renderPage()
      const input = await screen.findByPlaceholderText('Search users...')
      await screen.findByText('admin-user')
      fireEvent.change(input, { target: { value: 'admin' } })
      await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(1))
      fireEvent.change(input, { target: { value: '' } })
      await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(3))
      expect(screen.getByText('3 users')).toBeInTheDocument()
    })
  })

  describe('create button', () => {
    it('create button exists', async () => {
      renderPage()
      const buttons = Array.from(document.querySelectorAll('button'))
      const btn = buttons.find(b => b.textContent?.includes('Create user'))
      expect(btn).toBeTruthy()
    })

    it('clicking create opens drawer', async () => {
      renderPage()
      const buttons = Array.from(document.querySelectorAll('button'))
      const createBtn = buttons.find(b => b.textContent?.includes('Create user'))
      if (createBtn) {
        fireEvent.click(createBtn)
        expect(document.querySelector('.ant-drawer')).toBeTruthy()
        expect(screen.getByText('Create new user')).toBeInTheDocument()
      }
    })
  })

  describe('edit functionality', () => {
    it('edit buttons exist', async () => {
      renderPage()
      await screen.findByText('admin-user')
      const buttons = Array.from(document.querySelectorAll('button'))
      const editBtns = buttons.filter(b => (b.title || '').includes('Edit'))
      expect(editBtns.length).toBe(3)
    })

    it('clicking edit opens drawer', async () => {
      renderPage()
      const buttons = Array.from(document.querySelectorAll('button'))
      const editBtn = buttons.find(b => (b.title || '').includes('Edit')) as HTMLButtonElement | undefined
      if (editBtn) {
        fireEvent.click(editBtn)
        expect(document.querySelector('.ant-drawer')).toBeTruthy()
        expect(screen.getByText('Edit user')).toBeInTheDocument()
      }
    })
  })

  describe('user status', () => {
    it('shows Active status', async () => {
      renderPage()
      await screen.findByText('Admin User')
      const statusEls = document.querySelectorAll('[class*="activeBadge"], [class*="disabledBadge"]')
      expect(statusEls.length).toBe(3)
    })

    it('shows Disabled for disabled users', async () => {
      renderPage()
      await screen.findByText('disabled-user')
      const rows = Array.from(document.querySelectorAll('tbody tr'))
      const disabledRow = rows.find(
        (tr) => tr.textContent?.includes('disabled-user')
      )
      expect(disabledRow?.querySelector('[class*="disabledBadge"]')?.textContent).toContain('Disabled')
    })

    it('uses palette badges for statuses', async () => {
      renderPage()
      await screen.findByText('admin-user')
      expect(document.querySelectorAll('[class*="activeBadge"], [class*="disabledBadge"]').length).toBe(3)
    })
  })

  describe('bulk deletion', () => {
    it('uses row selection and one delete-selected action', async () => {
      renderPage()
      await screen.findByText('admin-user')
      const deleteBtns = Array.from(document.querySelectorAll('button.ant-btn-dangerous'))
      expect(deleteBtns.length).toBe(1)
      expect(deleteBtns[0]).toHaveTextContent('Delete selected')
      expect(document.querySelectorAll('table input[type="checkbox"]').length).toBe(4)
      expect(Array.from(document.querySelectorAll('button')).filter(button => button.title === 'Delete')).toHaveLength(0)
    })
  })

  describe('table structure', () => {
    it('has correct header columns', async () => {
      renderPage()
      const table = await screen.findByRole('table')
      const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.textContent || '')
      expect(headers).toContain('USER')
      expect(headers).toContain('DISPLAY NAME')
      expect(headers).toContain('EMAIL')
      expect(headers).toContain('ROLE')
      expect(headers).toContain('STATUS')
    })
  })

  describe('Drawer form', () => {
    it('has username input', async () => {
      renderPage()
      const buttons = Array.from(document.querySelectorAll('button'))
      const createBtn = buttons.find(b => b.textContent?.includes('Create user'))
      if (createBtn) {
        fireEvent.click(createBtn)
        const input = document.querySelector<HTMLInputElement>('input[placeholder="myusername"]')
        expect(input).toBeTruthy()
      }
    })

    it('has password input', async () => {
      renderPage()
      const buttons = Array.from(document.querySelectorAll('button'))
      const createBtn = buttons.find(b => b.textContent?.includes('Create user'))
      if (createBtn) {
        fireEvent.click(createBtn)
        const input = document.querySelector<HTMLInputElement>('input[type="password"]')
        expect(input).toBeTruthy()
      }
    })

    it('has display name input', async () => {
      renderPage()
      const buttons = Array.from(document.querySelectorAll('button'))
      const createBtn = buttons.find(b => b.textContent?.includes('Create user'))
      if (createBtn) {
        fireEvent.click(createBtn)
        const input = document.querySelector<HTMLInputElement>('input[placeholder="Alice Johnson"]')
        expect(input).toBeTruthy()
      }
    })

    it('has role selection', async () => {
      renderPage()
      const buttons = Array.from(document.querySelectorAll('button'))
      const createBtn = buttons.find(b => b.textContent?.includes('Create user'))
      if (createBtn) {
        fireEvent.click(createBtn)
        expect(document.querySelector('[class*="roleChoices"]')).toBeTruthy()
      }
    })
  })

  describe('theme support', () => {
    it('renders in light theme', async () => {
      document.body.removeAttribute('data-theme')
      renderPage()
      expect(await screen.findByText('admin-user')).toBeInTheDocument()
    })

    it('renders in dark theme', async () => {
      document.body.setAttribute('data-theme', 'dark')
      renderPage()
      expect(await screen.findByText('admin-user')).toBeInTheDocument()
      document.body.removeAttribute('data-theme')
    })
  })

  describe('shared boxed page header', () => {
    it('renders the shared boxed header with one icon, title, subtitle, and actions', async () => {
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Users' })
      expect(document.querySelectorAll('.page-header-box').length).toBe(1)
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      expect(screen.getByText('Manage dashboard users and access permissions')).toBeInTheDocument()
      expect(document.querySelectorAll('.page-header-actions').length).toBe(1)
      expect(screen.getByRole('button', { name: /create user/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /delete selected/i })).toBeInTheDocument()
    })

    it('keeps the shared boxed header under light and dark themes', async () => {
      renderPage()
      await screen.findByRole('heading', { level: 2, name: 'Users' })
      expect(document.querySelectorAll('.page-header-box').length).toBe(1)
      document.body.setAttribute('data-theme', 'dark')
      expect(document.querySelectorAll('.page-header-box').length).toBe(1)
      expect(document.querySelectorAll('.page-header-icon').length).toBe(1)
      document.body.removeAttribute('data-theme')
    })
  })

  describe('empty state', () => {
    it('shows no users found', async () => {
      renderEmptyUsers()
      expect(await screen.findByText('No users found')).toBeInTheDocument()
    })

    it('shows no match when filtering', async () => {
      renderPage()
      await screen.findByText('admin-user')
      const input = document.querySelector<HTMLInputElement>('input[type="search"]')
      if (input) {
        fireEvent.change(input, { target: { value: 'zzzzz' } })
        expect(await screen.findByText('No users match search')).toBeInTheDocument()
      }
    })
  })
})
