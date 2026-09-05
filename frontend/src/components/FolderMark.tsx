import type { CSSProperties } from 'react'

/**
 * Group mark: a folder silhouette (top tab + body). Monochrome via
 * currentColor so it matches the surrounding text/menu color in the sidebar.
 */
export default function FolderMark({
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
      <path
        fill="currentColor"
        d="M3 6.4 A1.4 1.4 0 0 1 4.4 5 H9 L11.2 7.4 H19.6 A1.4 1.4 0 0 1 21 8.8 V17.6 A1.4 1.4 0 0 1 19.6 19 H4.4 A1.4 1.4 0 0 1 3 17.6 Z"
      />
    </svg>
  )
}
