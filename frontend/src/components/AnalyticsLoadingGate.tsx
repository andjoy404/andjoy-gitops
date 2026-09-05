import type { ReactNode } from 'react'
import { Alert, Spin } from 'antd'
import type { AnalyticsReadiness } from '../types'

export type AnalyticsDataset = 'pipelines' | 'users' | 'runners' | 'relationships'
export const ANALYTICS_LOADING_MESSAGE = 'Analytics data is being collected in the background…'

export function datasetHasData(readiness: AnalyticsReadiness | null | undefined, dataset: AnalyticsDataset): boolean {
  if (!readiness) return false
  if (dataset === 'pipelines') return readiness.project_count > 0 || readiness.pipeline_count > 0
  if (dataset === 'users') return readiness.user_count > 0 || readiness.user_event_count > 0 || readiness.user_issue_count > 0
  if (dataset === 'runners') return readiness.runner_state_count > 0
  return readiness.project_count > 0 || readiness.pipeline_count > 0 || readiness.user_count > 0
}

export function datasetIsPending(
  readiness: AnalyticsReadiness | null | undefined,
  dataset: AnalyticsDataset,
  readinessLoading = false,
): boolean {
  if (readinessLoading) return true
  if (!readiness) return true
  if (readiness.scoped_error) return false
  if (readiness.scoped_syncing === true) return true
  if (datasetHasData(readiness, dataset)) return false
  return !readiness.ready
}

export default function AnalyticsLoadingGate({ active, children, className = '', message = ANALYTICS_LOADING_MESSAGE, error }: {
  active: boolean
  children: ReactNode
  className?: string
  message?: string
  error?: { message: ReactNode; description?: ReactNode }
}) {
  const obscured = active || Boolean(error)

  return (
    <div className={`analytics-loading-gate${obscured ? ' analytics-loading-gate--active' : ''}${error ? ' analytics-loading-gate--error' : ''}${className ? ` ${className}` : ''}`} aria-busy={active}>
      <div className="analytics-loading-gate__content">{children}</div>
      {obscured && (
        <div className="analytics-loading-gate__overlay" role="status" aria-live="polite">
          {error ? (
            <Alert type="error" showIcon message={error.message} description={error.description} />
          ) : (
            <>
              <Spin size="large" />
              <strong>{message}</strong>
              <span>This view will update automatically when data is ready.</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}


