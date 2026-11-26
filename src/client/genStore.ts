import { useSyncExternalStore } from 'react'
import { KEYS, readSession } from './session'

/**
 * The generation preview lives outside the page component, so AI calls that are still running keep
 * their results when the teacher switches page, and every change is written to sessionStorage at
 * once (a reload keeps the preview; a saved preview is really cleared).
 */
let data: unknown
let running = false
const listeners = new Set<() => void>()
let snapshot: { data: unknown; running: boolean } | null = null

function emit() {
  snapshot = null
  for (const l of listeners) l()
}

export function createGenStore<T>(initial: T) {
  data ??= readSession<T>(KEYS.generated, initial)
  const setData = (next: T | ((prev: T) => T)) => {
    data = typeof next === 'function' ? (next as (p: T) => T)(data as T) : next
    try {
      sessionStorage.setItem(KEYS.generated, JSON.stringify(data))
    } catch {
      /* storage full: keep in memory */
    }
    emit()
  }
  const setRunning = (v: boolean) => {
    running = v
    emit()
  }
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  const get = () => (snapshot ??= { data, running })
  return function useGen() {
    const s = useSyncExternalStore(subscribe, get)
    return { state: s.data as T, setState: setData, running: s.running, setRunning }
  }
}
