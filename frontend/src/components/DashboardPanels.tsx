import { useMemo } from 'react'
import { Typography } from 'antd'
import EChartsWrapper from './EChartsWrapper'

const { Text } = Typography

/* ── StatPanel ─────────────────────────────────────────────────────── */

export function StatPanel({
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

/* ── status helpers ────────────────────────────────────────────────── */

export function statusColor(status: string): string {
  switch (status) {
    case 'success': return 'var(--dashboard-success)'
    case 'manual': return 'var(--dashboard-warning)'
    case 'failed': return 'var(--dashboard-danger)'
    case 'running': case 'active': return 'var(--dashboard-info)'
    case 'canceled': return 'var(--dashboard-muted)'
    default: return 'var(--dashboard-muted)'
  }
}

export function statusTextColor(status: string): string {
  switch (status) {
    case 'success': return '#fff'
    case 'manual': return '#000'
    case 'running': case 'active': return '#fff'
    case 'failed': return '#fff'
    default: return '#fff'
  }
}

/* ── GaugeChart ────────────────────────────────────────────────────── */

export function GaugeChart({
  value,
  color,
  subtitle,
  height = 80,
}: {
  value: number
  color: string
  subtitle: string
  height?: number
}) {
  const option = useMemo(() => ({
    series: [{
      type: 'gauge',
      startAngle: 220,
      endAngle: -40,
      min: 0,
      max: 100,
      radius: '90%',
      center: ['50%', '60%'],
      progress: { show: true, width: 12, roundCap: true, itemStyle: { color } },
      axisLine: { lineStyle: { width: 12, color: [[1, 'var(--dashboard-gauge-track)']] } },
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
    }],
  }), [value, color])

  return (
    <div className="gauge-container">
      <EChartsWrapper option={option} style={{ height: `${height}px`, width: '100%' }}/>
      <div className="gauge-subtitle">{subtitle}</div>
    </div>
  )
}

/* ── StatusBar ─────────────────────────────────────────────────────── */

export function StatusBar({
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

/* ── SparkBarChart ─────────────────────────────────────────────────── */

export function SparkBarChart({ data }: { data: { label: string; pipeline_count: number; project_count: number }[] }) {
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
    series: [{
      type: 'bar',
      data: data.map((d) => d.pipeline_count),
      barWidth: 14,
      itemStyle: { borderRadius: [0, 3, 3, 0], color: 'var(--dashboard-accent)' },
      label: {
        show: true, position: 'right', fontSize: 10,
        color: 'var(--dashboard-text)', formatter: '{c}',
      },
    }],
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
