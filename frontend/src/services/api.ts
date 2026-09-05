import { QueryClient } from '@tanstack/react-query'
import type {
  AnalyticsReadiness,
  AnalyticsSummary,
  AuthStatus,
  CreateEnvironmentRequest,
  EnvironmentDTO,
  GlobalConfigDTO,
  GlobalConfigRequest,
  GroupDTO,
  JobInfo,
  Pipeline,
  UpdateEnvironmentRequest,
  UserActivity,
} from '../types'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})

// API client wrapper with CSRF protection
function readCsrfToken(): string | null {
  try {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

let csrfRequest: Promise<void> | null = null

async function ensureCsrfToken(): Promise<string | null> {
  const existingToken = readCsrfToken()
  if (existingToken) return existingToken

  csrfRequest ??= fetch('/api/csrf', { credentials: 'include' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to initialize CSRF protection (HTTP ${response.status})`)
      }
    })
    .finally(() => {
      csrfRequest = null
    })

  await csrfRequest
  return readCsrfToken()
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase()
  const headers = { ...(options?.headers as Record<string, string> || {}) }

  // Set Content-Type: application/json for requests with a JSON string body
  // when no Content-Type header has been explicitly set by the caller.
  if (typeof options?.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = await ensureCsrfToken()
    if (csrf) {
      headers['X-CSRF-TOKEN'] = csrf
    }
  }

  const body = ((o: RequestInit | undefined) => {
    if (o === undefined) return undefined
    if (typeof o.body === 'string') return o.body
    return o.body !== undefined ? JSON.stringify(o.body) : undefined
  })(options)

  const res = await fetch(path, {
    credentials: 'include',
    ...options,
    body,
    headers,
  })

  if (!res.ok) {
    const body = await res.text()
    let message = `HTTP ${res.status}`
    try {
      const json = JSON.parse(body)
      if (json.error || json.message) {
        message = json.error || json.message
      } else if (json.errors && typeof json.errors === 'object') {
        message = Object.values(json.errors).join('; ')
      }
    } catch { /* ignore */ }
    const error = new Error(message)
    ;(error as any).status = res.status
    throw error
  }

  if (res.status === 204) {
    return null as T
  }

  return res.json()
}

function stripEnvPrefix(name: string): string {
  // Strip "env_name / " prefix from federated group names
  // e.g., "prod / Some Group" -> "Some Group"
  const idx = name.indexOf(' / ')
  if (idx !== -1) {
    return name.slice(idx + 2)
  }
  return name
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestInit, 'method'>) =>
    apiRequest<T>(path, { method: 'GET', ...options }),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),

  // Auth
  getAuthStatus: () => apiRequest<AuthStatus>('/api/auth/status'),
  logout: () => apiRequest<void>('/api/auth/logout', { method: 'POST' }),

  // Environment endpoints
  getEnvironments: () => api.get<EnvironmentDTO[]>('/api/environments'),
  createEnvironment: (data: CreateEnvironmentRequest) =>
    api.post<{ id: number }>('/api/environments', data),
  updateEnvironment: (id: number, data: UpdateEnvironmentRequest) =>
    apiRequest<void>(`/api/environments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEnvironment: (id: number) =>
    apiRequest<void>(`/api/environments/${id}`, { method: 'DELETE' }),
  setDefaultEnvironment: (id: number) =>
    apiRequest<void>(`/api/environments/${id}/set-default`, { method: 'PATCH' }),

  // Groups (strip env prefix from name)
  getGroups: () =>
    api.get<GroupDTO[]>('/api/groups').then((groups) =>
      groups.map((g) => ({ ...g, name: stripEnvPrefix(g.name) })),
    ),

  // Global config
  getGlobalConfig: () => api.get<GlobalConfigDTO>('/api/global-config'),
  updateGlobalConfig: (data: GlobalConfigRequest) =>
    api.put<void>('/api/global-config', data),

  // Auth password change
  changePassword: (data: { newPassword: string }) =>
    api.put<void>('/api/auth/password', data),

  // Analytics
  getAnalyticsSummary: (groupIds: number | number[], hours: number, pipelineView: string) => {
    const ids = Array.isArray(groupIds) ? groupIds.join(',') : String(groupIds)
    const params = new URLSearchParams({
      group_ids: ids,
      hours: String(hours),
      pipeline_view: pipelineView,
    })
    return apiRequest<AnalyticsSummary>(`/api/analytics/summary?${params}`)
  },
  getUsersAnalytics: (
    groupIds: number | number[],
    hours: number,
    membership: 'active' | 'non-active' | 'both' = 'both',
  ) => {
    const ids = Array.isArray(groupIds) ? groupIds.join(',') : String(groupIds)
    const safeMembership = membership === 'active' || membership === 'non-active' ? membership : 'both'
    const params = new URLSearchParams({
      group_ids: ids,
      hours: String(hours),
      membership: safeMembership,
    })
    return apiRequest<UserActivity[]>(`/api/analytics/users/options?${params}`)
  },
  getAnalyticsReadiness: (groupIds: number | number[]) => {
    const ids = Array.isArray(groupIds) ? groupIds.join(',') : String(groupIds)
    return apiRequest<AnalyticsReadiness>(`/api/analytics/readiness?group_ids=${ids}`)
  },

  // Scoped on-demand refresh (Pipelines Refresh button). The group id is the
  // federated id exactly as the UI holds it; the backend validates it against
  // the environment and decodes it for GitLab.
  triggerScopedRefresh: (environmentId: number, groupId: number) => {
    const params = new URLSearchParams({
      environment_id: String(environmentId),
      group_id: String(groupId),
    })
    return apiRequest<{ triggered: boolean; in_progress: boolean; message: string }>(
      `/api/sync/refresh?${params}`,
      { method: 'POST' },
    )
  },
  
  // Pipelines
  getPipelineProjects: (params: {
    group_id: number
    hours: number
    pipeline_view?: string
  }) => {
    const ids = Array.isArray(params.group_id)
      ? params.group_id.join(',')
      : String(params.group_id)
    const fetchPage = (page: number) => {
      const search = new URLSearchParams({
        group_id: ids,
        hours: String(params.hours),
        pipeline_view: params.pipeline_view === 'all' ? 'all' : 'latest',
        page: String(page),
        page_size: '500',
      })
      return apiRequest<Pipeline.Project[] | { total?: number; page_size?: number; projects?: Pipeline.Project[] }>(`/api/analytics/pipelines?${search}`)
    }

    return fetchPage(1).then(async (firstResponse) => {
      if (Array.isArray(firstResponse)) return firstResponse

      const firstProjects = firstResponse.projects ?? []
      const pageSize = firstResponse.page_size || 50
      const totalPages = Math.ceil((firstResponse.total || firstProjects.length) / pageSize)
      if (totalPages <= 1) return firstProjects

      const remaining = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) => fetchPage(index + 2)),
      )
      return [
        ...firstProjects,
        ...remaining.flatMap((response) => Array.isArray(response) ? response : (response.projects ?? [])),
      ]
    })
  },
  getProjectPipelineJobs: (projectId: number, pipelineId: number, scope?: string) => {
    const params = new URLSearchParams({
      project_id: String(projectId),
      pipeline_id: String(pipelineId),
    })
    if (scope) {
      params.set('scope', scope)
    }
    return apiRequest<JobInfo[]>(`/api/jobs?${params}`)
  },
  getBatchJobs: (pipelineIdsStr: string) => {
    const params = new URLSearchParams({
      pipeline_ids: pipelineIdsStr,
    })
    return apiRequest<JobInfo[]>(`/api/jobs/batch?${params}`)
  },
  startPipeline: (projectId: number, branch: string, envVars?: Record<string, string>) => {
    return api.post<{ id: number }>('/api/pipelines/start', {
      project_id: projectId,
      branch,
      env_vars: envVars,
    })
  },
  retryPipeline: (projectId: number, pipelineId: number) => {
    const params = new URLSearchParams({
      project_id: String(projectId),
      pipeline_id: String(pipelineId),
    })
    return apiRequest<void>(`/api/pipelines/retry?${params}`, { method: 'POST' })
  },
  cancelPipeline: (projectId: number, pipelineId: number) => {
    const params = new URLSearchParams({
      project_id: String(projectId),
      pipeline_id: String(pipelineId),
    })
    return apiRequest<void>(`/api/pipelines/cancel?${params}`, { method: 'POST' })
  },
   getProjectBranches: (projectId: number) => {
    return apiRequest<BranchInfo[]>(`/api/projects/${projectId}/branches`)
  },
}

export interface BranchInfo {
  name: string
  commit: {
    id: string
    message: string
    created_at: string
  }
  protected: boolean
}
