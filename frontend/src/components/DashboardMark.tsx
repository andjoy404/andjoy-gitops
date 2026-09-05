import type { CSSProperties } from 'react'

/**
 * Dashboard logo: a rising bar chart overlaid with a clock, representing
 * pipeline history + elapsed time. Bars follow currentColor (menu/text color);
 * the clock uses the accent palette so it stands out in both themes.
 */
export default function DashboardMark({
  style,
  className,
}: {
  style?: CSSProperties
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      role="img"
      aria-hidden
      className={className}
      style={{ display: 'inline-block', width: '1em', height: '1em', ...style }}
    >
      {/* Three bars, increasing height left → right */}
      <rect x="2" y="19" width="5" height="7" rx="0.5" fill="currentColor" />
      <rect x="8" y="14" width="5" height="12" rx="0.5" fill="currentColor" />
      <rect x="14" y="8" width="5" height="18" rx="0.5" fill="currentColor" />

      {/* Trend line rising from the bars to the upper-right */}
      <path
        d="M17 11 L25 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22 3.5 L25 3.5 L25 6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Clock (bottom-right, slightly overlapping the tall bar) */}
      <circle
        cx="21"
        cy="21"
        r="6.5"
        fill="var(--dashboard-accent-soft)"
        stroke="var(--dashboard-accent)"
        strokeWidth="1.5"
      />
      <path d="M21 21 L18.5 18.5" stroke="var(--dashboard-accent)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M21 21 L24 19.5" stroke="var(--dashboard-accent)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
