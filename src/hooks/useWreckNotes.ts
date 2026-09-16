import { useCallback, useEffect, useState } from 'react'

// Nota personale per relitto (dato UKHO statico, non modificabile alla fonte):
// tenuta a parte, indicizzata per wreck_id, cosi' sopravvive a un
// riscaricamento di relitti_ukho.geojson.
const STORAGE_KEY = 'pesca5terre.wreckNotes.v1'

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function useWreckNotes() {
  const [notes, setNotes] = useState<Record<string, string>>(() => load())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  }, [notes])

  const setNote = useCallback((wreckId: string, note: string) => {
    setNotes((prev) => {
      if (!note.trim()) {
        const { [wreckId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [wreckId]: note.trim() }
    })
  }, [])

  return { notes, setNote }
}
