import styles from '../styles/table-paginator.module.css'

export interface TablePaginatorProps {
  /** 1-based current page (already clamped to totalPages). */
  current: number
  totalPages: number
  pageSize?: number
  pageSizes?: number[]
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
  pageSizeKey,
  onPageChange,
  onPageSizeChange,
  className,
}: TablePaginatorProps) {
  const safePage = Math.min(current, Math.max(totalPages, 1))
  const last = Math.max(totalPages, 1)
  const sizes = pageSizes ?? [10, 20, 30, 40, 50]

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
          {sizes.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      )}
      <span className={styles.pageInfo}>
        Page {safePage} of {last}
      </span>
      <div className={styles.pageButtons}>
        <button disabled={safePage <= 1} onClick={() => onPageChange(1)} aria-label="First page">«</button>
        <button disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} aria-label="Previous page">‹</button>
        <button disabled={safePage >= last} onClick={() => onPageChange(safePage + 1)} aria-label="Next page">›</button>
        <button disabled={safePage >= last} onClick={() => onPageChange(last)} aria-label="Last page">»</button>
      </div>
    </div>
  )
}

export default TablePaginator
