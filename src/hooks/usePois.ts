import { useCallback, useEffect, useState } from 'react'
import type { Poi } from '../types/poi'

const STORAGE_KEY = 'pesca5terre.pois.v1'

function load(): Poi[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Poi[]) : []
  } catch {
    return []
  }
}

export function usePois() {
  const [pois, setPois] = useState<Poi[]>(() => load())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pois))
  }, [pois])

  const addPoi = useCallback((poi: Omit<Poi, 'id' | 'createdAt'>) => {
    const newPoi: Poi = {
      ...poi,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    setPois((prev) => [...prev, newPoi])
    return newPoi
  }, [])

  const removePoi = useCallback((id: string) => {
    setPois((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return { pois, addPoi, removePoi }
}
