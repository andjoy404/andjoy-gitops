import { useEffect } from 'react'
import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import styles from '../styles/toast.module.css'

export interface ToastNotice {
  id: number
  type: 'success' | 'error'
  message: string
}

interface ToastProps {
  notice: ToastNotice | null
  timeout?: number
  onDismiss: () => void
}

/*
 * Mild, theme-aware toast. Fixed position (no layout shift), auto-dismisses,
 * and holds a single message at a time so repeated submissions replace the
 * notice instead of stacking duplicates.
 */
export default function Toast({ notice, timeout = 2600, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(onDismiss, timeout)
    return () => clearTimeout(timer)
  }, [notice, timeout, onDismiss])

  if (!notice) return null

  const isSuccess = notice.type === 'success'

  return (
    <div
      key={notice.id}
      className={`${styles.toast} ${isSuccess ? styles.success : styles.error}`}
      role={isSuccess ? 'status' : 'alert'}
      aria-live={isSuccess ? 'polite' : 'assertive'}
    >
      {isSuccess ? (
        <CheckCircleFilled className={styles.icon} />
      ) : (
        <CloseCircleFilled className={styles.icon} />
      )}
      <span>{notice.message}</span>
    </div>
  )
}
