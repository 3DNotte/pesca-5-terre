import { useCallback, useEffect, useState } from 'react'
import type { VerifiedDepth } from '../types/verifiedDepth'

const STORAGE_KEY = 'pesca5terre.verifiedDepths.v1'

function load(): VerifiedDepth[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as VerifiedDepth[]) : []
  } catch {
    return []
  }
}

export function useVerifiedDepths() {
  const [depths, setDepths] = useState<VerifiedDepth[]>(() => load())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(depths))
  }, [depths])

  const addDepth = useCallback((depth: Omit<VerifiedDepth, 'id' | 'createdAt'>) => {
    const newDepth: VerifiedDepth = {
      ...depth,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    setDepths((prev) => [...prev, newDepth])
    return newDepth
  }, [])

  const removeDepth = useCallback((id: string) => {
    setDepths((prev) => prev.filter((d) => d.id !== id))
  }, [])

  return { depths, addDepth, removeDepth }
}
