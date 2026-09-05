import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select, Typography, Alert, Tabs as AntTabs, Spin } from 'antd'
import { GroupContext, useGroupContext } from '../contexts/GroupContext'
import DashboardMark from '../components/DashboardMark'
import AnalyticsLoadingGate, { datasetIsPending } from '../components/AnalyticsLoadingGate'
import EChartsWrapper from '../components/EChartsWrapper'
import { api } from '../services/api'
import { TIME_RANGES } from '../utils/timeRanges'
import type { AnalyticsSummary, UserActivity, AnalyticsReadiness, GlobalConfigDTO } from '../types'
import '../styles/dashboard.css'

const { Text } = Typography

const LOCAL_STORAGE_RANGE_KEY = 'analytics_range'
const PIPELINE_HISTORY_HOURS = 90 * 24

const EMPTY_ANALYTICS_SUMMARY: AnalyticsSummary = {
  window_days: 0, window_hours: 0, group_count: 0, project_count: 0, pipeline_count: 0,
  success_count: 0, failed_count: 0, manual_count: 0, active_count: 0, canceled_count: 0,
  runner_count: 0, runner_running_count: 0, runner_idle_count: 0, runner_offline_count: 0,
  runner_stale_count: 0, runner_paused_count: 0,
  success_rate: 0, history: [],
}

function DashboardPanelLoader({ active }: { active: boolean }) {
  if (!active) return null
  return <div className="dashboard-panel-loading-overlay" role="status" aria-live="polite"><Spin size="small" /><span>Collecting data…</span></div>
}

function loadingPanelClass(base: string, loading: boolean): string {
  return `${base}${loading ? ' dashboard-panel-loading' : ''}`
}

function getDefaultHours(key: string): number {
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed)) {
        const found = TIME_RANGES.find((r) => r.hours === parsed)
        if (found) return parsed
      }
    }
  } catch { /* localStorage may be unavailable */ }
  return 24
}

function formatTimeRangeLabel(hours: number): string {
  const found = TIME_RANGES.find((r) => r.hours === hours)
  return found ? found.label : `${hours}h`
}

function StatPanel({
  title,
  children,
  subtitle,
  span = 'full',
}: {
  title: string
  children: React.ReactNode
  subtitle?: string
  span?: 'full' | 'two' | 'three'
}) {
  const spanClass = span === 'full' ? 'panel-span-full' : span === 'two' ? 'panel-span-two' : 'panel-span-three'
  return (
    <div className={`dashboard-panel ${spanClass}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 0.85, color: 'var(--dashboard-muted)' }}>{title}</span>
      </div>
      {subtitle && <div style={{ fontSize: 0.8, color: 'var(--dashboard-muted)', marginBottom: 4 }}>{subtitle}</div>}
      {children}
    </div>
  )
}

function statusColor(status: string): string {
  switch (status) {
    case 'success':
      return 'var(--dashboard-success)'
    case 'manual':
      return 'var(--dashboard-warning)'
    case 'failed':
      return 'var(--dashboard-danger)'
    case 'running':
    case 'active':
      return 'var(--dashboard-info)'
    case 'canceled':
      return 'var(--dashboard-muted)'
    default:
      return 'var(--dashboard-muted)'
  }
}

function statusTextColor(status: string): string {
  switch (status) {
    case 'success':
      return '#fff'
    case 'manual':
      return '#000'
    case 'running':
    case 'active':
      return '#fff'
    case 'failed':
      return '#fff'
    default:
      return '#fff'
  }
}

function GaugeChart({
  value,
  color,
  subtitle,
  height = 160,
}: {
  value: number
  color: string
  subtitle: string
  height?: number
}) {
  const option = useMemo(() => ({
    series: [
      {
        type: 'gauge',
        startAngle: 220,
        endAngle: -40,
        min: 0,
        max: 100,
        radius: '90%',
        center: ['50%', '60%'],
        progress: {
          show: true,
          width: 12,
          roundCap: true,
          itemStyle: { color },
        },
        axisLine: {
          lineStyle: {
            width: 12,
            color: [[1, 'var(--dashboard-gauge-track)']],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        detail: {
          valueAnimation: true,
          fontSize: 28,
          fontWeight: 'bold',
          color,
          offsetCenter: [0, '0%'],
          formatter: '{value}%',
        },
        data: [{ value: value.toFixed(1) }],
      },
    ],
  }), [value, color])

  return (
    <div className="gauge-container">
      <EChartsWrapper option={option} style={{ height: `${height}px`, width: '100%' }}/>
      <div className="gauge-subtitle">{subtitle}</div>
    </div>
  )
}

function StatusBar({
  label,
  value,
  total,
  status,
}: {
  label: string
  value: number
  total: number
  status: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="status-bar-row">
      <span className="status-bar-label">{label}</span>
      <div className="status-bar-track">
        <div
          className="status-bar-fill"
          style={{
            width: `${Math.max(pct, value > 0 ? 5 : 0)}%`,
            background: statusColor(status),
            color: statusTextColor(status),
          }}
        >
          {pct > 15 ? `${pct.toFixed(0)}%` : ''}
        </div>
      </div>
      <span className="status-bar-count">{value}</span>
    </div>
  )
}

function SparkBarChart({ data }: { data: { label: string; pipeline_count: number; project_count: number }[] }) {
  const option = useMemo(() => ({
    grid: { left: 50, right: 10, top: 5, bottom: 2 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.label.slice(-8)),
      axisLabel: { fontSize: 9, color: 'var(--dashboard-muted)' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d) => d.pipeline_count),
        barWidth: 14,
        itemStyle: {
          borderRadius: [0, 3, 3, 0],
          color: 'var(--dashboard-accent)',
        },
        label: {
          show: true,
          position: 'right',
          fontSize: 10,
          color: 'var(--dashboard-text)',
          formatter: '{c}',
        },
      },
    ],
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const p = params as { dataIndex: number }[]
        if (p?.[0]) {
          return `${data[p[0].dataIndex].label}<br/>Pipelines: ${data[p[0].dataIndex].pipeline_count}`
        }
        return ''
      },
    },
  }), [data])

  return <EChartsWrapper option={option} style={{ height: Math.max(data.length * 22, 60), width: '100%' }}/>
}

function PipelineRunsPanel({ summary }: { summary: AnalyticsSummary }) {
  return (
    <StatPanel title="Pipeline runs" span="full">
      <div className="stat-value-row">
        <span className="big-stat">{summary.pipeline_count.toLocaleString()}</span>
        <Text type="secondary" style={{ fontSize: 0.85 }}>
          Overall pipelines
        </Text>
      </div>
      {summary.history.length > 0 && <SparkBarChart data={summary.history} />}
    </StatPanel>
  )
}

function DeliveryActivityPanel({ summary }: { summary: AnalyticsSummary }) {
  return (
    <StatPanel title="Delivery activity">
      <div className="activity-list">
        <div className="activity-row">
          <span>Active now</span>
          <span style={{ color: 'var(--dashboard-info)' }}>{summary.active_count}</span>
        </div>
        <div className="activity-row">
          <span>Running</span>
          <span style={{ color: 'var(--dashboard-success)' }}>{summary.active_count + summary.failed_count + summary.canceled_count}</span>
        </div>
        <div className="activity-row">
          <span>Canceled</span>
          <span style={{ color: 'var(--dashboard-danger)' }}>{summary.canceled_count}</span>
        </div>
      </div>
    </StatPanel>
  )
}

function DonutChartPanel({ summary }: { summary: AnalyticsSummary }) {
  const option = useMemo(() => ({
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center',
      textStyle: { fontSize: 11, color: 'var(--dashboard-muted)' },
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: 'var(--dashboard-surface)',
          borderWidth: 2,
        },
        label: { show: false },
        data: [
          { value: summary.success_count, name: 'Success', itemStyle: { color: 'var(--dashboard-success)' } },
          { value: summary.manual_count, name: 'Manual', itemStyle: { color: 'var(--dashboard-warning)' } },
          { value: summary.failed_count, name: 'Failed', itemStyle: { color: 'var(--dashboard-danger)' } },
          { value: summary.active_count, name: 'Active', itemStyle: { color: 'var(--dashboard-info)' } },
          { value: summary.canceled_count, name: 'Canceled', itemStyle: { color: 'var(--dashboard-muted)' } },
        ],
      },
    ],
  }), [summary])

  return (
    <StatPanel title="Pipeline status mix">
      <div className="donut-container">
        <EChartsWrapper option={option} style={{ height: 280, width: '100%' }}/>
      </div>
    </StatPanel>
  )
}

function ProjectInventoryPanel({ summary }: { summary: AnalyticsSummary }) {
  return (
    <StatPanel title="Project inventory">
      <div className="stat-value-row">
        <span className="big-stat">{summary.project_count}</span>
        <Text type="secondary" style={{ fontSize: 0.85 }}>
          Monitored projects
        </Text>
      </div>
      {summary.history.length > 0 && <SparkBarChart data={summary.history.map((h) => ({ ...h, pipeline_count: h.project_count }))} />}
    </StatPanel>
  )
}

function RunnerPanel({ summary }: { summary: AnalyticsSummary }) {
  const option = useMemo(() => ({
    grid: { left: 80, right: 40, top: 10, bottom: 10 },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: ['Offline', 'Idle', 'Running'],
      inverse: true,
      axisLabel: { fontSize: 11, color: 'var(--dashboard-muted)' },
      axisTick: { show: false },
      axisLine: { show: false },
    },
    series: [
      {
        type: 'bar',
        data: [
          { value: summary.runner_offline_count, itemStyle: { color: 'var(--dashboard-muted)', borderRadius: [0, 3, 3, 0] } },
          { value: summary.runner_idle_count, itemStyle: { color: 'var(--dashboard-warning)', borderRadius: [0, 3, 3, 0] } },
          { value: summary.runner_running_count, itemStyle: { color: 'var(--dashboard-success)', borderRadius: [0, 3, 3, 0] } },
        ],
        barWidth: 18,
        label: {
          show: true,
          position: 'right',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--dashboard-text)',
        },
      },
    ],
  }), [summary])

  return (
    <div className="dashboard-grid">
      <div className="dashboard-panel panel-span-two">
        <div style={{ fontSize: 0.85, color: 'var(--dashboard-muted)', marginBottom: 8 }}>Runner status</div>
        <EChartsWrapper option={option} style={{ height: 140, width: '100%' }}/>
      </div>
      <div className="dashboard-panel panel-span-three">
        <div style={{ fontSize: 0.85, color: 'var(--dashboard-muted)', marginBottom: 4 }}>Runner inventory</div>
        <div style={{ fontSize: 2.5, fontWeight: 'bold', color: 'var(--dashboard-text)' }}>{summary.runner_count}</div>
        <Text type="secondary" style={{ fontSize: 0.8 }}>
          currently online
        </Text>
        <div className="runner-stats">
          <div className="activity-row">
            <span>Running</span>
            <span style={{ color: 'var(--dashboard-success)' }}>{summary.runner_running_count}</span>
          </div>
          <div className="activity-row">
            <span>Idle</span>
            <span style={{ color: 'var(--dashboard-warning)' }}>{summary.runner_idle_count}</span>
          </div>
          <div className="activity-row">
            <span>Offline</span>
            <span style={{ color: 'var(--dashboard-muted)' }}>{summary.runner_offline_count}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function toFinite(value: number | null | undefined): number {
  return Number.isFinite(value as number) ? (value as number) : 0
}

function pipelineRunsLabel(count: number): string {
  return count === 1 ? 'pipeline run' : 'pipeline runs'
}

function SemicircleGauge({
  title,
  chip,
  tone,
  value,
  count,
  denominator,
  countLabel,
  loading = false,
}: {
  title: string
  chip: string
  tone: 'success' | 'danger'
  value: number | null | undefined
  count: number
  denominator: number
  countLabel: string
  loading?: boolean
}) {
  const [active, setActive] = useState(false)
  const pct = Math.min(100, Math.max(0, toFinite(value)))
  const arcDeg = Math.round(pct * 1.8 * 10) / 10
  const safeCount = Math.max(0, toFinite(count))
  const safeDenominator = Math.max(0, toFinite(denominator))
  return (
    <article className={loadingPanelClass(`analytics-card gauge-card ${tone === 'danger' ? 'failure-gauge-card' : 'success-gauge-card'}`, loading)}>
      <DashboardPanelLoader active={loading} />
      <header><strong>{title}</strong> <span>{chip}</span></header>
      <div className="gauge-shell">
        <div
          className={`css-gauge${active ? ' gauge-active' : ''}`}
          style={{ '--gauge-value': `${arcDeg}deg` } as React.CSSProperties}
          role="img"
          aria-label={`${title}: ${pct.toFixed(1)} percent, ${safeCount.toLocaleString()} of ${safeDenominator.toLocaleString()} completed pipelines`}
          tabIndex={0}
          onMouseEnter={() => setActive(true)}
          onMouseLeave={() => setActive(false)}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
        >
          <b>{pct.toFixed(1)}%</b>
          <span className={`gauge-tooltip${active ? ' is-active' : ''}`} role="tooltip" aria-hidden={!active}>
            <b>{pct.toFixed(1)}%</b><span>{safeCount.toLocaleString()} of {safeDenominator.toLocaleString()} completed pipelines</span>
          </span>
        </div>
      </div>
      <p>{safeCount.toLocaleString()} {countLabel}</p>
    </article>
  )
}

function PipelineAnalyticsDashboard({
  summary,
  fullHistoryPipelineCount,
  loading = false,
  historyLoading = false,
}: {
  summary: AnalyticsSummary
  fullHistoryPipelineCount?: number
  loading?: boolean
  historyLoading?: boolean
}) {
  const [activeBar, setActiveBar] = useState<number | null>(null)
  const [activeDonut, setActiveDonut] = useState<number | null>(null)
  const total = summary.success_count + summary.failed_count + summary.manual_count + summary.active_count + summary.canceled_count
  const percent = (value: number) => total > 0 ? (value / total) * 100 : 0
  const runnerTotal = summary.runner_running_count + summary.runner_idle_count + summary.runner_paused_count + summary.runner_stale_count + summary.runner_offline_count
  const runnerPercent = (value: number) => runnerTotal > 0 ? (value / runnerTotal) * 100 : 0
  const failedRate = total > 0 ? percent(summary.failed_count) : 0
  const history = [...summary.history].reverse()
  const maxHistory = history.reduce((max, point) => Math.max(max, toFinite(point.pipeline_count)), 0)
  const statusRows = [
    ['Success', summary.success_count, 'success'],
    ['Manual', summary.manual_count, 'manual'],
    ['Failed', summary.failed_count, 'failed'],
    ['Active', summary.active_count, 'active'],
    ['Canceled', summary.canceled_count, 'canceled'],
  ] as const
  const runnerRows = [
    ['Running', summary.runner_running_count, 'running'],
    ['Idle', summary.runner_idle_count, 'idle'],
    ['Paused', summary.runner_paused_count, 'paused'],
    ['Stale', summary.runner_stale_count, 'stale'],
    ['Offline', summary.runner_offline_count, 'offline'],
  ] as const
  const donutRadius = 62.5
  const donutCircumference = 2 * Math.PI * donutRadius
  const donutSegmentDefs = [
    { label: 'Success', kind: 'success', color: 'var(--dashboard-success)', value: summary.success_count },
    { label: 'Manual', kind: 'manual', color: 'var(--dashboard-warning)', value: summary.manual_count },
    { label: 'Failed', kind: 'failed', color: 'var(--dashboard-danger)', value: summary.failed_count },
    { label: 'Active', kind: 'active', color: 'var(--dashboard-info)', value: summary.active_count },
    { label: 'Canceled', kind: 'canceled', color: 'var(--dashboard-muted)', value: summary.canceled_count },
  ]
  let donutCursor = 0
  const donutArcs = donutSegmentDefs.map((def) => {
    const value = Math.max(0, toFinite(def.value))
    const fraction = total > 0 ? value / total : 0
    const arc = { ...def, value, fraction, length: fraction * donutCircumference, start: donutCursor }
    donutCursor += arc.length
    return arc
  })
  const activeDonutArc = activeDonut !== null && activeDonut < donutArcs.length ? donutArcs[activeDonut] : null

  return (
    <div className="pipeline-analytics-grid">
      <article className={loadingPanelClass('analytics-card pipeline-runs-card', loading || historyLoading)}>
        <DashboardPanelLoader active={loading || historyLoading} />
        <header><strong>Total Pipelines</strong><span>History</span></header>
        <div className="analytics-big-number">{(fullHistoryPipelineCount ?? summary.pipeline_count).toLocaleString()}</div>
        <p>Overall pipelines</p>
        {history.length > 0 && (
          <div className="analytics-spark-bars" aria-label="Pipeline runs by time period">
            {history.map((point, index) => {
              const projectCount = Number.isFinite(point.project_count) ? point.project_count : null
              const barCount = toFinite(point.pipeline_count)
              const barClasses = [
                'spark-bar',
                barCount === 0 ? 'spark-bar-zero' : '',
                index === 0 ? 'spark-bar-first' : '',
                index === history.length - 1 ? 'spark-bar-last' : '',
                activeBar === index ? 'spark-bar-active' : '',
              ].filter(Boolean).join(' ')
              return (
                <span
                  key={point.label}
                  className={barClasses}
                  tabIndex={0}
                  aria-label={`${point.label}: ${barCount.toLocaleString()} ${pipelineRunsLabel(barCount)}${projectCount !== null ? `, ${projectCount.toLocaleString()} projects` : ''}`}
                  onMouseEnter={() => setActiveBar(index)}
                  onMouseLeave={() => setActiveBar(null)}
                  onFocus={() => setActiveBar(index)}
                  onBlur={() => setActiveBar(null)}
                >
                  <i style={{ height: maxHistory > 0 && barCount > 0 ? `${(barCount / maxHistory) * 100}%` : '0%' }}>
                    <span className="spark-bar-tooltip" role="tooltip">
                      {point.label}: {barCount.toLocaleString()} {pipelineRunsLabel(barCount)}
                    </span>
                  </i>
                </span>
              )
            })}
          </div>
        )}
      </article>

      <SemicircleGauge
        title="Success rate"
        chip="Quality"
        tone="success"
        value={summary.success_rate}
        count={summary.success_count}
        denominator={summary.success_count + summary.failed_count}
        countLabel="successful pipelines"
        loading={loading}
      />
      <SemicircleGauge
        title="Failure rate"
        chip="Completed"
        tone="danger"
        value={failedRate}
        count={summary.failed_count}
        denominator={total}
        countLabel="failed pipelines"
        loading={loading}
      />

      <article className={loadingPanelClass('analytics-card inventory-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header><strong>Group inventory</strong><span>Configured</span></header>
        <div className="analytics-big-number">{summary.group_count}</div><p>GitLab groups linked to this environment</p>
        <i className="inventory-swatch" /><small>Active groups per period</small>
      </article>

      <article className={loadingPanelClass('analytics-card donut-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header><strong>Pipeline status mix</strong><span>Distribution</span></header>
        <div className="analytics-donut">
          <svg className={`donut-svg${activeDonutArc ? ' has-active' : ''}`} viewBox="0 0 142 142" aria-hidden="true">
            <g transform="rotate(-90 71 71)">
              <circle className="donut-track" cx="71" cy="71" r="62.5" fill="none" strokeWidth="17" />
              {donutArcs.map((arc, index) => {
                if (arc.length <= 0) return null
                const dash = arc.length + 1
                return (
                  <circle
                    key={arc.label}
                    className={`donut-seg${activeDonut === index ? ' is-active' : ''}`}
                    style={{ stroke: arc.color, strokeDasharray: `${dash} ${donutCircumference - dash}`, strokeDashoffset: -arc.start } as React.CSSProperties}
                    cx="71"
                    cy="71"
                    r="62.5"
                    fill="none"
                    strokeWidth="17"
                    tabIndex={0}
                    role="img"
                    aria-label={`${arc.label}: ${arc.value.toLocaleString()} pipelines, ${percent(arc.value).toFixed(1)}%`}
                    onMouseEnter={() => setActiveDonut(index)}
                    onMouseLeave={() => setActiveDonut(null)}
                    onFocus={() => setActiveDonut(index)}
                    onBlur={() => setActiveDonut(null)}
                  />
                )
              })}
            </g>
          </svg>
          <div className="donut-center"><b>{summary.pipeline_count}</b><small>runs</small></div>
          <span className={`donut-tooltip${activeDonutArc ? ' is-active' : ''}`} role="tooltip" aria-hidden={!activeDonutArc}>
            {activeDonutArc && (
              <span className="donut-tooltip-line">
                <i className={`metric-dot ${activeDonutArc.kind}`} aria-hidden="true" />
                <span>{activeDonutArc.label} · {activeDonutArc.value.toLocaleString()} · {percent(activeDonutArc.value).toFixed(1)}%</span>
              </span>
            )}
          </span>
        </div>
        <div className="donut-legend"><span><i className="metric-dot success" />{percent(summary.success_count).toFixed(1)}% success</span><span><i className="metric-dot failed" />{percent(summary.failed_count).toFixed(1)}% failed</span></div>
      </article>

      <article className={loadingPanelClass('analytics-card distribution-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header><div><strong>Status distribution</strong><small>Share of collected pipeline runs</small></div><span>PostgreSQL</span></header>
        <div className="analytics-bar-list">
          {statusRows.map(([label, value, kind]) => <div className="analytics-bar-row" key={kind}>
            <span><i className={`metric-dot ${kind}`} />{label}</span><div className="analytics-bar-track"><i className={kind} style={{ width: `${percent(value)}%` }} /></div><b>{value}</b><small>{percent(value).toFixed(1)}%</small>
          </div>)}
        </div>
      </article>

      <article className={loadingPanelClass('analytics-card inventory-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header><strong>Project inventory</strong><span>Synced</span></header>
        <div className="analytics-big-number">{summary.project_count}</div><p>Projects tracked in this group</p>
        <i className="inventory-swatch" /><small>Active projects per period</small>
      </article>

      <article className={loadingPanelClass('analytics-card runner-status-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header><div><strong>Runner status</strong><small>Latest synchronized runner availability</small></div><span>Runner state</span></header>
        <div className="analytics-bar-list">
          {runnerRows.map(([label, value, kind]) => <div className="analytics-bar-row" key={kind}>
            <span><i className={`metric-dot runner-${kind}`} />{label}</span><div className="analytics-bar-track"><i className={`runner-${kind}`} style={{ width: `${runnerPercent(value)}%` }} /></div><b>{value}</b><small>{runnerPercent(value).toFixed(1)}%</small>
          </div>)}
        </div>
      </article>

      <article className={loadingPanelClass('analytics-card delivery-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header><strong>Delivery activity</strong><span>Live state</span></header>
        <div className="delivery-value"><b>{summary.active_count}</b><small>active now</small></div>
        <div className="delivery-row"><span><i className="metric-dot active" />Running</span><b>{summary.active_count}</b></div>
        <div className="delivery-row"><span><i className="metric-dot canceled" />Canceled</span><b>{summary.canceled_count}</b></div>
      </article>

      <article className={loadingPanelClass('analytics-card inventory-card runner-inventory-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header><strong>Runner inventory</strong><span>Synced</span></header>
        <div className="analytics-big-number">{summary.runner_count}</div><p>Self-hosted runners in this group</p>
        <i className="inventory-swatch" /><small>{summary.runner_running_count + summary.runner_idle_count} currently online</small>
      </article>
    </div>
  )
}

type RankMetricKey = 'push_count' | 'merge_request_count' | 'merged_count' | 'comment_count' | 'issue_count'

interface RankUser {
  id: number
  username: string
  name: string
  avatar_url: string
  web_url: string
  is_current_member: boolean
  push_count: number
  merge_request_count: number
  merged_count: number
  comment_count: number
  issue_count: number
}

const USER_LEADERBOARDS: { key: RankMetricKey; title: string; meta: string }[] = [
  { key: 'push_count', title: 'Top 5 by Pushes', meta: 'Pushes' },
  { key: 'merge_request_count', title: 'Top 5 by Merge Requests', meta: 'MRs' },
  { key: 'merged_count', title: 'Top 5 Merged Users', meta: 'Merged' },
  { key: 'comment_count', title: 'Top 5 by Comments', meta: 'Comments' },
  { key: 'issue_count', title: 'Top 5 by Issues', meta: 'Issues' },
]

function UserAvatar({ user }: { user: RankUser }) {
  if (user.avatar_url) {
    return <img className="leaderboard-avatar" src={user.avatar_url} alt={user.username} title={user.name} />
  }
  return (
    <span className="leaderboard-avatar leaderboard-avatar-fallback" aria-hidden="true">
      {user.name.charAt(0).toUpperCase()}
    </span>
  )
}

function LeaderboardPanel({ users, metricKey, title }: { users: UserActivity[]; metricKey: RankMetricKey; title: string }) {
  const top = useMemo(
    () =>
      users
        .map((u) => ({ ...u, _v: Number(u[metricKey]) || 0 }))
        .filter((u) => u._v > 0)
        .sort((a, b) => b._v - a._v || a.name.localeCompare(b.name))
        .slice(0, 5),
    [users, metricKey],
  )

  return (
    <div className="leaderboard-card">
      <header><strong>{title}</strong></header>
      <div className="leaderboard-list">
        {top.length > 0
          ? top.map((u, i) => (
              <div key={u.id} className="leaderboard-row">
                <span className="leaderboard-rank">{i + 1}</span>
                {u.web_url && <a href={u.web_url} target="_blank" rel="noreferrer" className="leaderboard-name">{u.name}</a>}
                {!u.web_url && <span className="leaderboard-name">{u.name}</span>}
                <span className="leaderboard-identity"><small>@{u.username}</small></span>
                <b>{u._v.toLocaleString()}</b>
              </div>
            ))
          : <div className="leaderboard-empty">No activity in this range.</div>
        }
      </div>
    </div>
  )
}
function UsersAnalyticsDashboard({ users, loading }: { users: UserActivity[]; loading: boolean }) {

  const usersList: UserActivity[] = Array.isArray(users) ? users : []

  const dedupedUsers = useMemo(() => {
    const map = new Map<number, UserActivity>()
    for (const u of usersList) {
      if (!map.has(u.id)) { map.set(u.id, u) }
    }
    return [...map.values()]
  }, [usersList])

  const pushLeader = useMemo(() =>
    [...dedupedUsers]
      .sort((a, b) => (Number(b.push_count) || 0) - (Number(a.push_count) || 0) || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])
  const mrLeader = useMemo(() =>
    [...dedupedUsers]
      .sort((a, b) => (Number(b.merge_request_count) || 0) - (Number(a.merge_request_count) || 0) || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])
  const mergedLeader = useMemo(() =>
    [...dedupedUsers]
      .sort((a, b) => (Number(b.merged_count) || 0) - (Number(a.merged_count) || 0) || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])
  const commentLeader = useMemo(() =>
    [...dedupedUsers]
      .sort((a, b) => (Number(b.comment_count) || 0) - (Number(a.comment_count) || 0) || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])
  const issueLeader = useMemo(() =>
    [...dedupedUsers]
      .sort((a, b) => (Number(b.issue_count) || 0) - (Number(a.issue_count) || 0) || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])

  const totalPushes = useMemo(() => dedupedUsers.reduce((s, u) => s + (Number(u.push_count) || 0), 0), [dedupedUsers])
  const totalMRS = useMemo(() => dedupedUsers.reduce((s, u) => s + (Number(u.merge_request_count) || 0), 0), [dedupedUsers])
  const totalMerged = useMemo(() => dedupedUsers.reduce((s, u) => s + (Number(u.merged_count) || 0), 0), [dedupedUsers])
  const totalComments = useMemo(() => dedupedUsers.reduce((s, u) => s + (Number(u.comment_count) || 0), 0), [dedupedUsers])
  const totalIssues = useMemo(() => dedupedUsers.reduce((s, u) => s + (Number(u.issue_count) || 0), 0), [dedupedUsers])
  const totalActivity = totalPushes + totalMRS + totalMerged + totalComments + totalIssues
  const activeUsers = useMemo(() => dedupedUsers.filter((u) => u.is_current_member).length, [dedupedUsers])
  const nonActiveUsers = useMemo(() => dedupedUsers.length - activeUsers, [dedupedUsers, activeUsers])
  const lastActiveUser = useMemo(() => {
    const withDates = dedupedUsers.filter((u) => u.last_activity_on != null && u.last_activity_on !== '')
    if (withDates.length === 0) return null
    return withDates.sort((a, b) => b.last_activity_on.localeCompare(a.last_activity_on))[0]
  }, [dedupedUsers])

  // Combined engagement: total activity across ALL categories
  const engagementLeader = useMemo(() =>
    dedupedUsers
      .map((u) => ({
        ...u,
        _total: (Number(u.push_count) || 0) +
                (Number(u.merge_request_count) || 0) +
                (Number(u.merged_count) || 0) +
                (Number(u.comment_count) || 0) +
                (Number(u.issue_count) || 0),
      }))
      .filter((u) => u._total > 0)
      .sort((a, b) => b._total - a._total || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])

  // Top contributor
  const topContributor = engagementLeader.length > 0 ? engagementLeader[0] : null

  const [activeDonut, setActiveDonut] = useState<number | null>(null)
  
  const donutRadius = 62.5
  const donutCircumference = 2 * Math.PI * donutRadius
  const donutSegmentDefs = useMemo(() => [
    { label: 'Pushes', kind: 'pushes', color: '#18D99A', value: totalPushes },
    { label: 'MRs', kind: 'mrs', color: '#FFC21C', value: totalMRS },
    { label: 'Merged', kind: 'merged', color: '#39A0FF', value: totalMerged },
    { label: 'Comments', kind: 'comments', color: 'var(--dashboard-muted)', value: totalComments },
    { label: 'Issues', kind: 'issues', color: '#FF5267', value: totalIssues },
  ], [totalPushes, totalMRS, totalMerged, totalComments, totalIssues])

  const donutArcs = useMemo(() => {
    let donutCursor = 0
    return donutSegmentDefs.map((def) => {
      const value = Math.max(0, toFinite(def.value))
      const fraction = totalActivity > 0 ? value / totalActivity : 0
      const arc = { ...def, value, fraction, length: fraction * donutCircumference, start: donutCursor }
      donutCursor += arc.length
      return arc
    })
  }, [donutSegmentDefs, totalActivity, donutCircumference])

  const activeDonutArc = activeDonut !== null && activeDonut < donutArcs.length ? donutArcs[activeDonut] : null

  if (loading) {
    return <div className="dashboard-panel-loading-overlay" role="status" aria-live="polite"><Spin size="small" /><span>Loading user data…</span></div>
  }

  if (usersList.length === 0) {
    return <div className="leaderboard-empty">No user activity data available</div>
  }

  const metricMeta = [
    { label: 'Pushes', color: '#18D99A', data: pushLeader, getVal: (u: UserActivity) => Number(u.push_count) || 0 },
    { label: 'MRs', color: '#FFC21C', data: mrLeader, getVal: (u: UserActivity) => Number(u.merge_request_count) || 0 },
    { label: 'Merged', color: '#39A0FF', data: mergedLeader, getVal: (u: UserActivity) => Number(u.merged_count) || 0 },
    { label: 'Comments', color: 'var(--dashboard-muted)', data: commentLeader, getVal: (u: UserActivity) => Number(u.comment_count) || 0 },
    { label: 'Issues', color: '#FF5267', data: issueLeader, getVal: (u: UserActivity) => Number(u.issue_count) || 0 },
  ]

  return (
    <div className="users-analytics-view">
      <div className="users-analytics-top-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.5fr) minmax(280px, 1fr)', gap: '10px' }}>
        
        {/* LEFT: DONUT */}
        <div className="users-analytics-donut-wrap" style={{ height: '100%' }}>
          <div className="analytics-donut-card" style={{ height: '100%' }}>
            <header>
              <strong>🍩 Activity Mix</strong>
              <small>Distribution by event type</small>
            </header>
            <div className="analytics-donut-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="analytics-donut-chart">
                <div className="analytics-donut" style={{ width: '100%', height: '100%', position: 'relative', margin: 0 }}>
                  <svg className={`donut-svg${activeDonutArc ? ' has-active' : ''}`} viewBox="0 0 142 142" aria-hidden="true" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
                    <g transform="rotate(-90 71 71)">
                      <circle className="donut-track" cx="71" cy="71" r="62.5" fill="none" strokeWidth="17" />
                      {donutArcs.map((arc, index) => {
                        if (arc.length <= 0) return null
                        const dash = arc.length + 1
                        return (
                          <circle
                            key={arc.label}
                            className={`donut-seg${activeDonut === index ? ' is-active' : ''}`}
                            style={{ stroke: arc.color, strokeDasharray: `${dash} ${donutCircumference - dash}`, strokeDashoffset: -arc.start } as React.CSSProperties}
                            cx="71"
                            cy="71"
                            r="62.5"
                            fill="none"
                            strokeWidth="17"
                            tabIndex={0}
                            aria-label={`${arc.label}: ${arc.value}`}
                            onMouseEnter={() => setActiveDonut(index)}
                            onMouseLeave={() => setActiveDonut(null)}
                            onFocus={() => setActiveDonut(index)}
                            onBlur={() => setActiveDonut(null)}
                          />
                        )
                      })}
                    </g>
                  </svg>
                  <div className="donut-center" style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <b style={{ fontSize: '1.4rem', fontWeight: 600, color: 'var(--dashboard-text)', lineHeight: 1.1 }}>{totalActivity.toLocaleString()}</b>
                    <small style={{ marginTop: '2px', color: 'var(--dashboard-muted)', fontSize: '0.65rem', textTransform: 'uppercase' }}>events</small>
                  </div>
                  <span className={`donut-tooltip${activeDonutArc ? ' is-active' : ''}`} role="tooltip" aria-hidden={!activeDonutArc}>
                    {activeDonutArc && (
                      <span className="donut-tooltip-line">
                        <i className="metric-dot" style={{ background: activeDonutArc.color }} aria-hidden="true" />
                        <span>{activeDonutArc.label} · {activeDonutArc.value.toLocaleString()} · {(activeDonutArc.fraction * 100).toFixed(1)}%</span>
                      </span>
                    )}
                  </span>
                </div>
              </div>
              <div className="analytics-donut-legend">
                <span className="legend-item"><i className="legend-dot" style={{ background: '#18D99A' }} />Pushes · {totalPushes.toLocaleString()}</span>
                <span className="legend-item"><i className="legend-dot" style={{ background: '#FFC21C' }} />MRs · {totalMRS.toLocaleString()}</span>
                <span className="legend-item"><i className="legend-dot" style={{ background: '#39A0FF' }} />Merged · {totalMerged.toLocaleString()}</span>
                <span className="legend-item"><i className="legend-dot" style={{ background: 'var(--dashboard-muted)' }} />Comments · {totalComments.toLocaleString()}</span>
                <span className="legend-item"><i className="legend-dot" style={{ background: '#FF5267' }} />Issues · {totalIssues.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* MIDDLE: 6 CARDS */}
        <div className="users-palette-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', gridAutoRows: '1fr' }}>
          <article className="compact-user-card user-dashboard-card active-users-card">
            <header><span>Active users</span><small>Current</small></header>
            <div className="stat-value-row"><b className="big-stat accent">{activeUsers}</b></div>
          </article>
          <article className="compact-user-card user-dashboard-card merged-users-card">
            <header><span>Merged</span><small>Users</small></header>
            <div className="stat-value-row"><b className="big-stat accent">{totalMerged.toLocaleString()}</b></div>
          </article>
          <article className="compact-user-card user-dashboard-card pushes-card">
            <header><span>Pushes</span><small>Activity</small></header>
            <div className="stat-value-row"><b className="big-stat accent">{totalPushes.toLocaleString()}</b></div>
          </article>
          <article className="compact-user-card user-dashboard-card comments-card">
            <header><span>Comments</span><small>Activity</small></header>
            <div className="stat-value-row"><b className="big-stat accent">{totalComments.toLocaleString()}</b></div>
          </article>
          <article className="compact-user-card user-dashboard-card merge-requests-card">
            <header><span>Merge requests</span><small>Activity</small></header>
            <div className="stat-value-row"><b className="big-stat accent">{totalMRS.toLocaleString()}</b></div>
          </article>
          <article className="compact-user-card user-dashboard-card issues-card">
            <header><span>Issues</span><small>Activity</small></header>
            <div className="stat-value-row"><b className="big-stat accent">{totalIssues.toLocaleString()}</b></div>
          </article>
        </div>

        {/* RIGHT: TOP 5 USER ACTIVE & TOTAL */}
        <article className="compact-user-card user-dashboard-card total-activity-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '8px' }}>
          <div>
            <header style={{ marginBottom: '4px' }}><span>Total activity</span><small>All events</small></header>
            <div className="stat-value-row"><b className="big-stat accent">{totalActivity.toLocaleString()}</b></div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--dashboard-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top 5 Active Users</span>
            {engagementLeader.length > 0 ? engagementLeader.map((u, i) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'color-mix(in srgb, var(--dashboard-surface) 50%, transparent)', borderRadius: '6px', border: '1px solid color-mix(in srgb, var(--dashboard-border) 50%, transparent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--dashboard-muted)' }}>{i + 1}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dashboard-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name || u.username}</span>
                  </div>
                </div>
                <b style={{ fontSize: '13px', color: 'var(--dashboard-accent)', fontWeight: 700 }}>{u._total}</b>
              </div>
            )) : (
              <div style={{ fontSize: '12px', color: 'var(--dashboard-muted)' }}>No activity</div>
            )}
          </div>
        </article>
      </div>

      <div className="users-top5-wrap">
        {metricMeta.map((m) => (
          <div className="leaderboard-card-container" key={m.label}>
            <header>
              <strong>{m.label}</strong>
              <small>Top 5 {m.label}s</small>
            </header>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <table className="users-top5-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>User</th>
                    <th style={{ width: 50 }}>{m.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {m.data.map((u, i) => (
                    <tr key={u.id}>
                      <td className={`users-top5-rank rank-${i + 1}`}>{i + 1}</td>
                      <td className="users-top5-identity">
                        <div className="users-top5-name">
                          {u.web_url ? (
                            <a href={u.web_url} target="_blank" rel="noreferrer">{u.name || u.username}</a>
                          ) : (
                            <span>{u.name || u.username}</span>
                          )}
                          <small>@{u.username}</small>
                        </div>
                      </td>
                      <td className="users-top5-metric">{m.getVal(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}

function GroupSelector({ envId, selected, onChange }: { envId: number; selected: number | undefined; onChange: (id: number) => void }) {
  const { data: groups, isLoading } = useQuery({
    queryKey: ['groups', envId],
    queryFn: api.getGroups,
  })

  if (isLoading || !groups || groups.length === 0) return null

  return (
    <Select
      className="dashboard-range-control"
      style={{ width: 200 }}
      value={selected}
      onChange={onChange}
      options={groups.map((g) => ({ label: g.name, value: g.id }))}
    />
  )
}

function DashboardPage() {
  const { selectedGroupId, selectedEnvId, setSelectedGroupId } = useGroupContext()

  const [rangeHours, setRangeHours] = useState(getDefaultHours(LOCAL_STORAGE_RANGE_KEY))
  const [activeTab, setActiveTab] = useState('pipelines')

  const { data: config } = useQuery({
    queryKey: ['global-config'],
    queryFn: api.getGlobalConfig,
  })

  const fullHistoryQuery = useQuery({
    queryKey: ['analytics-summary-full', selectedEnvId, selectedGroupId],
    queryFn: () => api.getAnalyticsSummary(selectedGroupId ?? 0, PIPELINE_HISTORY_HOURS, config?.pipeline_view || 'latest'),
    enabled: !!selectedEnvId && !!selectedGroupId,
  })
  const fullHistoryPipelineCount = fullHistoryQuery.data?.pipeline_count

  const pipelineReadyQuery = useQuery({
    queryKey: ['analytics-readiness', selectedEnvId, selectedGroupId],
    queryFn: () => api.getAnalyticsReadiness(selectedGroupId ?? 0),
    enabled: !!selectedEnvId && !!selectedGroupId,
  })

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics-summary', selectedEnvId, selectedGroupId, rangeHours, config?.pipeline_view],
    queryFn: () => api.getAnalyticsSummary(selectedGroupId ?? 0, rangeHours, config?.pipeline_view || 'latest'),
    enabled: !!selectedEnvId && !!selectedGroupId,
  })

  const { data: usersData, isLoading: usersLoading, isFetching: usersFetching } = useQuery({
    queryKey: ['analytics-users', selectedEnvId, selectedGroupId, rangeHours, 'both'],
    queryFn: () => api.getUsersAnalytics(selectedGroupId ?? 0, rangeHours),
    enabled: !!selectedEnvId && !!selectedGroupId,
  })

  /* ── Defensive: ensure usersData is always an array ──────────────── */
  const users: UserActivity[] = Array.isArray(usersData) ? usersData : []
  const hasUsersData = !!users.length
  const showUsersLoading = usersLoading && !hasUsersData

  /* ── Always define derived values before any early returns ──────── */
  const summary = useMemo(
    () => summaryData ?? EMPTY_ANALYTICS_SUMMARY,
    [summaryData],
  )

  const pipelineLoading = summaryLoading || !!pipelineReadyQuery.isLoading || datasetIsPending(pipelineReadyQuery.data, 'pipelines', pipelineReadyQuery.isLoading)

  const hasNoGroup = !selectedEnvId || !selectedGroupId

  /* ── Auto-hide scrollbar after 1.5s idle ───────────────────────── */
  useEffect(() => {
    const el = document.documentElement
    let timer: ReturnType<typeof setTimeout> | null = null

    const hideScrollbar = () => {
      if (timer) clearTimeout(timer)
      el.classList.remove('hide-scrollbar')
      timer = setTimeout(() => el.classList.add('hide-scrollbar'), 1500)
    }

    el.classList.add('hide-scrollbar')
    window.addEventListener('scroll', hideScrollbar, { passive: true })
    return () => {
      window.removeEventListener('scroll', hideScrollbar)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (hasNoGroup) {
    return (
      <div className="dashboard-page">
        <section className="summary-bar">
          <div className="summary-bar-title">
            <span className="page-header-icon"><DashboardMark aria-hidden /></span>
            <div className="page-header-copy">
              <span>DASHBOARD</span>
              <small>Analytics overview</small>
            </div>
          </div>
        </section>
        <p>No group selected. Please choose an environment and group.</p>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      <section className="summary-bar">
        <div className="summary-bar-title">
          <span className="page-header-icon"><DashboardMark aria-hidden /></span>
          <div className="page-header-copy">
            <span>DASHBOARD</span>
            <small>Historical performance and delivery health for the selected GitLab group.</small>
          </div>
        </div>
      </section>
      <div className="dashboard-tabs">
        <div className="dashboard-tabs-row">
          <AntTabs
            activeKey={activeTab}
            onChange={setActiveTab}
            className="dashboard-tabs-links"
            items={[
              {
                key: 'pipelines',
                label: 'Pipeline Analytics',
              },
              {
                key: 'users',
                label: 'User Analytics',
              },
            ]}
          />
          <div className="pipeline-range-control">
            <span>Range</span>
            <Select
              className="range-select"
              value={rangeHours}
              onChange={(v) => {
                const hour = typeof v === 'string' ? Number(v) : v
                setRangeHours(hour)
                try { localStorage.setItem(LOCAL_STORAGE_RANGE_KEY, String(hour)) } catch { /* ignore */ }
              }}
              options={TIME_RANGES.map((r) => ({ label: formatTimeRangeLabel(r.hours), value: r.hours }))}
              classNames={{ popup: { root: 'range-select-dropdown' } }}
            />
          </div>
        </div>
      </div>
      {activeTab === 'pipelines' && (
        <AnalyticsLoadingGate
          active={pipelineLoading}
          className="analytics-loading-gate--full"
          message="Collecting analytics"
        >
          <PipelineAnalyticsDashboard
            summary={summary}
            fullHistoryPipelineCount={fullHistoryPipelineCount}
          />
        </AnalyticsLoadingGate>
      )}
      {activeTab === 'users' && (
        <div className="users-analytics" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {showUsersLoading && (
            <div className="dashboard-panel-loading-overlay" role="status" aria-live="polite">
              <Spin size="small" />
              <span>Loading user data…</span>
            </div>
          )}
          <UsersAnalyticsDashboard
            users={users ?? []}
            loading={showUsersLoading}
          />
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return <DashboardPage />
}
