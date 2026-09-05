import type { CSSProperties } from 'react'

/**
 * Pipelines logo: a two-arrow "exchange" mark. The top arrow sweeps across the
 * top toward the left; the bottom arrow sweeps across the bottom toward the
 * right — the flow of work through a pipeline in both directions. Uses
 * currentColor so it matches the surrounding text/menu color, like the other
 * single-color nav icons.
 */
export default function PipelineExchangeMark({
  style,
  className,
}: {
  style?: CSSProperties
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-hidden
      className={className}
      style={{ display: 'inline-block', width: '1em', height: '1em', ...style }}
    >
      {/* Top arrow: arc across the top, arrowhead leading to the left */}
      <path
        d="M18.7 9.2 A 8.2 5.2 0 0 0 5.3 9.2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M4.1 10.1 L5.5 6.9 L7.7 9.9 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />

      {/* Bottom arrow: arc across the bottom, arrowhead leading to the right */}
      <path
        d="M5.3 14.8 A 8.2 5.2 0 0 0 18.7 14.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M19.9 13.9 L18.5 17.1 L16.3 14.1 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}
