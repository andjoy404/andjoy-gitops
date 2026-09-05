import { createContext, useContext } from 'react'

interface GroupContextValue {
  selectedGroupId: number | undefined
  setSelectedGroupId: (id: number) => void
  /** Id of the environment the current group belongs to (set by Shell). */
  selectedEnvId?: number
  /** namespace_id of the active environment — used to scope the group list. */
  envNamespaceId?: number
  /** Switch the active environment live (set by Shell). */
  selectEnvironment?: (id: number) => void
  /** Base URL of the selected GitLab environment (from DB). */
  selectedEnvBaseUrl?: string
}

export const GroupContext = createContext<GroupContextValue>({
  selectedGroupId: undefined,
  setSelectedGroupId: () => {},
})

export function useGroupContext(): GroupContextValue {
  return useContext(GroupContext)
}
