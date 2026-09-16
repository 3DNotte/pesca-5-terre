import { useCallback, useEffect, useState } from 'react'
import type { Catch } from '../types/catch'

const STORAGE_KEY = 'pesca5terre.catches.v1'

function load(): Catch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Catch[]) : []
  } catch {
    return []
  }
}

export function useCatches() {
  const [catches, setCatches] = useState<Catch[]>(() => load())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(catches))
    } catch {
      // Il quota di localStorage puo' saturarsi con molte foto: meglio
      // perdere il salvataggio silenziosamente che rompere l'app in barca.
    }
  }, [catches])

  const addCatch = useCallback((c: Omit<Catch, 'id' | 'createdAt'>) => {
    const newCatch: Catch = {
      ...c,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    setCatches((prev) => [...prev, newCatch])
    return newCatch
  }, [])

  const updateCatch = useCallback((id: string, patch: Partial<Omit<Catch, 'id' | 'createdAt'>>) => {
    setCatches((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }, [])

  const removeCatch = useCallback((id: string) => {
    setCatches((prev) => prev.filter((c) => c.id !== id))
  }, [])

  return { catches, addCatch, updateCatch, removeCatch }
}
