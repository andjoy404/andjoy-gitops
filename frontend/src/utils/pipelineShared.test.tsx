import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipelineDetailModal, ParentJobDetailModal, PIPELINE_STATUS_COLORS, getPipelineEffectiveStatus } from './pipelineShared'
import { stubMatchMedia, stubGetComputedStyle } from '../test-utils/test-helpers'
import type { JobInfo, PipelineInfo } from '../types'

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const mockPipeline: PipelineInfo = {
  id: 10587,
  iid: 10587,
  project_id: 42,
  coverage: null,
  sha: 'e5e2858012345678',
  ref: 'stag',
  status: 'success',
  source: 'push',
  created_at: '2026-09-08T03:00:00Z',
  updated_at: '2026-09-08T04:00:00Z',
  web_url: 'https://gitlab.com/p/10587',
}

const mockJobs: JobInfo[] = [
  {
    id: 1,
    name: 'compile-api',
    stage: 'compile-api',
    status: 'success',
    pipeline_id: 10587,
    project_id: 42,
    created_at: '2026-09-08T03:00:00Z',
    web_url: 'https://gitlab.com/j/1',
  },
  {
    id: 2,
    name: 'compile-analytics-management-service',
    stage: 'compile',
    status: 'success',
    pipeline_id: 10587,
    project_id: 42,
    created_at: '2026-09-08T03:01:00Z',
    web_url: 'https://gitlab.com/j/2',
  },
  {
    id: 3,
    name: 'build-analytics-management-service',
    stage: 'build',
    status: 'success',
    pipeline_id: 10587,
    project_id: 42,
    created_at: '2026-09-08T03:02:00Z',
    web_url: 'https://gitlab.com/j/3',
  },
  {
    id: 4,
    name: 'deploy-analytics-management-service',
    stage: 'deploy',
    status: 'success',
    pipeline_id: 10587,
    project_id: 42,
    created_at: '2026-09-08T03:03:00Z',
    web_url: 'https://gitlab.com/j/4',
  },
]

describe('PipelineDAG in Modals', () => {
  beforeEach(() => {
    stubMatchMedia()
    stubGetComputedStyle()
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
  })

  it('renders PipelineDetailModal (Status badge target) with Pipeline DAG and nodes', () => {
    render(
      <PipelineDetailModal
        pipeline={mockPipeline}
        jobs={mockJobs}
        onAfterClose={() => {}}
        COLORS={PIPELINE_STATUS_COLORS}
      />
    )

    expect(screen.getByText('Pipeline #10587')).toBeInTheDocument()
    expect(screen.getByText(/Pipeline DAG \(4 jobs\)/i)).toBeInTheDocument()
    expect(screen.getAllByText('compile-api').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('compile-analytics-management-service')).toBeInTheDocument()
    expect(screen.getByText('build-analytics-management-service')).toBeInTheDocument()
    expect(screen.getByText('deploy-analytics-management-service')).toBeInTheDocument()

    // Verify React Flow container and handles exist
    const container = document.querySelector('.pipeline-dag-graph')
    expect(container).toBeTruthy()
    const handles = document.querySelectorAll('.react-flow__handle')
    expect(handles.length).toBeGreaterThanOrEqual(8) // 2 handles per node (left + right)
  })

  it('renders ParentJobDetailModal (Parent job badge target) with Pipeline DAG and nodes', () => {
    render(
      <ParentJobDetailModal
        job={mockJobs[0]}
        allJobs={mockJobs}
        onAfterClose={() => {}}
        COLORS={PIPELINE_STATUS_COLORS}
      />
    )

    expect(screen.getByText('Pipeline DAG')).toBeInTheDocument()
    expect(screen.getAllByText('compile-api').length).toBeGreaterThanOrEqual(1)

    const handles = document.querySelectorAll('.react-flow__handle')
    expect(handles.length).toBeGreaterThanOrEqual(8)
  })
})

describe('getPipelineEffectiveStatus', () => {
  it('falls back to raw pipeline status when no jobs are present', () => {
    expect(getPipelineEffectiveStatus({ ...mockPipeline, status: 'failed' }, [])).toBe('failed')
    expect(getPipelineEffectiveStatus({ ...mockPipeline, status: 'canceled' }, [])).toBe('canceled')
    expect(getPipelineEffectiveStatus({ ...mockPipeline, status: 'created' }, [])).toBe('running')
  })

  it('derives failed status from rightmost child job even if pipeline status is success', () => {
    const parentJob: JobInfo = {
      id: 1, name: 'build', stage: 'build', status: 'success',
      pipeline_id: 10587, project_id: 42, created_at: '2026-09-08T03:00:00Z',
      parent_job_id: null,
    }
    const childJobSuccess: JobInfo = {
      id: 2, name: 'child-step-1', stage: 'deploy', status: 'success',
      pipeline_id: 10587, project_id: 42, created_at: '2026-09-08T03:01:00Z',
      parent_job_id: 1,
    }
    const childJobFailed: JobInfo = {
      id: 3, name: 'child-step-2', stage: 'verify', status: 'failed',
      pipeline_id: 10587, project_id: 42, created_at: '2026-09-08T03:02:00Z',
      parent_job_id: 1,
    }

    const effective = getPipelineEffectiveStatus(
      { ...mockPipeline, status: 'success' },
      [parentJob, childJobSuccess, childJobFailed],
    )
    expect(effective).toBe('failed')
  })

  it('derives manual status when child target job is manual or approval', () => {
    const parentJob: JobInfo = {
      id: 1, name: 'build', stage: 'build', status: 'success',
      pipeline_id: 10587, project_id: 42, created_at: '2026-09-08T03:00:00Z',
      parent_job_id: null,
    }
    const childJobManual: JobInfo = {
      id: 2, name: 'deploy-prod', stage: 'deploy', status: 'manual',
      pipeline_id: 10587, project_id: 42, created_at: '2026-09-08T03:01:00Z',
      parent_job_id: 1,
    }

    const effective = getPipelineEffectiveStatus(
      { ...mockPipeline, status: 'running' },
      [parentJob, childJobManual],
    )
    expect(effective).toBe('manual')
  })

  it('derives status from rightmost parent job when no child jobs exist', () => {
    const parentJob1: JobInfo = {
      id: 1, name: 'build', stage: 'build', status: 'success',
      pipeline_id: 10587, project_id: 42, created_at: '2026-09-08T03:00:00Z',
      parent_job_id: null,
    }
    const parentJob2: JobInfo = {
      id: 2, name: 'test', stage: 'test', status: 'failed',
      pipeline_id: 10587, project_id: 42, created_at: '2026-09-08T03:01:00Z',
      parent_job_id: null,
    }

    const effective = getPipelineEffectiveStatus(
      { ...mockPipeline, status: 'running' },
      [parentJob1, parentJob2],
    )
    expect(effective).toBe('failed')
  })
})
