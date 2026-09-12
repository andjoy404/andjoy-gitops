import { Tag, Tooltip, Space, Modal } from 'antd'
import { LoadingOutlined, CloseOutlined, FullscreenOutlined, BranchesOutlined, ClockCircleOutlined, DashboardOutlined, UserOutlined, TagOutlined, CodeOutlined, EnvironmentOutlined, ReloadOutlined } from '@ant-design/icons'
import type { PipelineStatus, PipelineSource, JobStatus, JobInfo } from '../types'
import type { PipelineInfo } from '../types'
import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react'
import ReactFlow, {
  Background,
  Handle,
  Position,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  type EdgeProps,
  getSmoothStepPath,
} from 'reactflow'
import 'reactflow/dist/style.css'
import '../styles/pipelines.css'
import { getTheme, useTheme } from '../hooks/useTheme'

export const PIPELINE_STATUS_COLORS: Record<PipelineStatus, string> = {
  created: '#39A0FF',
  pending: '#9AA3AD',
  running: '#39A0FF',
  success: '#18D99A',
  failed: '#FF5267',
  canceled: 'var(--dashboard-muted)',
  canceling: 'var(--dashboard-muted)',
  skipped: '#FF9F2F',
  manual: '#FFC21C',
  approval: '#FFC21C',
  scheduled: '#A970FF',
  preparing: '#39A0FF',
  waiting_for_resource: '#9AA3AD',
}

export const PIPELINE_STATUSES: { label: string; value: PipelineStatus }[] = [
  { label: 'Created', value: 'created' },
  { label: 'Pending', value: 'pending' },
  { label: 'Running', value: 'running' },
  { label: 'Success', value: 'success' },
  { label: 'Failed', value: 'failed' },
  { label: 'Canceled', value: 'canceled' },
  { label: 'Canceling', value: 'canceling' },
  { label: 'Skipped', value: 'skipped' },
  { label: 'Manual', value: 'manual' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Preparing', value: 'preparing' },
  { label: 'Waiting for resource', value: 'waiting_for_resource' },
]

const SPIN_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  'created', 'waiting_for_resource', 'preparing', 'pending',
  'running', 'manual', 'scheduled',
] as JobStatus[])

export function formatRelative(dateStr: string): string {
  if (!dateStr) return '-'
  const now = Date.now()
  const then = Date.parse(dateStr)
  if (Number.isNaN(then)) return '-'
  const diffMs = now - then
  const diffSec = diffMs / 1000
  if (diffSec < 60) return `${Math.round(diffSec)} second${Math.round(diffSec) === 1 ? '' : 's'} ago`
  const minutes = Math.round(diffSec / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  const remainingMin = minutes % 60
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago at ${String(hours).padStart(2, '0')}:${String(remainingMin).padStart(2, '0')}`
  const days = Math.round(diffMs / 86400000)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago at ${formatDate(then)}`
  const weeks = Math.round(diffMs / 604800000)
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago at ${formatDate(then)}`
  const months = Math.round(diffMs / 2592000000)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago at ${formatDate(then)}`
  const years = Math.round(diffMs / 31536000000)
  return `${years} year${years === 1 ? '' : 's'} ago at ${formatDate(then)}`
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  }).format(date)
}

export function pipelineLastRunTime(row: { latestPipeline?: PipelineInfo }): number | null {
  const p = row.latestPipeline
  if (!p) return null
  const raw = p.updated_at || p.created_at
  if (!raw) return null
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? null : t
}

export function pipelineRowKey(r: { latestPipeline?: PipelineInfo; projectId: number; projectPath: string | undefined; projectName: string | undefined }): string {
  return `pipeline-${r.latestPipeline?.id || r.projectId}-${r.projectPath}/${r.projectName}`
}

/* GitLab's jobs response exposes the stage name but not its numeric position.
   Jobs are created in compiled pipeline order, so the earliest creation time
   (then GitLab job id) provides a deterministic stage sequence. */
export function orderJobsByStageSequence(jobs: JobInfo[]): JobInfo[] {
  const stageSeed = new Map<string, { createdAt: number; id: number; firstIndex: number }>()

  jobs.forEach((job, index) => {
    const stage = job.stage || ''
    const parsed = Date.parse(job.created_at)
    const createdAt = Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
    const current = stageSeed.get(stage)
    if (
      !current ||
      createdAt < current.createdAt ||
      (createdAt === current.createdAt && job.id < current.id)
    ) {
      stageSeed.set(stage, { createdAt, id: job.id, firstIndex: current?.firstIndex ?? index })
    }
  })

  const stages = [...stageSeed.entries()].sort(([stageA, a], [stageB, b]) => {
    if (stageA === '.pre') return stageB === '.pre' ? 0 : -1
    if (stageB === '.pre') return 1
    if (stageA === '.post') return stageB === '.post' ? 0 : 1
    if (stageB === '.post') return -1
    return a.createdAt - b.createdAt || a.id - b.id || a.firstIndex - b.firstIndex
  })
  const stageRank = new Map(stages.map(([stage], index) => [stage, index]))

   return jobs
     .map((job, index) => ({ job, index }))
     .sort((a, b) =>
       (stageRank.get(a.job.stage || '') ?? Number.MAX_SAFE_INTEGER) -
         (stageRank.get(b.job.stage || '') ?? Number.MAX_SAFE_INTEGER) ||
       a.index - b.index,
     )
     .map(({ job }) => job)
 }

 /* ── Dedup retry jobs: keep only latest per (base job name) ──────────── */

 const RETRY_SUFFIX = /\s*\(retry\s+\d+\)$/i

 export function stripRetrySuffix(name: string): string {
   return name.replace(RETRY_SUFFIX, '').trim()
 }

 export function dedupRetryJobs(jobs: JobInfo[]): JobInfo[] {
   const latestByBaseName = new Map<string, JobInfo>()
   for (const job of jobs) {
     const baseName = stripRetrySuffix(job.name)
     const existing = latestByBaseName.get(baseName)
     if (!existing || (job.created_at ?? '') > (existing.created_at ?? '')) {
       latestByBaseName.set(baseName, job)
     }
   }
   return orderJobsByStageSequence(Array.from(latestByBaseName.values()))
 }

 export function getPipelineEffectiveStatus(
    pipeline?: PipelineInfo | null,
    rawJobs: JobInfo[] = [],
  ): PipelineStatus {
    let s = String(pipeline?.status || 'unknown').toLowerCase().trim() as PipelineStatus

    if (!rawJobs || rawJobs.length === 0) {
      if (s === 'created') return 'running'
      return s || 'unknown'
    }

    const jobs = orderJobsByStageSequence(rawJobs)

    const hasChildJobs = jobs.some(j => j.parent_job_id !== null)
    const firstChildIdx = jobs.findIndex(j => j.parent_job_id !== null)
    const arrowIndex = hasChildJobs && jobs.length > 1 ? (firstChildIdx > 0 ? firstChildIdx : 1) : -1
    const parentJobs = hasChildJobs && arrowIndex >= 0 ? jobs.slice(0, arrowIndex) : (hasChildJobs ? jobs.filter(j => j.parent_job_id === null) : jobs)
    const childJobs = hasChildJobs && arrowIndex >= 0 ? jobs.slice(arrowIndex) : jobs.filter(j => j.parent_job_id !== null)

    const targetJob = childJobs.length > 0
      ? childJobs[childJobs.length - 1]
      : (parentJobs.length > 0 ? parentJobs[parentJobs.length - 1] : undefined)

    const manualOrApprovalJob = jobs.find(
      j => String(j.status || '').toLowerCase() === 'manual' ||
           String(j.status || '').toLowerCase() === 'approval' ||
           String(j.name || '').toLowerCase().trim() === 'approval' ||
           String(j.name || '').toLowerCase().includes('approval')
    )

    const isManualOrApproval = (j?: { status?: string; name?: string } | null) => {
      if (!j) return false
      const st = String(j.status || '').toLowerCase().trim()
      const nm = String(j.name || '').toLowerCase().trim()
      return st === 'manual' || st === 'approval' || nm === 'approval' || nm.includes('approval')
    }

    if (childJobs.length > 0) {
      if (targetJob) {
        if (isManualOrApproval(targetJob)) {
          s = 'manual'
        } else if (targetJob.status) {
          s = String(targetJob.status).toLowerCase().trim() as PipelineStatus
        }
      }
    } else if (parentJobs.length > 0) {
      if (isManualOrApproval(targetJob) || manualOrApprovalJob) {
        s = 'manual'
      } else if (targetJob?.status) {
        s = String(targetJob.status).toLowerCase().trim() as PipelineStatus
      }
    }

    if (s === 'created') {
      s = 'running'
    }

    return s
  }

 function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}

function formatJobWhen(whenKeyword: string | null, trigger: string | null): string {
  if (trigger && trigger.toLowerCase() !== 'on_success') {
    return trigger.charAt(0).toUpperCase() + trigger.slice(1)
  }
  const whenLabels: Record<string, string> = {
    on_success: 'on_success',
    on_failure: 'on_failure',
    manual: 'manual',
    always: 'always',
    delayed: 'delayed',
    startup: 'startup',
  }
  return whenKeyword ? (whenLabels[whenKeyword] || whenKeyword) : '—'
}

/* ── Aggregates child jobs into a summary card ──────────────────── */

function aggregateChildStats(jobs: JobInfo[]) {
  if (jobs.length === 0) return null
  let maxDuration = 0
  let maxQueued = 0
  let hasRunning = false
  for (const job of jobs) {
    if (SPIN_JOB_STATUSES.has(job.status)) hasRunning = true
    maxDuration = Math.max(maxDuration, job.duration ?? 0)
    maxQueued = Math.max(maxQueued, job.queued_duration ?? 0)
  }
  return { count: jobs.length, maxDuration, maxQueued, hasRunning }
}

function ChildSummary({ statusColor, summary }: { statusColor: string; summary: { count: number; maxDuration: number; maxQueued: number; hasRunning: boolean } }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap',
        marginLeft: '4px',
      }}
    >
      <Tag
        style={{
          margin: 0,
          padding: '0 8px',
          borderRadius: 6,
          border: `1px solid ${statusColor}33`,
          background: `${statusColor}11`,
          color: statusColor,
          fontWeight: 600,
          fontSize: '0.85em',
          lineHeight: '16px',
        }}
      >
        {summary.hasRunning ? (
          <LoadingOutlined style={{ fontSize: 11, marginRight: 2 }} />
        ) : null}
        <span>{summary.count} job{summary.count !== 1 ? 's' : ''}</span>
      </Tag>
      {summary.maxDuration > 0 ? (
        <span style={{ color: 'var(--dashboard-muted)', fontSize: '0.85em' }}>
          {formatDuration(summary.maxDuration)}
        </span>
      ) : null}
      {summary.maxQueued > 0 ? (
        <span style={{ color: 'var(--dashboard-muted)', fontSize: '0.85em' }}>
          queued for {formatDuration(summary.maxQueued)}
        </span>
      ) : null}
    </div>
  )
}

/* ── Job detail properties ───────────────────────────────────────────── */

function JobDetailProperty({ icon, label, children }: { icon: React.ReactElement; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '6px', alignItems: 'flex-start' }}>
      <span style={{ width: 36, flexShrink: 0, color: 'var(--dashboard-muted)', fontSize: '0.85em', textAlign: 'center', paddingTop: 2 }}>
        {icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ color: 'var(--dashboard-muted)', fontSize: '0.78em', fontWeight: 500, marginBottom: '1px' }}>{label}</div>
        <div style={{ fontSize: '0.9em', lineHeight: 1.4 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

/* ── Shared modal body content ────────────────────────────────────────── */

function JobDetailBody({ job, pipelineSha, projectWebUrl }: { job: JobInfo; pipelineSha?: string; projectWebUrl?: string }) {
  return (
    <div style={{ color: 'var(--dashboard-text)', background: 'var(--dashboard-surface)' }}>
      {/* Action link */}
      <div style={{ marginBottom: '12px' }}>
        <a
          href={job.web_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.85em',
            color: 'var(--dashboard-accent)',
            textDecoration: 'none',
          }}
        >
          Open in GitLab →
        </a>
      </div>

      {/* Metrics grid */}
      {(job.duration !== undefined || job.finished_at || job.queued_duration !== undefined) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <JobDetailProperty icon={<ClockCircleOutlined style={{ fontSize: 14 }} />} label="Duration">
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 500 }}>{formatDuration(job.duration ?? null)}</span>
          </JobDetailProperty>
          <JobDetailProperty icon={<DashboardOutlined style={{ fontSize: 14 }} />} label="Finished">
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 500, fontSize: '0.9em', whiteSpace: 'nowrap' }}>{formatTimeAgo(job.finished_at || '')}</span>
          </JobDetailProperty>
          <JobDetailProperty icon={<ClockCircleOutlined style={{ fontSize: 14, opacity: 0.6 }} />} label="Queued">
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 500 }}>{formatDuration(job.queued_duration ?? null)}</span>
          </JobDetailProperty>
        </div>
      )}

      {/* Commit, Ref, Triggered-by, Tags row — columns adapt to available fields */}
      {((pipelineSha || job.commit_sha) || job.ref || job.pipeline_user_username || (job.tag_list && job.tag_list.length > 0)) && (() => {
        const hasCommit = typeof pipelineSha === 'string' || typeof job.commit_sha === 'string'
        const hasRef = typeof job.ref === 'string' && job.ref.length > 0
        const hasAuthor = typeof job.pipeline_user_username === 'string' && job.pipeline_user_username.trim().length > 0
        const hasTags = job.tag_list && job.tag_list.length > 0
        const hasSomething = hasCommit || hasRef || hasAuthor || hasTags
        if (!hasSomething) return null
        const colSizes: string[] = []
        if (hasCommit) colSizes.push('1fr')
        if (hasRef) colSizes.push('1fr')
        if (hasAuthor) colSizes.push('1fr')
        if (hasTags) colSizes.push('1fr')
        return (
          <div style={{ display: 'grid', gridTemplateColumns: colSizes.join(' '), gap: '8px', marginBottom: '10px' }}>
            {hasCommit && (
              <JobDetailProperty icon={<CodeOutlined style={{ fontSize: 14 }} />} label="Commit">
                <a
                  href={`${projectWebUrl}/-/commit/${pipelineSha || job.commit_sha}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--dashboard-accent)', textDecoration: 'none' }}
                >
                  {(pipelineSha || job.commit_sha)?.substring(0, 12)}
                </a>
              </JobDetailProperty>
            )}
            {hasRef && (
              <JobDetailProperty icon={<BranchesOutlined style={{ fontSize: 14 }} />} label="Ref">
                <span className="pipeline-branch">{job.ref}</span>
              </JobDetailProperty>
            )}
            {hasAuthor && (
              <JobDetailProperty icon={<UserOutlined style={{ fontSize: 14 }} />} label="Triggered by">
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 500 }}>
                  @{job.pipeline_user_username!.replace(/^@/, '')}
                </span>
              </JobDetailProperty>
            )}
            {hasTags && (
              <JobDetailProperty icon={<TagOutlined style={{ fontSize: 14 }} />} label="Tags">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                  {job.tag_list!.map(tag => (
                    <Tag key={tag} className="job-tags-badge">{tag}</Tag>
                  ))}
                </div>
              </JobDetailProperty>
            )}
          </div>
        )
      })()}

      {/* Failure reason */}
      {job.failure_reason && job.status === 'failed' && (
        <div style={{ marginTop: '10px', padding: '8px 10px', background: 'color-mix(in srgb, var(--dashboard-danger) 12%, var(--dashboard-surface))', border: '1px solid color-mix(in srgb, var(--dashboard-danger) 35%, var(--dashboard-border))', borderRadius: 6 }}>
          <div style={{ color: 'var(--dashboard-danger)', fontSize: '0.78em', fontWeight: 600, marginBottom: '2px' }}>Failure Reason</div>
          <div style={{ color: 'var(--dashboard-danger)', fontSize: '0.9em' }}>{job.failure_reason}</div>
        </div>
      )}
    </div>
  )
}

/* ── Shared modal shell ──────────────────────────────────────────────── */

function JobDetailModalBase({
  job,
  pipelineSha,
  projectWebUrl,
  onAfterClose,
  COLORS,
  showContent,
  children,
}: {
  job: JobInfo | null
  pipelineSha?: string
  projectWebUrl?: string
  onAfterClose: () => void
  COLORS: Record<string, string>
  showContent: boolean
  children?: React.ReactNode
}) {
  return (
    <Modal
      open={job !== null}
      centered
      closable={true}
      maskClosable={true}
      keyboard={true}
      footer={null}
      width={850}
      rootClassName="job-detail-modal"
      onCancel={onAfterClose}
      styles={{
        mask: {
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        } as React.CSSProperties,
        content: {
          background: 'var(--dashboard-surface)',
          border: '1px solid var(--dashboard-border)',
          borderRadius: '11px',
        } as React.CSSProperties,
        body: {
          color: 'var(--dashboard-text)',
          padding: '0.95rem 1.05rem 1rem',
        } as React.CSSProperties,
        header: {
          color: 'var(--dashboard-text)',
          background: 'var(--dashboard-surface)',
        },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--dashboard-text)' }}>
          {job && <BranchesOutlined style={{ color: COLORS[job.status === 'created' ? 'running' : job.status] || '#9AA3AD', fontSize: '1.1em' }} />}
          <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dashboard-text)' }}>{job?.name}</span>
          {job && (() => {
            const st = job.status === 'created' ? 'running' : job.status
            return (
              <Tag
                className="job-status-badge"
                style={{ '--job-status-color': COLORS[st] || '#9AA3AD' } as React.CSSProperties}
              >
                {st?.charAt(0).toUpperCase() + (st || '').slice(1)}
              </Tag>
            )
          })()}
        </div>
      }
    >
      {job && (
        <>
          {showContent && <JobDetailBody job={job} pipelineSha={pipelineSha} projectWebUrl={projectWebUrl} />}
          {children}
        </>
      )}
    </Modal>
  )
}

/* ── ParentJobDetailModal — parent job detail with DAG graph ─────────── */

export function ParentJobDetailModal({
  job,
  allJobs,
  pipelineSha,
  projectWebUrl,
  onAfterClose,
  COLORS,
}: {
  job: JobInfo | null
  allJobs?: JobInfo[]
  pipelineSha?: string
  projectWebUrl?: string
  onAfterClose: () => void
  COLORS: Record<string, string>
}) {
  return (
    <JobDetailModalBase job={job} pipelineSha={pipelineSha} projectWebUrl={projectWebUrl} onAfterClose={onAfterClose} COLORS={COLORS} showContent={true}>
      {job && allJobs && (
        <div style={{ marginTop: '20px', paddingTop: '14px' }}>
          <div style={{ width: '100%', height: '520px', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--dashboard-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', background: 'var(--dashboard-surface)', display: 'flex', flexDirection: 'column' }}>
            <ReactFlowProvider>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 4px 12px', background: 'var(--dashboard-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: 3,
                    height: 14,
                    borderRadius: 2,
                    background: 'linear-gradient(to bottom, var(--dashboard-accent), var(--dashboard-accent)80)',
                  }} />
                  <span style={{ fontSize: '0.82em', fontWeight: 600, color: 'var(--dashboard-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Pipeline DAG</span>
                </div>
                <FitViewButton />
              </div>
              <div style={{ flex: 1, height: 0 }}>
                <PipelineDAGWrapper jobs={dedupRetryJobs(allJobs)} selectedJob={job} COLORS={COLORS} />
              </div>
            </ReactFlowProvider>
          </div>
        </div>
      )}
      {job && allJobs && (() => {
        const childJobs = allJobs?.filter(j => j.parent_job_id != null && Number(j.parent_job_id) === Number(job?.id)) || []
        const hasChildren = childJobs.length > 0
        if (!hasChildren) return null
        return (
          <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--dashboard-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <div style={{
                width: 3,
                height: 16,
                borderRadius: 2,
                background: 'linear-gradient(to bottom, var(--dashboard-muted), var(--dashboard-muted)80)',
              }} />
              <span style={{ fontSize: '0.82em', fontWeight: 600, color: 'var(--dashboard-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Child Jobs</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {childJobs.map(child => (
                <Tag
                  key={child.id}
                  style={{
                    cursor: 'pointer',
                    border: 'none',
                    background: 'color-mix(in srgb, var(--dashboard-accent) 15%, var(--dashboard-surface))',
                    color: 'var(--dashboard-text)',
                  }}
                >
                  {child.name}
                </Tag>
              ))}
            </div>
          </div>
        )
      })()}
    </JobDetailModalBase>
  )
}

/* ── ChildJobDetailModal — child job detail with DAG ─────────────────── */

export function ChildJobDetailModal(props: {
  job: JobInfo | null
  allJobs?: JobInfo[]
  pipelineSha?: string
  projectWebUrl?: string
  onAfterClose: () => void
  COLORS: Record<string, string>
}) {
  return <ParentJobDetailModal {...props} />
}

/* ── Export for backwards compatibility ──────────────────────────────── */

export function JobDetailModal({
  job,
  allJobs,
  pipelineSha,
  projectWebUrl,
  onAfterClose,
  COLORS,
}: {
  job: JobInfo | null
  allJobs?: JobInfo[]
  pipelineSha?: string
  projectWebUrl?: string
  onAfterClose: () => void
  COLORS: Record<string, string>
  isParentJob?: boolean
}) {
  return (
    <ParentJobDetailModal
      job={job}
      allJobs={allJobs}
      pipelineSha={pipelineSha}
      projectWebUrl={projectWebUrl}
      onAfterClose={onAfterClose}
      COLORS={COLORS}
    />
  )
}

/* ── Main component ───────────────────────────────────────────── */

export function PipelineJobBadges({
  projectId,
  pipelineId,
  jobsByPipeline,
  projectIdStr,
  pipelineSha,
  projectWebUrl,
}: {
  projectId: number
  pipelineId: number
  jobsByPipeline: Map<number, JobInfo[]>
  projectIdStr?: string
  pipelineSha?: string
  projectWebUrl?: string
}) {
  const jobs = dedupRetryJobs(jobsByPipeline.get(pipelineId) || [])

  if (jobs.length === 0) {
    return <span style={{ color: 'var(--dashboard-muted)' }}>—</span>
  }

  const [selectedJob, setSelectedJob] = useState<JobInfo | null>(null)
  const [selectedBadgeRef, setSelectedBadgeRef] = useState<HTMLElement | null>(null)
  const [isParentJob, setIsParentJob] = useState(false)

  const JOB_STATUS_TEXT_COLORS: Record<JobStatus, string> = {
    created: '#39A0FF',
    pending: '#9AA3AD',
    running: '#39A0FF',
    success: '#18D99A',
    failed: '#FF5267',
    canceled: 'var(--dashboard-muted)',
    canceling: 'var(--dashboard-muted)',
    skipped: '#FF9F2F',
    manual: '#FFC21C',
    approval: '#FFC21C',
    waiting_for_resource: '#9AA3AD',
  }

  const hasChildJobs = jobs.some(j => j.parent_job_id !== null)
  const firstChildIdx = jobs.findIndex(j => j.parent_job_id !== null)
  const arrowIndex = hasChildJobs && jobs.length > 1 ? (firstChildIdx > 0 ? firstChildIdx : 1) : -1

  const handleAfterClose = useCallback(() => {
    setSelectedJob(null)
  }, [])

  const handleClick = useCallback((jobIndex: number, job: JobInfo, target: HTMLElement) => {
    setSelectedBadgeRef(target)
    setSelectedJob(prev => prev && prev.id === job.id ? null : job)
    if (arrowIndex >= 0 && jobIndex < arrowIndex) {
      setIsParentJob(true)
    } else {
      setIsParentJob(false)
    }
  }, [arrowIndex])

  const showJob = selectedJob !== null

  function renderBadge(job: JobInfo, jobIndex: number) {
    const rawStatus = String(job.status || '').toLowerCase()
    const status = (rawStatus === 'created' ? 'running' : job.status) as JobStatus
    const isSpinJob = SPIN_JOB_STATUSES.has(status)
    const effectiveJob = { ...job, status }
    return (
      <Tooltip
        key={job.id}
        className="pipeline-job-tooltip"
        title={
          <div>
            <div><strong>{job.name}</strong></div>
            <div>Stage: {job.stage} · Status: {status}</div>
          </div>
        }
      >
        <span
          className="pipeline-job-badge"
          onClick={(e) => { handleClick(jobIndex, effectiveJob, e.currentTarget) }}
          style={{"--job-color": JOB_STATUS_TEXT_COLORS[status] || '#9AA3AD', cursor: 'pointer'} as React.CSSProperties}
        >
          {isSpinJob && (
            <LoadingOutlined style={{ color: JOB_STATUS_TEXT_COLORS[status] || '#9AA3AD', fontSize: 11 }} />
          )}
          <span style={{ fontSize: '1em', whiteSpace: 'nowrap' }}>
            {job.name.length > 12 ? `${job.name.substring(0, 10)}…` : job.name}
          </span>
          {showJob && selectedJob && selectedJob.id === job.id && (
            <FullscreenOutlined style={{ fontSize: 10, marginLeft: 2, opacity: 0.6 }} />
          )}
        </span>
      </Tooltip>
    )
  }

  return (
    <>
      {hasChildJobs && arrowIndex >= 0 ? (
        <div className="pipeline-job-badges">
          {jobs.slice(0, arrowIndex).map((job, idx) => renderBadge(job, idx))}
          <Tooltip title="Parent Job" className="pipeline-arrow-tooltip">
            <span className="pipeline-connector">↑</span>
          </Tooltip>
          <Tooltip title="Child Job" className="pipeline-arrow-tooltip">
            <span className="pipeline-connector">↓</span>
          </Tooltip>
          {jobs.slice(arrowIndex).map((job, idx) => renderBadge(job, arrowIndex + idx))}
        </div>
      ) : (
        <div className="pipeline-job-badges">
          {jobs.map((job, idx) => renderBadge(job, idx))}
        </div>
      )}
      <JobDetailModal
        job={selectedJob}
        allJobs={jobs}
        projectWebUrl={projectWebUrl}
        pipelineSha={pipelineSha}
        onAfterClose={handleAfterClose}
        COLORS={PIPELINE_STATUS_COLORS}
        isParentJob={isParentJob}
      />
    </>
  )
}

/* ── PipelineDetailModal — pipeline row detail with status info + DAG graph ── */

export function PipelineDetailModal({
  pipeline,
  jobs,
  projectWebUrl,
  onAfterClose,
  COLORS,
}: {
  pipeline: PipelineInfo | null
  jobs: JobInfo[]
  projectWebUrl?: string
  onAfterClose: () => void
  COLORS: Record<string, string>
}) {
  return (
    <Modal
      open={pipeline !== null}
      centered
      closable={true}
      maskClosable={true}
      keyboard={true}
      footer={null}
      width={850}
      rootClassName="job-detail-modal"
      onCancel={onAfterClose}
      styles={{
        mask: {
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        } as React.CSSProperties,
        content: {
          background: 'var(--dashboard-surface)',
          border: '1px solid var(--dashboard-border)',
          borderRadius: '11px',
        } as React.CSSProperties,
        body: {
          color: 'var(--dashboard-text)',
          padding: '0.95rem 1.05rem 1rem',
        } as React.CSSProperties,
        header: {
          color: 'var(--dashboard-text)',
          background: 'var(--dashboard-surface)',
        },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {pipeline && (() => {
            const st = pipeline.status === 'created' ? 'running' : pipeline.status
            return (
              <Tag
                className="job-status-badge"
                style={{ '--job-status-color': COLORS[st] || '#9AA3AD' } as React.CSSProperties}
              >
                {st?.charAt(0).toUpperCase() + (st || '').slice(1)}
              </Tag>
            )
          })()}
          <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--dashboard-text)' }}>
            Pipeline #{pipeline?.id}
          </span>
        </div>
      }
    >
      {pipeline && (
        <>
          <div style={{ color: 'var(--dashboard-text)', background: 'var(--dashboard-surface)' }}>
            {/* Action link */}
            <div style={{ marginBottom: '12px' }}>
              <a
                href={pipeline.web_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.85em',
                  color: 'var(--dashboard-accent)',
                  textDecoration: 'none',
                }}
              >
                Open in GitLab →
              </a>
            </div>

            {/* Metrics grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <JobDetailProperty icon={<DashboardOutlined style={{ fontSize: 14 }} />} label="Created">
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 500, fontSize: '0.9em', whiteSpace: 'nowrap' }}>{formatTimeAgo(pipeline.created_at)}</span>
              </JobDetailProperty>
              <JobDetailProperty icon={<ClockCircleOutlined style={{ fontSize: 14 }} />} label="Updated">
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 500, fontSize: '0.9em', whiteSpace: 'nowrap' }}>{formatTimeAgo(pipeline.updated_at)}</span>
              </JobDetailProperty>
              <JobDetailProperty icon={<EnvironmentOutlined style={{ fontSize: 14 }} />} label="Source">
                <Tag className="pipeline-trigger-badge">{String(pipeline.source).replace(/_/g, ' ')}</Tag>
              </JobDetailProperty>
            </div>

            {/* Commit, Ref, Triggered by row */}
            {(() => {
              const triggerUser = (pipeline as any)?.pipeline_user_username || jobs.find(j => j.pipeline_user_username)?.pipeline_user_username
              const hasCommit = Boolean(pipeline.sha)
              const hasRef = Boolean(pipeline.ref)
              const hasAuthor = typeof triggerUser === 'string' && triggerUser.trim().length > 0
              if (!hasCommit && !hasRef && !hasAuthor) return null
              const colSizes: string[] = []
              if (hasCommit) colSizes.push('1fr')
              if (hasRef) colSizes.push('1fr')
              if (hasAuthor) colSizes.push('1fr')
              return (
                <div style={{ display: 'grid', gridTemplateColumns: colSizes.join(' '), gap: '8px', marginBottom: '10px' }}>
                  {hasCommit && (
                    <JobDetailProperty icon={<CodeOutlined style={{ fontSize: 14 }} />} label="Commit">
                      <a
                        href={`${projectWebUrl}/-/commit/${pipeline.sha}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--dashboard-accent)', textDecoration: 'none' }}
                      >
                        {pipeline.sha.substring(0, 12)}
                      </a>
                    </JobDetailProperty>
                  )}
                  {hasRef && (
                    <JobDetailProperty icon={<BranchesOutlined style={{ fontSize: 14 }} />} label="Ref">
                      <span className="pipeline-branch">{pipeline.ref}</span>
                    </JobDetailProperty>
                  )}
                  {hasAuthor && (
                    <JobDetailProperty icon={<UserOutlined style={{ fontSize: 14 }} />} label="Triggered by">
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 500 }}>
                        @{triggerUser.replace(/^@/, '')}
                      </span>
                    </JobDetailProperty>
                  )}
                </div>
              )
            })()}
          </div>

          {/* DAG graph */}
          {jobs.length > 0 && (
            <div style={{ marginTop: '20px', paddingTop: '14px' }}>
              <div style={{ width: '100%', height: '520px', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--dashboard-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', background: 'var(--dashboard-surface)', display: 'flex', flexDirection: 'column' }}>
                <ReactFlowProvider>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px 4px 12px', background: 'var(--dashboard-surface)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: 3,
                        height: 14,
                        borderRadius: 2,
                        background: 'linear-gradient(to bottom, var(--dashboard-accent), var(--dashboard-accent)80)',
                      }} />
                      <span style={{ fontSize: '0.82em', fontWeight: 600, color: 'var(--dashboard-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Pipeline DAG ({ jobs.length } jobs)</span>
                    </div>
                    <FitViewButton />
                  </div>
                  <div style={{ flex: 1, height: 0 }}>
                    <PipelineDAGWrapper jobs={dedupRetryJobs(jobs)} selectedJob={null} COLORS={COLORS} />
                  </div>
                </ReactFlowProvider>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

/* ── Pipeline DAG graph (all jobs grouped by stage) for the job detail modal ── */

const PIPELINE_STATUS_GRADIENTS: Record<string, string> = {
  success: 'linear-gradient(135deg, #18d99a 0%, #10b981 100%)',
  failed: 'linear-gradient(135deg, #ff5267 0%, #ef4444 100%)',
  running: 'linear-gradient(135deg, #39a0ff 0%, #0ea5e9 100%)',
  canceled: 'linear-gradient(135deg, #9aa3ad 0%, #6b7280 100%)',
  canceling: 'linear-gradient(135deg, #9aa3ad 0%, #6b7280 100%)',
  skipped: 'linear-gradient(135deg, #ff9f2f 0%, #f59e0b 100%)',
  manual: 'linear-gradient(135deg, #ffc21c 0%, #eab308 100%)',
  created: 'linear-gradient(135deg, #39a0ff 0%, #0ea5e9 100%)',
  pending: 'linear-gradient(135deg, #9aa3ad 0%, #6b7280 100%)',
  waiting_for_resource: 'linear-gradient(135deg, #9aa3ad 0%, #6b7280 100%)',
  scheduled: 'linear-gradient(135deg, #a970ff 0%, #8b5cf6 100%)',
  preparing: 'linear-gradient(135deg, #39a0ff 0%, #0ea5e9 100%)',
}

export function getAccentColor(status: string): string {
  const m: Record<string, string> = {
    created: '#39A0FF',
    pending: '#9AA3AD',
    running: '#39A0FF',
    success: '#18D99A',
    failed: '#FF5267',
    canceled: '#9AA3AD',
    canceling: '#9AA3AD',
    skipped: '#FF9F2F',
    manual: '#FFC21C',
    scheduled: '#A970FF',
    preparing: '#39A0FF',
    waiting_for_resource: '#9AA3AD',
  }
  return m[status] || '#6b7280'
}

const STATUS_GRADIENTS: Record<string, string> = {
  created: 'linear-gradient(135deg, #39A0FF 0%, #2d7ed9 100%)',
  pending: 'linear-gradient(135deg, #9AA3AD 0%, #7a828a 100%)',
  running: 'linear-gradient(135deg, #39A0FF 0%, #2d7ed9 100%)',
  success: 'linear-gradient(135deg, #18D99A 0%, #10b882 100%)',
  failed: 'linear-gradient(135deg, #FF5267 0%, #e04559 100%)',
  canceled: 'linear-gradient(135deg, #9AA3AD 0%, #7a828a 100%)',
  canceling: 'linear-gradient(135deg, #9AA3AD 0%, #7a828a 100%)',
  skipped: 'linear-gradient(135deg, #FF9F2F 0%, #e08a1f 100%)',
  manual: 'linear-gradient(135deg, #FFC21C 0%, #e0a810 100%)',
  scheduled: 'linear-gradient(135deg, #A970FF 0%, #8b5cf0 100%)',
  preparing: 'linear-gradient(135deg, #39A0FF 0%, #2d7ed9 100%)',
  waiting_for_resource: 'linear-gradient(135deg, #9AA3AD 0%, #7a828a 100%)',
}

/* ── Particle edge — flowing dots along the connection ── */

function ParticleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
}: EdgeProps) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const isDark = useTheme() === 'dark'

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={isDark ? '#555' : '#777'}
        strokeWidth={1}
        opacity={0.5}
        style={style as React.CSSProperties}
      />
      <path
        d={edgePath}
        fill="none"
        stroke={isDark ? '#8b949e' : '#7a828a'}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="3 21"
        style={{
          animation: 'particle-flow 1.8s linear infinite',
        } as React.CSSProperties}
      />
    </>
  )
}

function PipelineJobNode({
  data,
}: {
  data: {
    label: string
    status: string
    isSelected: boolean
    stage: string
  }
}) {
  const { label, status, isSelected, stage } = data
  const accentColor = getAccentColor(status)
  const isRunning = status === 'running' || status === 'preparing' || status === 'waiting_for_resource'
  const isSuccess = status === 'success' || status === 'passed'
  const isFailed = status === 'failed'
  const isDark = useTheme() === 'dark'

  const surfaceBg = isDark ? '#1c2128' : '#ffffff'
  const surfaceShadow = isDark
    ? '0 2px 8px rgba(0,0,0,0.35)'
    : '0 1px 4px rgba(0,0,0,0.08)'
  const isSelectedShadow = `0 0 0 2px ${accentColor}80, 0 4px 12px rgba(0,0,0,0.3)`
  const borderColor = isSelected ? accentColor : (isDark ? '#30363d' : '#d0d7de')

  const jobNameColor = isSelected
    ? (isDark ? '#ffffff' : '#1f2937')
    : (isDark ? '#e6edf3' : '#1f2937')
  const stageNameColor = isDark ? '#8b949e' : '#6b7280'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 12px',
      borderRadius: 8,
      background: surfaceBg,
      border: `1px solid ${borderColor}`,
      boxShadow: isSelected ? isSelectedShadow : surfaceShadow,
      position: 'relative',
      width: 220,
      height: 52,
      boxSizing: 'border-box',
    }}>
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: 'var(--dashboard-border, #4b5563)',
          width: 6,
          height: 6,
          borderRadius: '50%',
          border: 'none',
          left: -4,
        }}
      />

      {/* Status icon circle like GitLab */}
      <div style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        border: `2px solid ${accentColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: accentColor,
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1,
      }}>
        {isRunning ? (
          <LoadingOutlined style={{ fontSize: 12, color: accentColor }} />
        ) : isSuccess ? (
          '✓'
        ) : isFailed ? (
          '✕'
        ) : (
          '•'
        )}
      </div>

      {/* Job name & stage */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: jobNameColor,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 11,
          color: stageNameColor,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {stage}
        </div>
      </div>

      <ReloadOutlined style={{
        fontSize: 11,
        color: stageNameColor,
        flexShrink: 0,
        opacity: 0.6,
      }} />

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: 'var(--dashboard-border, #4b5563)',
          width: 6,
          height: 6,
          borderRadius: '50%',
          border: 'none',
          right: -4,
        }}
      />
    </div>
  )
}

function PipelineDAGWrapper({
  jobs,
  selectedJob,
  COLORS,
}: {
  jobs: JobInfo[]
  selectedJob: JobInfo | null
  COLORS: Record<string, string>
}) {
  return <PipelineDAGGraph jobs={jobs} selectedJob={selectedJob} COLORS={COLORS} />
}

function FitViewButton() {
  const { fitView } = useReactFlow()
  return (
    <button
      type="button"
      onClick={() => fitView({ padding: 0.05, includeHiddenNodes: false })}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--dashboard-border)',
        background: 'transparent',
        color: 'var(--dashboard-muted)',
        fontSize: '0.82em',
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '0.3px',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => {
        ;(e.target as HTMLElement).style.color = 'var(--dashboard-text)'
        ;(e.target as HTMLElement).style.borderColor = 'var(--dashboard-accent)'
      }}
      onMouseLeave={(e) => {
        ;(e.target as HTMLElement).style.color = 'var(--dashboard-muted)'
        ;(e.target as HTMLElement).style.borderColor = 'var(--dashboard-border)'
      }}
    >
      <ReloadOutlined style={{ fontSize: 10 }} />
      Fit View
    </button>
  )
}

function PipelineDAGGraph({
  jobs,
  selectedJob,
  COLORS,
}: {
  jobs: JobInfo[]
  selectedJob: JobInfo | null
  COLORS: Record<string, string>
}) {
  const orderedJobs = useMemo(() => orderJobsByStageSequence(jobs), [jobs])
  const jobMap = useMemo(() => {
    const m = new Map<number, JobInfo>()
    orderedJobs.forEach(j => m.set(j.id, j))
    return m
  }, [orderedJobs])

  const childToParent = useMemo(() => {
    const map = new Map<number, number>()
    orderedJobs.forEach(j => {
      if (j.parent_job_id != null && j.parent_job_id > 0) {
        map.set(j.id, j.parent_job_id)
      }
    })
    return map
  }, [orderedJobs])

  const hasDependencyData = useMemo(() => {
    return orderedJobs.some(j => j.parent_job_id != null && j.parent_job_id > 0)
  }, [orderedJobs])

  const hasParent = useMemo(() => {
    return orderedJobs.some(j => j.parent_job_id != null && j.parent_job_id > 0)
  }, [orderedJobs])

  const layout = useMemo(() => {
    const { sortedStages, stageOrder } = (() => {
      const stageJobs = new Map<string, JobInfo[]>()
      orderedJobs.forEach(j => {
        const list = stageJobs.get(j.stage) || []
        list.push(j)
        stageJobs.set(j.stage, list)
      })
      const uniqueStages = [...new Set(orderedJobs.map(j => j.stage))]
      const parsedStageJobs = uniqueStages.map(stage => ({
        stage,
        jobs: stageJobs.get(stage)!,
        sorted: stageJobs.get(stage)!.sort((a, b) => {
          const aCreated = Date.parse(a.created_at)
          const bCreated = Date.parse(b.created_at)
          const aTime = Number.isFinite(aCreated) ? aCreated : Number.MAX_SAFE_INTEGER
          const bTime = Number.isFinite(bCreated) ? bCreated : Number.MAX_SAFE_INTEGER
          return aTime - bTime || a.id - b.id
        })
      }))
      const parsedStages = [...parsedStageJobs].sort((a, b) => {
        if (a.stage === '.pre') return b.stage === '.pre' ? 0 : -1
        if (b.stage === '.pre') return 1
        if (a.stage === '.post') return b.stage === '.post' ? 0 : 1
        if (b.stage === '.post') return -1
        const aCreated = Math.min(...a.jobs.map(j => Date.parse(j.created_at)).filter(t => Number.isFinite(t)))
        const bCreated = Math.min(...b.jobs.map(j => Date.parse(j.created_at)).filter(t => Number.isFinite(t)))
        return (Number.isFinite(aCreated) ? aCreated : Number.MAX_SAFE_INTEGER) -
               (Number.isFinite(bCreated) ? bCreated : Number.MAX_SAFE_INTEGER)
      })
      const sortedStages = parsedStages.map(({ stage, sorted }) => ({ stage, count: sorted.length, sorted }))
      const stageOrder = new Map<string, number>()
      sortedStages.forEach((s, i) => stageOrder.set(s.stage, i))
      return { sortedStages, stageOrder }
    })()

    const positions = new Map<number, { x: number; y: number }>()

    const nodeWidth = 220
    const nodeHeight = 52
    const gapX = 65
    const gapY = 14

    const allLevels = sortedStages.map(si => si.sorted.map(j => j.id))
    const maxRowsPerLevel = allLevels.map(l => l.length)
    const maxRows = Math.max(...maxRowsPerLevel, 1)

    allLevels.forEach((levelJobs, stageIdx) => {
      const x = -((allLevels.length - 1) * (nodeWidth + gapX)) / 2 + stageIdx * (nodeWidth + gapX)
      const startY = -((maxRows - 1) * (nodeHeight + gapY)) / 2
      levelJobs.forEach((jobId, rowIdx) => {
        const y = startY + rowIdx * (nodeHeight + gapY)
        positions.set(jobId, { x, y })
      })
    })

    return { positions, sortedStages, stageOrder }
  }, [jobs])

  const nodes = useMemo(() => {
    const n: import('reactflow').Node[] = []
    orderedJobs.forEach((job) => {
      const pos = layout.positions.get(job.id)
      if (pos) {
        n.push({
          id: `job-${job.id}`,
          type: 'pipelineJob',
          position: pos,
          width: 220,
          height: 52,
          data: {
            label: job.name,
            status: job.status === 'created' ? 'running' : job.status,
            isSelected: selectedJob ? selectedJob.id === job.id : false,
            stage: job.stage,
          },
          focusable: false,
          selectable: false,
          draggable: false,
        })
      }
    })
    if (n.length === 0) {
      orderedJobs.forEach((job, idx) => {
        const x = 20 + idx * 240
        const y = 20
        n.push({
          id: `job-${job.id}`,
          type: 'pipelineJob',
          position: { x, y },
          width: 220,
          height: 52,
          data: {
            label: job.name,
            status: job.status === 'created' ? 'running' : job.status,
            isSelected: selectedJob ? selectedJob.id === job.id : false,
            stage: job.stage,
          },
        })
      })
    }
    return n
  }, [orderedJobs, layout.positions, selectedJob])

  const edges = useMemo(() => {
    const e: import('reactflow').Edge[] = []
    const edgeSet = new Set<string>()

    const addEdge = (srcId: number, tgtId: number) => {
      const key = `${srcId}->${tgtId}`
      if (edgeSet.has(key) || srcId === tgtId) return
      edgeSet.add(key)
      e.push({
        id: `edge-${srcId}-${tgtId}`,
        source: `job-${srcId}`,
        target: `job-${tgtId}`,
        type: 'particle',
      })
    }

    // 1. Explicit parent_job_id (GitLab DAG dependencies)
    orderedJobs.forEach((job) => {
      if (job.parent_job_id != null && job.parent_job_id > 0 && jobMap.has(job.parent_job_id)) {
        addEdge(job.parent_job_id, job.id)
      }
    })

    // 2. Stage-to-stage connections for jobs without explicit dependencies
    const { sortedStages } = layout
    const getBaseName = (name: string, stage: string) => {
      let n = name.toLowerCase().trim()
      const st = stage.toLowerCase().trim()
      if (n.startsWith(st + '-')) n = n.slice(st.length + 1)
      else if (n.startsWith(st + '_')) n = n.slice(st.length + 1)
      const prefixes = ['compile-', 'build-', 'deploy-', 'test-', 'package-', 'lint-', 'publish-']
      for (const p of prefixes) {
        if (n.startsWith(p)) {
          n = n.slice(p.length)
          break
        }
      }
      return n
    }

    for (let i = 0; i < sortedStages.length - 1; i++) {
      const fromJobs = sortedStages[i].sorted
      const toJobs = sortedStages[i + 1].sorted

      toJobs.forEach((toJob, toIdx) => {
        const alreadyHasIncoming = e.some((edge) => edge.target === `job-${toJob.id}`)
        if (alreadyHasIncoming) return

        if (fromJobs.length === 1) {
          addEdge(fromJobs[0].id, toJob.id)
        } else {
          const toBase = getBaseName(toJob.name, toJob.stage)
          const matchedFrom = fromJobs.find((fj) => {
            const fromBase = getBaseName(fj.name, fj.stage)
            return fromBase === toBase || fj.name.endsWith(toBase) || toJob.name.endsWith(fromBase)
          })

          if (matchedFrom) {
            addEdge(matchedFrom.id, toJob.id)
          } else if (fromJobs.length === toJobs.length) {
            addEdge(fromJobs[toIdx].id, toJob.id)
          } else {
            addEdge(fromJobs[toIdx % fromJobs.length].id, toJob.id)
          }
        }
      })
    }

    return e
  }, [orderedJobs, jobMap, layout])

  if (nodes.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', color: 'var(--dashboard-muted)', fontSize: '0.8em' }}>
      No jobs to display
    </div>
  )

  return (
    <div style={{ width: '100%', height: '520px', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--dashboard-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', background: 'var(--dashboard-surface)', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ pipelineJob: PipelineJobNode as import('reactflow').NodeTypes[keyof import('reactflow').NodeTypes] }}
        edgeTypes={{ particle: ParticleEdge as import('reactflow').EdgeTypes[keyof import('reactflow').EdgeTypes] }}
        fitView
        fitViewOptions={{ padding: 0.05, includeHiddenNodes: false }}
        proOptions={{ hideAttribution: true }}
        maxZoom={10}
        minZoom={0.05}
        panOnDrag
        zoomOnScroll
        elementsSelectable={false}
        className="pipeline-dag-graph"
        style={{ background: 'var(--dashboard-surface)', color: 'var(--dashboard-text)' }}
      >
        <Background color="var(--dashboard-border)" gap={20} size={1} />
      </ReactFlow>
    </div>
  )
}
