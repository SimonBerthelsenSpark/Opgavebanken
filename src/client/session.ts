import { useEffect, useState } from 'react'

/** State kept in sessionStorage, so it survives navigation and reloads within the tab. */
export function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readSession(key, initial))
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full or blocked: keep in memory */
    }
  }, [key, value])
  return [value, setValue] as const
}

export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  selection: 'ob.selection',
  filters: 'ob.filters',
  draft: 'ob.setDraft',
  generated: 'ob.generated',
}

export interface SetDraft {
  title: string
  taskIds: string[]
  origin: 'manual' | 'random' | 'quick' | 'variant'
  titleTouched?: boolean
  /** Shown above the preview, e.g. how a quick set was put together. */
  note?: string
}
