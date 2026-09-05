import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('api shared API client — Content-Type header', () => {
  let origFetch: typeof global.fetch
  beforeEach(() => {
    origFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    Object.defineProperty(document, 'cookie', {
      value: '',
      writable: true,
      configurable: true,
    })
  })
  afterEach(() => {
    global.fetch = origFetch
  })

  function capturedOptions(): RequestInit {
    return (global.fetch as any).mock.calls.at(-1)[1]
  }

  it('api put sends Content-Type: application/json', async () => {
    const { api } = await import('../services/api')
    await api.put<void>('/api/test', { key: 'val' })
    const opts = capturedOptions()
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('api post sends Content-Type: application/json', async () => {
    const { api } = await import('../services/api')
    await api.post('/api/test', { key: 'val' })
    const opts = capturedOptions()
    expect(opts.headers['Content-Type']).toBe('application/json')
  })

  it('changePassword sends Content-Type: application/json', async () => {
    const { api } = await import('../services/api')
    await api.changePassword({ newPassword: 'securepass123' })
    const opts = capturedOptions()
    expect(opts.method).toBe('PUT')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(opts.body).toBe('{"newPassword":"securepass123"}')
  })

  it('api get does not send Content-Type', async () => {
    const { api } = await import('../services/api')
    await api.get('/api/test')
    const opts = capturedOptions()
    expect(opts.headers['Content-Type']).toBeUndefined()
  })

  it('unwraps the paginated pipeline response returned by the backend', async () => {
    const projects = [{ group_id: 2, project: { id: 10 }, pipelines: [] }]
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      total: 1,
      page: 1,
      page_size: 50,
      projects,
    }), { status: 200 }))

    const { api } = await import('../services/api')
    await expect(api.getPipelineProjects({ group_id: 2, hours: 24 }))
      .resolves.toEqual(projects)
    expect((global.fetch as any).mock.calls[0][0]).toContain('page_size=50')
  })

  it('loads every pipeline project page before returning range data', async () => {
    const firstProjects = Array.from({ length: 50 }, (_, index) => ({
      group_id: 2, project: { id: index + 1 }, pipelines: [],
    }))
    const finalProjects = [{ group_id: 2, project: { id: 51 }, pipelines: [] }]
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        total: 51, page: 1, page_size: 50, projects: firstProjects,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        total: 51, page: 2, page_size: 50, projects: finalProjects,
      }), { status: 200 }))

    const { api } = await import('../services/api')
    const result = await api.getPipelineProjects({ group_id: 2, hours: 720, pipeline_view: 'all' })

    expect(result).toHaveLength(51)
    expect((global.fetch as any).mock.calls[1][0]).toContain('page=2')
    expect((global.fetch as any).mock.calls[0][0]).toContain('pipeline_view=all')
  })

  it('loads the complete user analytics array for the Dashboard', async () => {
    const users = [{ id: 1, username: 'alice', total_activity: 4 }]
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(users), { status: 200 }),
    )

    const { api } = await import('../services/api')
    await expect(api.getUsersAnalytics(2, 24)).resolves.toEqual(users)

    const url = (global.fetch as any).mock.calls[0][0]
    expect(url).toContain('/api/analytics/users/options?')
    expect(url).toContain('group_ids=2')
    expect(url).toContain('hours=24')
    expect(url).toContain('membership=both')
  })

  it('sends the requested membership scope for the user analytics', async () => {
    const users = [{ id: 1, username: 'alice', total_activity: 4 }]
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(users), { status: 200 }),
    )

    const { api } = await import('../services/api')
    await expect(api.getUsersAnalytics(2, 168, 'active')).resolves.toEqual(users)

    const url = (global.fetch as any).mock.calls[0][0]
    expect(url).toContain('group_ids=2')
    expect(url).toContain('hours=168')
    expect(url).toContain('membership=active')
  })

  it('falls back to the both scope for unknown membership values', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    )

    const { api } = await import('../services/api')
    await api.getUsersAnalytics(2, 24, 'invalid' as never)

    const url = (global.fetch as any).mock.calls[0][0]
    expect(url).toContain('membership=both')
  })

  it('fetches a CSRF token before a mutation when the cookie is missing', async () => {
    global.fetch = vi.fn()
      .mockImplementationOnce(async (path: string) => {
        expect(path).toBe('/api/csrf')
        document.cookie = 'XSRF-TOKEN=fresh-token'
        return new Response(null, { status: 200 })
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))

    const { api } = await import('../services/api')
    await api.post('/api/environments', { name: 'test' })

    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(capturedOptions().headers['X-CSRF-TOKEN']).toBe('fresh-token')
  })

  it('uses an existing CSRF cookie without fetching another token', async () => {
    document.cookie = 'XSRF-TOKEN=existing-token'

    const { api } = await import('../services/api')
    await api.post('/api/environments', { name: 'test' })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(capturedOptions().headers['X-CSRF-TOKEN']).toBe('existing-token')
  })

  it('surfaces backend field-validation messages', async () => {
    document.cookie = 'XSRF-TOKEN=existing-token'
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      errors: { name: 'Environment name is required', token: 'Token is required' },
    }), { status: 400 }))

    const { api } = await import('../services/api')

    await expect(api.post('/api/environments', {}))
      .rejects.toThrow('Environment name is required; Token is required')
  })
})
