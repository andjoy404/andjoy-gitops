import { useState, useCallback } from 'react'
import { api } from './api'

const STORAGE_KEY = 'favorite_projects'
export const FAVORITES_DIRTY_KEY = 'favorite_projects_pending_sync'

let saveQueue: Promise<void> = Promise.resolve()
let saveRevision = 0

interface FavoriteMap {
  [groupId: number]: number[]
}

function saveFavorites(updated: FavoriteMap) {
  const revision = ++saveRevision
  try { localStorage.setItem(FAVORITES_DIRTY_KEY, '1') } catch { /* ignore */ }
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => api.put<void>('/api/preferences/favorites', { favorite_projects: updated }))
    .then(() => {
      if (revision === saveRevision) {
        try { localStorage.removeItem(FAVORITES_DIRTY_KEY) } catch { /* ignore */ }
      }
    })
    .catch((error) => {
      console.error('Favorites save error:', error)
    })
}

function readStoredFavorites(): FavoriteMap {
  try {
    const item = localStorage.getItem(STORAGE_KEY)
    return item ? JSON.parse(item) : {}
  } catch {
    return {}
  }
}

function writeStoredFavorites(map: FavoriteMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function useFavorites(selectedGroupId: number) {
  const [favorites, setFavorites] = useState<FavoriteMap>(readStoredFavorites)

  const isFavorite = useCallback(
    (projectId: number) => {
      const ids = favorites[selectedGroupId]
      return ids ? ids.includes(projectId) : false
    },
    [favorites, selectedGroupId],
  )

  const toggleFavorite = useCallback(
    (projectId: number) => {
      setFavorites(prev => {
        const current = prev[selectedGroupId]
          ? [...prev[selectedGroupId]]
          : []
        if (current.includes(projectId)) {
          const next = current.filter(id => id !== projectId)
          const updated = { ...prev }
          if (next.length > 0) {
            updated[selectedGroupId] = next
          } else {
            delete updated[selectedGroupId]
          }
          writeStoredFavorites(updated)
          saveFavorites(updated)
          return updated
        } else {
          const updated = { ...prev, [selectedGroupId]: [...current, projectId] }
          writeStoredFavorites(updated)
          saveFavorites(updated)
          return updated
        }
      })
    },
    [selectedGroupId],
  )

  /** Re-fetch the server snapshot into local state and mirror it to localStorage.
     If a toggle is still saving (dirty guard set), keep the optimistic local copy. */
  const refresh = useCallback(async () => {
    try {
      if (localStorage.getItem(FAVORITES_DIRTY_KEY)) {
        const local = readStoredFavorites()
        setFavorites(local)
        return
      }
    } catch { /* ignore */ }
    const data = await api.get<{ favorite_projects?: Record<string, number[]> }>('/api/preferences')
    const record: FavoriteMap = {}
    for (const [groupId, projectIds] of Object.entries(data.favorite_projects ?? {})) {
      if (Array.isArray(projectIds)) {
        record[Number(groupId)] = projectIds.map(Number)
      }
    }
    setFavorites(record)
    writeStoredFavorites(record)
  }, [])

  return { isFavorite, toggleFavorite, favorites, refresh }
}
