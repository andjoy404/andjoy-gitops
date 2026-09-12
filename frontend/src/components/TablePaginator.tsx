import styles from '../styles/table-paginator.module.css'

const PAGE_SIZE_ALL = -1

export interface TablePaginatorProps {
  /** 1-based current page (already clamped to totalPages). */
  current: number
  /** Total pages — -1 means all data visible, no pagination. */
  totalPages: number
  pageSize?: number
  pageSizes?: number[]
  /** When true, adds an "All" option that disables pagination. */
  showAllOption?: boolean
  /** localStorage key used to persist the chosen page size, if provided. */
  pageSizeKey?: string
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  className?: string
}

export function TablePaginator({
  current,
  totalPages,
  pageSize,
  pageSizes,
  showAllOption,
  pageSizeKey,
  onPageChange,
  onPageSizeChange,
  className,
}: TablePaginatorProps) {
  const isUnlimited = pageSize === PAGE_SIZE_ALL
  const safePage = isUnlimited ? 1 : Math.min(current, Math.max(totalPages, 1))
  const last = isUnlimited ? 1 : Math.max(totalPages, 1)
  const options = pageSizes ?? [10, 20, 30, 40, 50]
  const effectiveSizes = showAllOption
    ? [PAGE_SIZE_ALL, ...options]
    : options.map(s => Math.max(s, 1))

  return (
    <div className={[styles.pagination, className].filter(Boolean).join(' ')}>
      {pageSize !== undefined && onPageSizeChange && (
        <span className={styles.rowsLabel}>Rows per page</span>
      )}
      {pageSize !== undefined && onPageSizeChange && (
        <select
          value={pageSize}
          onChange={(e) => {
            const size = Number(e.target.value)
            if (pageSizeKey) {
              try { localStorage.setItem(pageSizeKey, String(size)) } catch { /* ignore */ }
            }
            onPageSizeChange(size)
          }}
          className={styles.pageSizeSelect}
          aria-label="Rows per page"
        >
          {effectiveSizes.map((s) => (
            <option key={s === PAGE_SIZE_ALL ? 'all' : s} value={s}>
              {s === PAGE_SIZE_ALL ? 'All' : s}
            </option>
          ))}
        </select>
      )}
      {!isUnlimited && (
        <span className={styles.pageInfo}>
          Page {safePage} of {last}
        </span>
      )}
      {!isUnlimited && (
        <div className={styles.pageButtons}>
          <button disabled={safePage <= 1} onClick={() => onPageChange(1)} aria-label="First page">«</button>
          <button disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} aria-label="Previous page">‹</button>
          <button disabled={safePage >= last} onClick={() => onPageChange(safePage + 1)} aria-label="Next page">›</button>
          <button disabled={safePage >= last} onClick={() => onPageChange(last)} aria-label="Last page">»</button>
        </div>
      )}
    </div>
  )
}

export default TablePaginator
