import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Input, Drawer, Form, Select, Checkbox, Tag, Popconfirm, Space, Typography } from 'antd'
import { PlusCircleOutlined, EditOutlined, TeamOutlined, CloseOutlined } from '@ant-design/icons'
import styles from '../styles/users.module.css'
import { api } from '../services/api'
import { isAdminRole } from '../utils/role'
import SearchSuggestInput from '../components/SearchSuggestInput'
import PageHeader from '../components/PageHeader'

interface AppUser {
  id: number
  username: string
  display_name: string
  email: string
  role: 'admin' | 'editor'
  enabled: boolean
  created_at: string
}

interface UserInput {
  username: string
  password: string
  display_name: string
  email: string
  role: 'admin' | 'editor'
  enabled: boolean
}

const { Text } = Typography

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pageError, setPageError] = useState('')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [highlightedUser, setHighlightedUser] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set())

  const [form, setForm] = useState<UserInput>({
    username: '',
    password: '',
    display_name: '',
    email: '',
    role: 'editor',
    enabled: true,
  })
  const isAdminLocked = editing !== null && isAdminRole(editing.role)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/users', { credentials: 'include' })
      if (!res.ok) throw new Error('Unable to load user data. Check your connection or try refreshing.')
      const data = await res.json()
      setUsers(Array.isArray(data) ? data : [])
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Unable to load user data. Check your connection or try refreshing.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((u) =>
      [u.username, u.display_name, u.email, u.role].some((v) => v.toLowerCase().includes(q))
    )
  }, [users, search])

  // Suggestions come only from the loaded dashboard directory.
  // Each unique value (case-insensitive) is claimed by the first matching
  // user id, so no user produces duplicate rows and no free-form entries exist.
  const userSuggestions = useMemo(() => {
    const seen = new Set<string>()
    const values: string[] = []
    for (const user of users) {
      for (const fieldValue of [user.username, user.display_name, user.email]) {
        const value = (fieldValue ?? '').trim()
        if (!value) continue
        const key = value.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        values.push(value)
      }
    }
    return values
  }, [users])

  const selectableFiltered = useMemo(
    () => filtered.filter((user) => user.role !== 'admin'),
    [filtered]
  )

  const create = () => {
    setEditing(null)
    setForm({ username: '', password: '', display_name: '', email: '', role: 'editor', enabled: true })
    setFormError('')
    setDrawerOpen(true)
  }

  const edit = (user: AppUser) => {
    setEditing(user)
    setForm({ username: user.username, password: '', display_name: user.display_name, email: user.email, role: user.role, enabled: user.enabled })
    setFormError('')
    setDrawerOpen(true)
  }

  const save = async () => {
    if (!form.username.trim() || (!editing && form.password.length < 8)) {
      setFormError('Username and a password of at least 8 characters are required.')
      return
    }
    const highlightUsername = form.username.trim()
    setFormError('')
    try {
      if (editing) await api.put(`/api/users/${editing.id}`, form)
      else await api.post('/api/users', form)

      setDrawerOpen(false)
      setHighlightedUser(highlightUsername)
      window.setTimeout(() => {
        setHighlightedUser((current) => current === highlightUsername ? '' : current)
      }, 2600)
      await fetchUsers()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Unable to save user')
    }
  }

  const toggleUserSelection = (id: number, checked: boolean) => {
    setSelectedUserIds((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const allVisibleSelected = selectableFiltered.length > 0 && selectableFiltered.every((user) => selectedUserIds.has(user.id))
  const someVisibleSelected = selectableFiltered.some((user) => selectedUserIds.has(user.id)) && !allVisibleSelected

  const toggleAllVisible = (checked: boolean) => {
    setSelectedUserIds((current) => {
      const next = new Set(current)
      for (const user of selectableFiltered) {
        if (checked) next.add(user.id)
        else next.delete(user.id)
      }
      return next
    })
  }

  const removeSelectedUsers = async () => {
    const ids = [...selectedUserIds]
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/api/users/${id}`)))
    const failedIds = ids.filter((_, index) => results[index]?.status === 'rejected')
    setSelectedUserIds(new Set(failedIds))
    await fetchUsers()
    if (failedIds.length > 0) {
      const firstFailure = results.find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined
      setPageError(firstFailure?.reason instanceof Error
        ? firstFailure.reason.message
        : `Unable to delete ${failedIds.length} selected user(s)`)
    } else {
      setPageError('')
    }
  }

  const initials = (user: AppUser) =>
    (user.display_name || user.username)
      .split(/\s+/)
      .slice(0, 2)
      .map((v) => v[0]?.toUpperCase())
      .join('')

  return (
    <div className={styles.usersPage}>
      <PageHeader
        icon={<TeamOutlined aria-hidden className="page-header-icon" />}
        title="Users"
        subtitle="Manage dashboard users and access permissions"
        actions={
          <>
            <Popconfirm
              title={`Delete ${selectedUserIds.size} selected user(s)?`}
              onConfirm={removeSelectedUsers}
              disabled={selectedUserIds.size === 0}
            >
              <Button className={styles.bulkDeleteButton} danger disabled={selectedUserIds.size === 0}>Delete selected</Button>
            </Popconfirm>
            <Button type="primary" icon={<PlusCircleOutlined />} onClick={create}>Create user</Button>
          </>
        }
      />

      <div className={styles.roleExplainer}>
        <div className={styles.roleCard}>
          <Tag className={`${styles.paletteBadge} ${styles.adminBadge}`}>Admin</Tag>
          <div className={styles.roleCopy}>
            <strong>Full dashboard administration</strong>
            <small>Manage users, GitLab environments, and application configuration.</small>
          </div>
        </div>
        <div className={styles.roleCard}>
          <Tag className={`${styles.paletteBadge} ${styles.editorBadge}`}>Editor</Tag>
          <div className={styles.roleCopy}>
            <strong>CI/CD operations</strong>
            <small>Use dashboards, pipelines, runners, and available pipeline actions.</small>
          </div>
        </div>
      </div>

      {pageError && (
        <div className={styles.usersError} role="alert">
          <span>
            {pageError}
            <button className={styles.errorClose} onClick={() => setPageError('')} aria-label="Close">
              ×
            </button>
          </span>
        </div>
      )}

      <div className={styles.usersTableCard}>
        <div className={styles.usersToolbar}>
          <SearchSuggestInput
            className={styles.usersSearch}
            value={search}
            suggestions={userSuggestions}
            onChange={setSearch}
            inputName="gitlab_ops_users_search"
            placeholder="Search users..."
            notFoundContent={<span className={styles.noMatchingUsers}>No matching users</span>}
          />
          <span className={styles.usersCount}>{filtered.length} users</span>
        </div>

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingPlaceholder}>Loading users...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.usersEmpty}>
            {users.length === 0 ? 'No users found' : 'No users match search'}
          </div>
        ) : (
          <table className={`${styles.userTable} gitops-data-table`}>
            <thead>
              <tr>
                <th className={styles.selectColumn}>
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected}
                    disabled={selectableFiltered.length === 0}
                    onChange={(event) => toggleAllVisible(event.target.checked)}
                    aria-label="Select all visible users"
                  />
                </th>
                <th>USER</th>
                <th>DISPLAY NAME</th>
                <th>EMAIL</th>
                <th>ROLE</th>
                <th>STATUS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  className={user.username === highlightedUser ? styles.newUserHighlight : ''}
                >
                  <td className={styles.selectColumn}>
                    <Checkbox
                      checked={selectedUserIds.has(user.id)}
                      disabled={user.role === 'admin'}
                      onChange={(event) => toggleUserSelection(user.id, event.target.checked)}
                      aria-label={`Select ${user.username}`}
                    />
                  </td>
                  <td>
                    <div className={styles.userCell}>
                      <span className={styles.userAvatar}>{initials(user)}</span>
                      <strong>{user.username}</strong>
                    </div>
                  </td>
                  <td>{user.display_name || '—'}</td>
                  <td>{user.email || '—'}</td>
                  <td>
                    <Tag className={`${styles.paletteBadge} ${user.role === 'admin' ? styles.adminBadge : styles.editorBadge}`}>
                      {user.role}
                    </Tag>
                  </td>
                  <td>
                    <Tag className={`${styles.paletteBadge} ${user.enabled ? styles.activeBadge : styles.disabledBadge}`}>
                      {user.enabled ? 'Active' : 'Disabled'}
                    </Tag>
                  </td>
                  <td>
                    <div className={styles.userActionsInner}>
                      <Button type="text" size="small" icon={<EditOutlined />} onClick={() => edit(user)} title="Edit" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Drawer
        title={(
          <div className={styles.drawerHeading}>
            <strong>{editing ? 'Edit user' : 'Create new user'}</strong>
            <small>{editing ? 'Update account details and permissions' : 'Add a dashboard user with the required access'}</small>
          </div>
        )}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width="min(620px, 50vw)"
        closable={false}
        rootClassName={styles.userDrawer}
        extra={(
          <Button type="text" icon={<CloseOutlined />} onClick={() => setDrawerOpen(false)} aria-label="Close user form" />
        )}
      >
        <div className={styles.userForm}>
          <div className={styles.formField}>
            <strong>Username *</strong>
            <small>Unique name used to sign in</small>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="myusername"
              autoComplete="off"
            />
          </div>
          <div className={styles.formField}>
            <strong>Password {editing ? '' : '*'}</strong>
            <small>{editing ? 'Leave blank to keep the current password' : 'Minimum 8 characters'}</small>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
            />
          </div>
          <div className={styles.formField}>
            <strong>Display name</strong>
            <small>Name shown for this user</small>
            <input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Alice Johnson"
            />
          </div>
          <div className={styles.formField}>
            <strong>Email</strong>
            <small>Optional contact address</small>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="alice@example.com"
            />
          </div>

          <fieldset>
            <legend>Role assignment</legend>
            <p style={{ margin: 0 }}>{isAdminLocked ? 'You are an admin. Your role is fixed.' : 'Choose one dashboard access level.'}</p>
            <div className={styles.roleChoices}>
              <div
                className={`${styles.roleChoice} ${form.role === 'admin' ? styles.selected : ''} ${isAdminLocked ? styles.disabled : ''}`}
                onClick={() => { if (!isAdminLocked) setForm({ ...form, role: 'admin' }) }}
              >
                <span className={styles.roleRadio} />
                <div>
                  <Tag className={`${styles.paletteBadge} ${styles.adminBadge}`}>Admin</Tag>
                  <strong>Full administrative access</strong>
                  <small>Users, environments, configuration, and CI/CD operations</small>
                </div>
              </div>
              <div
                className={`${styles.roleChoice} ${form.role === 'editor' ? styles.selected : ''} ${isAdminLocked ? styles.disabled : ''}`}
                onClick={() => { if (!isAdminLocked) setForm({ ...form, role: 'editor' }) }}
              >
                <span className={styles.roleRadio} />
                <div>
                  <Tag className={`${styles.paletteBadge} ${styles.editorBadge}`}>Editor</Tag>
                  <strong>CI/CD dashboard access</strong>
                  <small>Dashboard, pipelines, runners, and pipeline operations</small>
                </div>
              </div>
            </div>
          </fieldset>

          {editing && (
            <div className={styles.enabledRow}>
              <Checkbox
                checked={form.enabled}
                disabled={isAdminLocked}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              >
                Account enabled
              </Checkbox>
            </div>
          )}

          {formError && (
            <div className={styles.usersError} role="alert">
              <span>
                {formError}
                <button className={styles.errorClose} onClick={() => setFormError('')} aria-label="Close form notification">
                  ×
                </button>
              </span>
            </div>
          )}
        </div>

        <div className={styles.formFooter}>
          <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
          <Button type="primary" onClick={save}>
            {editing ? 'Save user' : 'Create user'}
          </Button>
        </div>
      </Drawer>
    </div>
  )
}
