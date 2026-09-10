import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select, Typography, Alert, Tabs as AntTabs, Spin } from 'antd'
import { GroupContext, useGroupContext } from '../contexts/GroupContext'
import DashboardMark from '../components/DashboardMark'
import AnalyticsLoadingGate, { datasetIsPending } from '../components/AnalyticsLoadingGate'
import EChartsWrapper from '../components/EChartsWrapper'
import { api } from '../services/api'
import {
  PieChartOutlined,
  UserOutlined,
  BranchesOutlined,
  UploadOutlined,
  MessageOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ThunderboltOutlined,
  RiseOutlined,
} from '@ant-design/icons'
import {
  BranchesOutlined as BranchesIcon,
  CheckCircleOutlined as CheckCircleIcon,
  CloseCircleOutlined as CloseCircleIcon,
  TeamOutlined as TeamIcon,
  PieChartOutlined as PieChartIcon,
  BarChartOutlined as BarChartIcon,
  FolderOutlined as FolderIcon,
  ThunderboltOutlined as ThunderboltIcon,
  RocketOutlined as RocketIcon,
  ClusterOutlined as ClusterIcon,
} from '@ant-design/icons-svg'
import type { IconDefinition, AbstractNode } from '@ant-design/icons-svg/lib/types'
import { TIME_RANGES } from '../utils/timeRanges'
import { PIPELINE_STATUSES, getPipelineEffectiveStatus } from '../utils/pipelineShared'
import type { AnalyticsSummary, UserActivity, AnalyticsReadiness, GlobalConfigDTO, PipelineInfo, JobInfo } from '../types'
import '../styles/dashboard.css'

function PanelIcon({ icon, className }: { icon: IconDefinition; className?: string }) {
  const node: AbstractNode = typeof icon.icon === 'function' ? icon.icon('currentColor', 'currentColor') : icon.icon
  return (
    <svg
      viewBox={node.attrs?.viewBox || '64 64 896 896'}
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      focusable="false"
    >
      {node.children?.map((child: AbstractNode, idx: number) => (
        <path key={idx} d={child.attrs?.d as string} />
      ))}
    </svg>
  )
}

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
          <span style={{ color: 'var(--dashboard-success)' }}>{summary.active_count}</span>
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
  subtitle,
  tone,
  value,
  count,
  denominator,
  countLabel,
  loading = false,
}: {
  title: string
  chip: string
  subtitle?: string
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
      <header>
        <div>
          <strong className="panel-title-with-icon">
            <PanelIcon
              icon={tone === 'danger' ? CloseCircleIcon : CheckCircleIcon}
              className="panel-title-icon"
              aria-hidden
            />
            {title}
          </strong>
          <small>{subtitle || (tone === 'danger' ? 'Share of failed pipelines' : 'Share of successful pipelines')}</small>
        </div>
        <span className="panel-header-badge">{chip}</span>
      </header>
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
          {pct >= 100 && (
            <>
              <span className="gauge-cap gauge-cap-start" aria-hidden="true" />
              <span
                className="gauge-cap gauge-cap-end"
                style={{ transform: `rotate(${arcDeg}deg)` }}
                aria-hidden="true"
              />
            </>
          )}
          <b>{pct.toFixed(1)}%</b>
          <span className={`gauge-tooltip${active ? ' is-active' : ''}`} role="tooltip" aria-hidden={!active}>
            <b>{pct.toFixed(1)}%</b><span>{safeCount.toLocaleString()} of {safeDenominator.toLocaleString()} completed pipelines</span>
          </span>
        </div>
      </div>
      <p><span className="gauge-rate-badge">{safeCount.toLocaleString()} {countLabel}</span></p>
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
  const history = [...(summary.history ?? [])].reverse()
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
        <header>
          <div>
            <strong className="panel-title-with-icon">
              <PanelIcon icon={BranchesIcon} className="panel-title-icon" aria-hidden />
              Total Pipelines
            </strong>
            <small>Runs captured in PostgreSQL</small>
          </div>
          <span className="panel-header-badge">History</span>
        </header>
        <div className="analytics-big-number">{(fullHistoryPipelineCount ?? summary.pipeline_count ?? 0).toLocaleString()}</div>
        <p>Runs captured in PostgreSQL</p>
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
        subtitle="Share of successful pipelines"
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
        subtitle="Share of failed pipelines"
        tone="danger"
        value={failedRate}
        count={summary.failed_count}
        denominator={total}
        countLabel="failed pipelines"
        loading={loading}
      />

      <article className={loadingPanelClass('analytics-card inventory-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header>
          <div>
            <strong className="panel-title-with-icon">
              <PanelIcon icon={TeamIcon} className="panel-title-icon" aria-hidden />
              Group inventory
            </strong>
            <small>GitLab groups linked to this environment</small>
          </div>
          <span className="panel-header-badge">Configured</span>
        </header>
        <div className="analytics-big-number">{summary.group_count}</div><p>GitLab groups linked to this environment</p>
        <small className="inventory-bottom-badge"><i className="inventory-swatch" />Active groups per period</small>
      </article>

      <article className={loadingPanelClass('analytics-card donut-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header>
          <div>
            <strong className="panel-title-with-icon">
              <PieChartOutlined className="panel-title-icon" aria-hidden />
              Pipeline status mix
            </strong>
            <small>Distribution by pipeline status</small>
          </div>
          <span className="panel-header-badge">Distribution</span>
        </header>
        <div className="analytics-donut-body">
          <div className="analytics-donut-chart">
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
              <div className="donut-center">
                <b>{summary.pipeline_count.toLocaleString()}</b>
                <small>runs</small>
              </div>
              <span className={`donut-tooltip${activeDonutArc ? ' is-active' : ''}`} role="tooltip" aria-hidden={!activeDonutArc}>
                {activeDonutArc && (
                  <span className="donut-tooltip-line">
                    <i className={`metric-dot ${activeDonutArc.kind}`} style={{ background: activeDonutArc.color }} aria-hidden="true" />
                    <span>{activeDonutArc.label} · {activeDonutArc.value.toLocaleString()} · {percent(activeDonutArc.value).toFixed(1)}%</span>
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="analytics-donut-legend donut-legend">
            {donutSegmentDefs.map((seg, index) => (
              <span
                key={seg.label}
                className={`donut-badge donut-badge-${seg.kind}${activeDonut === index ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveDonut(index)}
                onMouseLeave={() => setActiveDonut(null)}
                onFocus={() => setActiveDonut(index)}
                onBlur={() => setActiveDonut(null)}
                tabIndex={0}
              >
                <i className="legend-dot" style={{ background: seg.color }} />
                {seg.label} · {seg.value.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      </article>

      <article className={loadingPanelClass('analytics-card distribution-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header>
          <div>
            <strong className="panel-title-with-icon">
              <PanelIcon icon={BarChartIcon} className="panel-title-icon" aria-hidden />
              Status distribution
            </strong>
            <small>Share of collected pipeline runs</small>
          </div>
          <span className="panel-header-badge">PostgreSQL</span>
        </header>
        <div className="analytics-bar-list">
          {statusRows.map(([label, value, kind]) => <div className="analytics-bar-row" key={kind}>
            <span><i className={`metric-dot ${kind}`} />{label}</span><div className="analytics-bar-track"><i className={kind} style={{ width: `${percent(value)}%` }} /></div><b>{value}</b><small>{percent(value).toFixed(1)}%</small>
          </div>)}
        </div>
      </article>

      <article className={loadingPanelClass('analytics-card inventory-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header>
          <div>
            <strong className="panel-title-with-icon">
              <PanelIcon icon={FolderIcon} className="panel-title-icon" aria-hidden />
              Project inventory
            </strong>
            <small>Projects tracked in this group</small>
          </div>
          <span className="panel-header-badge">Synced</span>
        </header>
        <div className="analytics-big-number">{summary.project_count}</div><p>Projects tracked in this group</p>
        <small className="inventory-bottom-badge"><i className="inventory-swatch" />Active projects per period</small>
      </article>

      <article className={loadingPanelClass('analytics-card runner-status-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header>
          <div>
            <strong className="panel-title-with-icon">
              <PanelIcon icon={ThunderboltIcon} className="panel-title-icon" aria-hidden />
              Runner status
            </strong>
            <small>Latest synchronized runner availability</small>
          </div>
          <span className="panel-header-badge">Runner state</span>
        </header>
        <div className="analytics-bar-list">
          {runnerRows.map(([label, value, kind]) => <div className="analytics-bar-row" key={kind}>
            <span><i className={`metric-dot runner-${kind}`} />{label}</span><div className="analytics-bar-track"><i className={`runner-${kind}`} style={{ width: `${runnerPercent(value)}%` }} /></div><b>{value}</b><small>{runnerPercent(value).toFixed(1)}%</small>
          </div>)}
        </div>
      </article>

      <article className={loadingPanelClass('analytics-card delivery-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header>
          <div>
            <strong className="panel-title-with-icon">
              <PanelIcon icon={RocketIcon} className="panel-title-icon" aria-hidden />
              Delivery activity
            </strong>
            <small>Active and in-progress runs</small>
          </div>
          <span className="panel-header-badge">Live state</span>
        </header>
        <div className="delivery-value"><b>{summary.active_count}</b><small>active now</small></div>
        <div className="delivery-row"><span><i className="metric-dot active" />Running</span><b>{summary.active_count}</b></div>
        <div className="delivery-row"><span><i className="metric-dot canceled" />Canceled</span><b>{summary.canceled_count}</b></div>
      </article>

      <article className={loadingPanelClass('analytics-card inventory-card runner-inventory-card', loading)}>
        <DashboardPanelLoader active={loading} />
        <header>
          <div>
            <strong className="panel-title-with-icon">
              <PanelIcon icon={ClusterIcon} className="panel-title-icon" aria-hidden />
              Runner inventory
            </strong>
            <small>Self-hosted runners in this group</small>
          </div>
          <span className="panel-header-badge">Synced</span>
        </header>
        <div className="analytics-big-number">{summary.runner_count}</div><p>Self-hosted runners in this group</p>
        <small className="inventory-bottom-badge"><i className="inventory-swatch" />{summary.runner_running_count + summary.runner_idle_count} currently online</small>
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
export function UsersAnalyticsDashboard({ users, loading }: { users: UserActivity[]; loading: boolean }) {

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
      .filter((u) => (Number(u.push_count) || 0) > 0)
      .sort((a, b) => (Number(b.push_count) || 0) - (Number(a.push_count) || 0) || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])
  const mrLeader = useMemo(() =>
    [...dedupedUsers]
      .filter((u) => (Number(u.merge_request_count) || 0) > 0)
      .sort((a, b) => (Number(b.merge_request_count) || 0) - (Number(a.merge_request_count) || 0) || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])
  const mergedLeader = useMemo(() =>
    [...dedupedUsers]
      .filter((u) => (Number(u.merged_count) || 0) > 0)
      .sort((a, b) => (Number(b.merged_count) || 0) - (Number(a.merged_count) || 0) || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])
  const commentLeader = useMemo(() =>
    [...dedupedUsers]
      .filter((u) => (Number(u.comment_count) || 0) > 0)
      .sort((a, b) => (Number(b.comment_count) || 0) - (Number(a.comment_count) || 0) || a.name.localeCompare(b.name))
      .slice(0, 5), [dedupedUsers])
  const issueLeader = useMemo(() =>
    [...dedupedUsers]
      .filter((u) => (Number(u.issue_count) || 0) > 0)
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
      <div className="users-analytics-top-grid">
        
        {/* LEFT: DONUT */}
        <div className="users-analytics-donut-wrap">
          <div className="analytics-donut-card">
            <header>
              <div>
                <strong className="panel-title-with-icon">
                  <PieChartOutlined className="panel-title-icon" aria-hidden />
                  Activity Mix
                </strong>
                <small>Distribution by event type</small>
              </div>
              <span className="panel-header-badge">Distribution</span>
            </header>
            <div className="analytics-donut-body">
              <div className="analytics-donut-chart">
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
                  <div className="donut-center">
                    <b>{totalActivity.toLocaleString()}</b>
                    <small>events</small>
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
                <span className="donut-badge donut-badge-pushes"><i className="legend-dot" style={{ background: '#18D99A' }} />Pushes · {totalPushes.toLocaleString()}</span>
                <span className="donut-badge donut-badge-mrs"><i className="legend-dot" style={{ background: '#FFC21C' }} />MRs · {totalMRS.toLocaleString()}</span>
                <span className="donut-badge donut-badge-merged"><i className="legend-dot" style={{ background: '#39A0FF' }} />Merged · {totalMerged.toLocaleString()}</span>
                <span className="donut-badge donut-badge-comments"><i className="legend-dot" style={{ background: 'var(--dashboard-muted)' }} />Comments · {totalComments.toLocaleString()}</span>
                <span className="donut-badge donut-badge-issues"><i className="legend-dot" style={{ background: '#FF5267' }} />Issues · {totalIssues.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: 8 BALANCED STAT CARDS */}
        <div className="users-palette-grid">
          <article className="compact-user-card user-dashboard-card total-activity-card">
            <header>
              <span className="card-title-flex"><ThunderboltOutlined className="card-icon" />Total activity</span>
              <small className="stat-header-chip">All events</small>
            </header>
            <div className="stat-value-row"><b className="big-stat accent">{totalActivity.toLocaleString()}</b></div>
            <small className="stat-card-subtext">Total recorded events</small>
          </article>
          <article className="compact-user-card user-dashboard-card active-users-card">
            <header>
              <span className="card-title-flex"><UserOutlined className="card-icon" />Active users</span>
              <small className="stat-header-chip">Current</small>
            </header>
            <div className="stat-value-row"><b className="big-stat accent">{activeUsers}</b></div>
            <small className="stat-card-subtext">{dedupedUsers.length > 0 ? `${((activeUsers / dedupedUsers.length) * 100).toFixed(0)}% members active` : 'Active members'}</small>
          </article>
          <article className="compact-user-card user-dashboard-card avg-activity-card">
            <header>
              <span className="card-title-flex"><RiseOutlined className="card-icon" />Avg per user</span>
              <small className="stat-header-chip">Per active</small>
            </header>
            <div className="stat-value-row"><b className="big-stat accent">{activeUsers > 0 ? (totalActivity / activeUsers).toFixed(1) : '0'}</b></div>
            <small className="stat-card-subtext">Events / active member</small>
          </article>
          <article className="compact-user-card user-dashboard-card merged-users-card">
            <header>
              <span className="card-title-flex"><CheckCircleOutlined className="card-icon" />Merged</span>
              <small className="stat-header-chip">Users</small>
            </header>
            <div className="stat-value-row"><b className="big-stat accent">{totalMerged.toLocaleString()}</b></div>
            <small className="stat-card-subtext">{totalActivity > 0 ? `${((totalMerged / totalActivity) * 100).toFixed(1)}% of total` : 'Merged MRs'}</small>
          </article>
          <article className="compact-user-card user-dashboard-card pushes-card">
            <header>
              <span className="card-title-flex"><UploadOutlined className="card-icon" />Pushes</span>
              <small className="stat-header-chip">Activity</small>
            </header>
            <div className="stat-value-row"><b className="big-stat accent">{totalPushes.toLocaleString()}</b></div>
            <small className="stat-card-subtext">{totalActivity > 0 ? `${((totalPushes / totalActivity) * 100).toFixed(1)}% of total` : 'Code pushes'}</small>
          </article>
          <article className="compact-user-card user-dashboard-card merge-requests-card">
            <header>
              <span className="card-title-flex"><BranchesOutlined className="card-icon" />Merge requests</span>
              <small className="stat-header-chip">Activity</small>
            </header>
            <div className="stat-value-row"><b className="big-stat accent">{totalMRS.toLocaleString()}</b></div>
            <small className="stat-card-subtext">{totalActivity > 0 ? `${((totalMRS / totalActivity) * 100).toFixed(1)}% of total` : 'MR submissions'}</small>
          </article>
          <article className="compact-user-card user-dashboard-card comments-card">
            <header>
              <span className="card-title-flex"><MessageOutlined className="card-icon" />Comments</span>
              <small className="stat-header-chip">Activity</small>
            </header>
            <div className="stat-value-row"><b className="big-stat accent">{totalComments.toLocaleString()}</b></div>
            <small className="stat-card-subtext">{totalActivity > 0 ? `${((totalComments / totalActivity) * 100).toFixed(1)}% of total` : 'Discussions'}</small>
          </article>
          <article className="compact-user-card user-dashboard-card issues-card">
            <header>
              <span className="card-title-flex"><ExclamationCircleOutlined className="card-icon" />Issues</span>
              <small className="stat-header-chip">Activity</small>
            </header>
            <div className="stat-value-row"><b className="big-stat accent">{totalIssues.toLocaleString()}</b></div>
            <small className="stat-card-subtext">{totalActivity > 0 ? `${((totalIssues / totalActivity) * 100).toFixed(1)}% of total` : 'Reported issues'}</small>
          </article>
        </div>

      </div>

      <div className="users-top5-wrap">
        {metricMeta.map((m) => (
          <div className="leaderboard-card-container" key={m.label}>
            <header>
              <strong>{m.label}</strong>
              <small className="leaderboard-category-chip">Top 5</small>
            </header>
            <div className="leaderboard-table-scroll">
              <table className="users-top5-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>#</th>
                    <th>User</th>
                    <th style={{ width: 64, textAlign: 'right' }}>{m.label}</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4].map((i) => {
                    const u = m.data[i]
                    if (u) {
                      return (
                        <tr key={u.id}>
                          <td className="users-top5-rank-cell">
                            <span className={`users-top5-rank-pill rank-${i + 1}`}>{i + 1}</span>
                          </td>
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
                          <td className="users-top5-metric">
                            <span className="users-top5-metric-badge" style={{ '--metric-color': m.color } as React.CSSProperties}>
                              {m.getVal(u).toLocaleString()}
                            </span>
                          </td>
                        </tr>
                      )
                    }
                    return (
                      <tr key={`empty-${i + 1}`} className="empty-row">
                        <td className="users-top5-rank-cell">
                          <span className="users-top5-rank-pill rank-empty">{i + 1}</span>
                        </td>
                        <td colSpan={2} className="users-top5-empty-cell">
                          <span className="empty-dash">—</span>
                        </td>
                      </tr>
                    )
                  })}
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

  const [pipelineRangeHours, setPipelineRangeHours] = useState(() => getDefaultHours('analytics_range_pipelines'))
  const [userRangeHours, setUserRangeHours] = useState(() => getDefaultHours('analytics_range_users'))
  const [activeTab, setActiveTab] = useState('pipelines')

  const rangeHours = activeTab === 'pipelines' ? pipelineRangeHours : userRangeHours

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
    queryKey: ['analytics-summary', selectedEnvId, selectedGroupId, pipelineRangeHours, config?.pipeline_view],
    queryFn: () => api.getAnalyticsSummary(selectedGroupId ?? 0, pipelineRangeHours, config?.pipeline_view || 'latest'),
    enabled: !!selectedEnvId && !!selectedGroupId,
  })

  const { data: usersData, isLoading: usersLoading, isFetching: usersFetching } = useQuery({
    queryKey: ['analytics-users', selectedEnvId, selectedGroupId, userRangeHours, 'both'],
    queryFn: () => api.getUsersAnalytics(selectedGroupId ?? 0, userRangeHours),
    enabled: !!selectedEnvId && !!selectedGroupId,
  })

  const pipelineView = config?.pipeline_view || 'latest'

  const { data: pipelineProjects, isLoading: pipelineProjectsLoading } = useQuery({
    queryKey: ['pipeline-projects', selectedEnvId, selectedGroupId, pipelineView, pipelineRangeHours],
    queryFn: () =>
      api.getPipelineProjects({ group_id: selectedGroupId || 0, hours: pipelineRangeHours, pipeline_view: pipelineView }),
    enabled: !!selectedGroupId && activeTab === 'pipelines',
    staleTime: 5_000,
  })

  const { pipelineIdsStr, candidatePipelines } = useMemo(() => {
    const latestOnly = pipelineView !== 'all'
    const list: PipelineInfo[] = []
    const seen = new Set<number>()
    for (const groupData of pipelineProjects || []) {
      let cands = groupData.pipelines || []
      if (latestOnly) {
        const latestByRef = new Map<string, PipelineInfo>()
        for (const p of cands) {
          const existing = latestByRef.get(p.ref)
          if (!existing || p.updated_at > existing.updated_at) {
            latestByRef.set(p.ref, p)
          }
        }
        cands = Array.from(latestByRef.values())
      }
      for (const p of cands) {
        if (!seen.has(p.id)) {
          seen.add(p.id)
          list.push(p)
        }
      }
    }
    return {
      candidatePipelines: list,
      pipelineIdsStr: list.map((p) => p.id).join(','),
    }
  }, [pipelineProjects, pipelineView])

  const { data: allBatchJobs } = useQuery({
    queryKey: ['batch-jobs', selectedEnvId, pipelineIdsStr],
    queryFn: () => api.getBatchJobs(pipelineIdsStr),
    enabled: pipelineIdsStr.length > 0 && activeTab === 'pipelines',
    staleTime: 10_000,
  })

  const jobsByPipeline = useMemo(() => {
    const map = new Map<number, JobInfo[]>()
    if (allBatchJobs) {
      for (const job of allBatchJobs) {
        const existing = map.get(job.pipeline_id) || []
        existing.push(job)
        map.set(job.pipeline_id, existing)
      }
    }
    return map
  }, [allBatchJobs])

  /* ── Defensive: ensure usersData is always an array ──────────────── */
  const users: UserActivity[] = Array.isArray(usersData) ? usersData : []
  const hasUsersData = !!users.length
  const showUsersLoading = usersLoading && !hasUsersData

  /* ── Always define derived values before any early returns ──────── */
  const summary = useMemo<AnalyticsSummary>(() => {
    const base = summaryData ?? EMPTY_ANALYTICS_SUMMARY
    if (!pipelineProjects) return base

    const counts: Record<string, number> = {}
    for (const s of PIPELINE_STATUSES) counts[s.value] = 0
    for (const p of candidatePipelines) {
      const rawJobs = jobsByPipeline.get(p.id) || []
      const st = getPipelineEffectiveStatus(p, rawJobs)
      counts[st] = (counts[st] || 0) + 1
    }

    const successCount = counts['success'] || 0
    const failedCount = counts['failed'] || 0
    const manualCount = counts['manual'] || 0
    const activeCount = counts['running'] || 0
    const canceledCount = counts['canceled'] || 0
    const pipelineCount = candidatePipelines.length
    const completed = successCount + failedCount
    const successRate = completed > 0 ? Math.round((successCount / completed) * 10000) / 100 : 0

    return {
      ...base,
      success_count: successCount,
      failed_count: failedCount,
      manual_count: manualCount,
      active_count: activeCount,
      canceled_count: canceledCount,
      pipeline_count: pipelineCount,
      success_rate: successRate,
    }
  }, [summaryData, pipelineProjects, candidatePipelines, jobsByPipeline])

  const pipelineLoading = summaryLoading || (activeTab === 'pipelines' && !!selectedGroupId && pipelineProjectsLoading && !summaryData) || !!pipelineReadyQuery.isLoading || datasetIsPending(pipelineReadyQuery.data, 'pipelines', pipelineReadyQuery.isLoading)

  const hasNoGroup = !selectedGroupId

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
              <span>Dashboard</span>
              <small>Historical performance and delivery health for the selected GitLab group.</small>
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
            <span>Dashboard</span>
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
                label: 'Pipelines analytics',
              },
              {
                key: 'users',
                label: 'Users analytics',
              },
            ]}
          />
          <div className="dashboard-range-control pipeline-range-control">
            <span>Range</span>
            <Select
              className="range-select"
              value={rangeHours}
              onChange={(v) => {
                const hour = typeof v === 'string' ? Number(v) : v
                if (activeTab === 'pipelines') {
                  setPipelineRangeHours(hour)
                  try { localStorage.setItem('analytics_range_pipelines', String(hour)) } catch { /* ignore */ }
                } else {
                  setUserRangeHours(hour)
                  try { localStorage.setItem('analytics_range_users', String(hour)) } catch { /* ignore */ }
                }
              }}
              options={TIME_RANGES.map((r) => ({ label: formatTimeRangeLabel(r.hours), value: r.hours }))}
              popupClassName="dashboard-range-dropdown"
              classNames={{ popup: { root: 'dashboard-range-dropdown range-select-dropdown' } }}
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
