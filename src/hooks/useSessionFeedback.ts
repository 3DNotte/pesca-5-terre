import { useCallback, useEffect, useState } from 'react'
import type { SessionFeedback } from '../types/sessionFeedback'

const STORAGE_KEY = 'pesca5terre.session_feedback.v2'

function load(): SessionFeedback[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SessionFeedback[]) : []
  } catch {
    return []
  }
}

export function useSessionFeedback() {
  const [feedback, setFeedback] = useState<SessionFeedback[]>(() => load())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(feedback))
    } catch {
      // Non e' un dato critico: meglio perdere il salvataggio silenziosamente
      // che rompere l'app in barca.
    }
  }, [feedback])

  const addFeedback = useCallback((f: Omit<SessionFeedback, 'id' | 'createdAt'>) => {
    const entry: SessionFeedback = { ...f, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    setFeedback((prev) => [...prev, entry])
    return entry
  }, [])

  return { feedback, addFeedback }
}
