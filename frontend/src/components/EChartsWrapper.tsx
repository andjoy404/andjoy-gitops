import { useRef, useEffect, useMemo, useCallback } from 'react'
import * as echarts from 'echarts'

interface EChartsWrapperProps {
  option: Record<string, unknown>
  style?: React.CSSProperties
  notMerge?: boolean
  lazyUpdate?: boolean
  optimisticServerRender?: boolean
  groups?: Record<string, unknown>
  renderer?: 'canvas' | 'svg'
  devicePixelRatio?: number
  width?: number | string
  height?: number | string
  id?: string
  className?: string
}

export default function EChartsWrapper({
  option,
  style,
  notMerge,
  lazyUpdate,
  optimisticServerRender,
  groups,
  renderer,
  devicePixelRatio,
  width,
  height,
  id,
  className,
}: EChartsWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!chartRef.current) return
    if (typeof window === 'undefined') return

    // Use global echarts if available, otherwise use the imported one
    const echartsLib = ((globalThis as any).__echarts__) ?? echarts

    const chart = echartsLib.init(chartRef.current!, undefined, {
      renderer: renderer ?? 'canvas',
      devicePixelRatio: devicePixelRatio ?? window.devicePixelRatio ?? 1,
      ssr: true,
      dimensions: undefined,
    })
    instanceRef.current = chart
    chart.setOption(option, { notMerge: notMerge ?? false, lazyUpdate: lazyUpdate ?? false })

    const handleResize = () => {
      if (instanceRef.current) {
        instanceRef.current.resize()
      }
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (instanceRef.current) {
        instanceRef.current.dispose()
        instanceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!instanceRef.current) return
    instanceRef.current.setOption(option, {
      notMerge: notMerge ?? false,
      lazyUpdate: lazyUpdate ?? false,
      replaceMerge: undefined,
    })
  }, [option, notMerge, lazyUpdate])

  return (
    <div
      ref={chartRef}
      style={{ width: width ?? '100%', height: height ?? '100%', ...style }}
      id={id}
      className={className}
    />
  )
}
