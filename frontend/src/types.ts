// ── Data Transfer Types (snake_case matches backend) ──

export interface EnvironmentDTO {
  id: number
  namespace_id: number
  name: string
  base_url: string
  group_ids: number[]
  enabled: boolean
  only_top_level: boolean
  include_subgroups: boolean
  token_configured: boolean
  last_tested_at: string | null
  last_error: string | null
  is_default: boolean
}

export interface CreateEnvironmentRequest {
  name: string
  base_url: string
  token: string
  group_ids: number[]
  enabled: boolean
  only_top_level: boolean
  include_subgroups: boolean
}

export interface UpdateEnvironmentRequest {
  name: string
  base_url: string
  token?: string
  group_ids: number[]
  enabled: boolean
  only_top_level: boolean
  include_subgroups: boolean
}

export interface AuthStatus {
  authenticated: boolean
  username: string
  role: string
  must_change_password: boolean
}

export interface GroupDTO {
  id: number
  name: string
  full_path: string
}

export interface GlobalConfigDTO {
  company_name: string
  company_logo: string
  pipeline_view: string
}

export interface GlobalConfigRequest {
  company_name: string
  company_logo?: string
  pipeline_view: string
}

// ── Analytics Types ──

export interface AnalyticsHistoryPoint {
  label: string
  pipeline_count: number
  project_count: number
}

export interface AnalyticsSummary {
  window_days: number
  window_hours: number
  group_count: number
  project_count: number
  pipeline_count: number
  success_count: number
  failed_count: number
  manual_count: number
  active_count: number
  canceled_count: number
  runner_count: number
  runner_running_count: number
  runner_idle_count: number
  runner_offline_count: number
  runner_stale_count: number
  runner_paused_count: number
  history: AnalyticsHistoryPoint[]
  success_rate: number
}

export interface UserActivity {
  id: number
  username: string
  name: string
  avatar_url: string
  web_url: string
  state: string
  is_admin: boolean
  is_current_member: boolean
  last_activity_on: string
  issue_count: number
  merge_request_count: number
  merged_count: number
  push_count: number
  comment_count: number
  last_pipeline_activity: string
  total_activity: number
}

export interface AnalyticsReadiness {
  ready: boolean
  data_available: boolean
  message: string
  last_completed_at: string | null
  project_count: number
  pipeline_count: number
  runner_state_count: number
  user_count: number
  user_event_count: number
  user_issue_count: number
  /** Present only on single-group (scoped) readiness: whether a scoped refresh
   *  for this exact env+group is still running. `false` (or null/undefined on
   *  the global path) means settled. */
  scoped_syncing?: boolean | null
  /** Non-secret reason when the last scoped refresh finished with an error. */
  scoped_error?: string | null
}

export type PipelineStatus =
  | 'created'
  | 'pending'
  | 'running'
  | 'failed'
  | 'canceled'
  | 'canceling'
  | 'skipped'
  | 'manual'
  | 'scheduled'
  | 'preparing'
  | 'waiting_for_resource'
  | 'success'

export type PipelineSource =
  | 'push'
  | 'web'
  | 'trigger'
  | 'schedule'
  | 'api'
  | 'external'
  | 'pipeline'
  | 'chat'
  | 'web_ide'
  | 'merge_request_event'
  | 'external_pull_request_event'
  | 'parent_pipeline'
  | 'ondemand_dast_scan'
  | 'ondemand_dast_validation'
  | 'security_orchestration_policy'

export namespace Pipeline {
  export interface Info {
    id: number
    iid: number
    project_id: number
    coverage: number | null
    sha: string
    ref: string
    status: PipelineStatus
    source: PipelineSource
    created_at: string
    updated_at: string
    web_url: string
  }

  export interface Project {
    group_id: number
    project: ProjectDTO
    pipelines: Info[]
  }

  export interface ProjectDTO {
    id: number
    name: string
    path: string
    web_url: string
    default_branch: string
    topics: string[]
    namespace: { id: number; name: string; path: string; full_path: string }
    jobs_enabled: boolean
  }
}

export type JobStatus =
  | 'created'
  | 'pending'
  | 'running'
  | 'failed'
  | 'success'
  | 'canceled'
  | 'canceling'
  | 'skipped'
  | 'waiting_for_resource'
  | 'manual'

export interface JobInfo {
  id: number
  name: string
  stage: string
  ref: string
  status: JobStatus
  allow_failure: boolean
  web_url: string
  created_at: string
  pipeline_id: number
  project_id: number
  finished_at?: string | null
  duration?: number | null
  queued_duration?: number | null
  started_at?: string | null
  when?: string | null
  trigger?: string | null
  runner_id?: number | null
  runner_name?: string | null
  runner_description?: string | null
  commit_sha?: string | null
  pipeline_sha?: string | null
  commit_short_message?: string | null
  parent_job_id?: number | null
  tag_list?: string[] | null
  failure_reason?: string | null
}

export interface PipelineInfo {
  id: number
  iid: number
  project_id: number
  coverage: number | null
  sha: string
  ref: string
  status: PipelineStatus
  source: PipelineSource
  created_at: string
  updated_at: string
  web_url: string
}

// ── Relations Map / Graph Types ──

export type GraphNodeType = 'user' | 'group' | 'project' | 'branch' | 'pipeline' | 'job'

export type GraphEdgeType = 'user-group' | 'group-project' | 'project-branch' | 'branch-pipeline' | 'pipeline-job' | 'user-project'

export type GraphMapType = 'user-group-project' | 'project-branch-pipeline-jobs'

export interface GraphNode {
  id: string
  type: GraphNodeType
  label: string
  secondary_label: string
  status?: string
  avatar_url?: string
  web_url?: string
  path_with_ns?: string
  pipeline_count?: number
  default_branch?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: GraphEdgeType
  evidence_type?: string
}

export interface GraphMetadata {
  map_type: GraphMapType
  node_count: number
  edge_count: number
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  metadata: GraphMetadata
}

export interface GraphOptionItem {
  value: string | number
  label: string
}

export interface GraphOptionsResponse {
  users?: GraphOptionItem[]
  projects?: GraphOptionItem[]
  statuses?: string[]
}
