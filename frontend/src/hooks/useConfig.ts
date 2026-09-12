import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import type { GlobalConfigDTO } from '../types'

const CONFIG_KEY = ['global-config']

export function useConfig() {
  return useQuery<GlobalConfigDTO>({
    queryKey: CONFIG_KEY,
    queryFn: api.getGlobalConfig,
    staleTime: 300_000,
  })
}

export function useConfigData(): GlobalConfigDTO | undefined {
  const { data } = useConfig()
  return data
}
