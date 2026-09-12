import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'

const APP_CONFIG_KEY = ['app-config']

/**
 * Fetches page-size settings from /api/config.
 * This endpoint is already `.permitAll()` in SecurityConfig.
 */
export function useAppConfig() {
  return useQuery({
    queryKey: APP_CONFIG_KEY,
    queryFn: () => api.get<{ page_size_options?: number[]; default_page_size?: number; show_all_option?: boolean }>('/api/config'),
    staleTime: 300_000,
  })
}

export function usePageSizeOptions(): number[] {
  const { data } = useAppConfig()
  return data?.page_size_options || [10, 20, 50, 100]
}

export function useDefaultPageSize(): number {
  const { data } = useAppConfig()
  return data?.default_page_size ?? 10
}

export function useShowAllOption(): boolean {
  const { data } = useAppConfig()
  return data?.show_all_option ?? true
}

/** Calculate effective total pages from result count and current pageSize.
 * When pageSize is negative (All mode) total pages is 1 (no pagination). */
export function calcTotalPages(totalCount: number, pageSize: number): number {
  if (pageSize <= 0) return 1
  return Math.max(1, Math.ceil(totalCount / pageSize))
}
