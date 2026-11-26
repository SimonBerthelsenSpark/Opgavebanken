import type { Task } from './domain'

/**
 * Firestore cannot store arrays inside arrays, and figure points are [x, y] pairs.
 * Points are stored as {x, y} objects and turned back into pairs when read.
 */
type Stored = Record<string, unknown>

export function encodeTask<T extends { figure: Task['figure'] }>(task: T): T {
  if (!task.figure) return task
  return {
    ...task,
    figure: {
      ...task.figure,
      shapes: task.figure.shapes.map((s) => ({ ...s, points: s.points.map(([x, y]) => ({ x, y })) })),
    },
  } as unknown as T
}

export function decodeTask<T>(stored: T): T {
  const t = stored as Stored & { figure?: { shapes?: { points?: unknown[] }[] } | null }
  if (!t.figure?.shapes) return stored
  return {
    ...t,
    figure: {
      ...t.figure,
      shapes: t.figure.shapes.map((s) => ({
        ...s,
        points: (s.points ?? []).map((p) => (Array.isArray(p) ? p : [(p as { x: number }).x, (p as { y: number }).y])),
      })),
    },
  } as T
}

/** True if a value contains an array directly inside another array (rejected by Firestore). */
export function hasNestedArray(v: unknown, inArray = false): boolean {
  if (Array.isArray(v)) return inArray || v.some((x) => hasNestedArray(x, true))
  if (v && typeof v === 'object') return Object.values(v).some((x) => hasNestedArray(x, false))
  return false
}
