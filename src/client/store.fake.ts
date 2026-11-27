/**
 * In-memory stand-in for store.ts, used only by the automated browser test (`vite --mode e2e`)
 * when no Firestore emulator is available. Same exports and behaviour as store.ts, including the
 * snapshot copy for saved sets. Never part of a production build.
 */
import { useEffect, useState } from 'react'
import { type SavedSet, type Task, type TaskContent, taskPoints } from '../shared/domain'
import { DEFAULT_PROGRESSION, type Progression } from '../shared/progression'
import { checkTask } from '../shared/validate'
import { decodeTask, encodeTask, hasNestedArray } from '../shared/codec'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
/** Like Firestore: arrays directly inside arrays are rejected. */
const write = <T,>(v: T): T => {
  if (hasNestedArray(v)) throw new Error('Nested arrays are not supported (Firestore)')
  return clone(v)
}
const db = {
  profiles: new Map<string, Record<string, unknown>>(),
  logins: [] as Record<string, unknown>[],
  reports: [] as Record<string, unknown>[],
  tasks: new Map<string, Task>(),
  sets: new Map<string, SavedSet>(),
  progression: null as Progression | null,
}
const listeners = new Set<() => void>()
const emit = () => setTimeout(() => listeners.forEach((l) => l()), 0)
let seq = 0
const id = () => `id${++seq}${Math.random().toString(36).slice(2, 6)}`
;(window as unknown as { __fakeDb: typeof db }).__fakeDb = db

function useLive<T>(read: () => T): T {
  const [v, setV] = useState<T>(read)
  useEffect(() => {
    const l = () => setV(read())
    listeners.add(l)
    l()
    return () => {
      listeners.delete(l)
    }
  }, [])
  return v
}

export function useTasks(_uid: string) {
  const tasks = useLive(() => [...db.tasks.values()].map((t) => decodeTask(clone(t))).sort((a, b) => b.createdAt - a.createdAt))
  return { tasks, error: null as string | null }
}

export async function saveNewTasks(_uid: string, items: (TaskContent & { editedByTeacher?: boolean; source?: Task['source']; variantOf?: string })[]) {
  const now = Date.now()
  const ids: string[] = []
  items.forEach((t, i) => {
    const { issues, verified } = checkTask(t)
    const key = id()
    ids.push(key)
    db.tasks.set(key, write({ ...encodeTask(t as Task), ownerUid: _uid, id: key, issues, verified, source: t.source ?? 'ai', editedByTeacher: Boolean(t.editedByTeacher), createdAt: now + (items.length - i), updatedAt: now }))
  })
  emit()
  return ids
}

export async function updateTask(_uid: string, task: Task) {
  const { issues, verified } = checkTask(task)
  db.tasks.set(task.id, write({ ...encodeTask(task), issues, verified, editedByTeacher: true, updatedAt: Date.now() }))
  emit()
}

export async function deleteTask(_uid: string, key: string) {
  db.tasks.delete(key)
  emit()
}

export async function saveSet(_uid: string, title: string, tasks: Task[]) {
  const key = id()
  db.sets.set(key, write({ id: key, title, createdAt: Date.now(), tasks: tasks.map(encodeTask), totalPoints: tasks.reduce((s, t) => s + taskPoints(t), 0) }))
  bumpSets(_uid, 1)
  for (const t of tasks) {
    const stored = db.tasks.get(t.id)
    if (stored) stored.usedCount = (stored.usedCount ?? 0) + 1
  }
  emit()
  return key
}

export function useSets(_uid: string) {
  return useLive(() => [...db.sets.values()].map((x) => ({ ...clone(x), tasks: x.tasks.map((t) => decodeTask(clone(t))) })).sort((a, b) => b.createdAt - a.createdAt))
}

export async function loadSet(_uid: string, key: string) {
  const s = db.sets.get(key)
  return s ? { ...clone(s), tasks: s.tasks.map((t) => decodeTask(clone(t))) } : null
}

export async function renameSet(_uid: string, key: string, title: string) {
  const s = db.sets.get(key)
  if (s) s.title = title
  emit()
}

export async function deleteSet(_uid: string, key: string) {
  db.sets.delete(key)
  bumpSets(_uid, -1)
  emit()
}

function bumpSets(uid: string, by: number) {
  const p = db.profiles.get(uid) ?? {}
  db.profiles.set(uid, { ...p, setCount: ((p.setCount as number) ?? 0) + by })
}

export function useProgression(_uid: string) {
  const progression = useLive(() => db.progression ?? DEFAULT_PROGRESSION)
  return { progression, custom: db.progression !== null }
}

export async function saveProgression(_uid: string, grades: Progression) {
  db.progression = clone(grades)
  emit()
}

export async function resetProgression(_uid: string) {
  db.progression = null
  emit()
}

export async function migratePrivateTasks(_uid: string) {
  return 0
}

/** Test helper: a task saved by another teacher. */
;(window as unknown as { __addForeignTask: (t: Task) => void }).__addForeignTask = (t: Task) => {
  db.tasks.set(t.id, write(encodeTask(t)))
  emit()
}

export type { LoginEntry, Profile } from './store'

export async function recordLogin(user: { uid: string; email: string | null; displayName: string | null; emailVerified: boolean; providerData: { providerId: string }[] }) {
  const p = db.profiles.get(user.uid) ?? {}
  const now = Date.now()
  db.profiles.set(user.uid, { ...p, uid: user.uid, email: user.email, name: user.displayName, provider: user.providerData[0]?.providerId ?? 'password', emailVerified: user.emailVerified, createdAt: (p.createdAt as number) ?? now, lastLoginAt: now, loginCount: ((p.loginCount as number) ?? 0) + 1 })
  db.logins.unshift({ id: id(), uid: user.uid, email: user.email, at: now, device: 'Chrome på Linux' })
  emit()
}

export function useProfiles() {
  const profiles = useLive(() => [...db.profiles.values()].map(clone)) as never
  return { profiles, error: null as string | null }
}

export function useLogins(_max = 100) {
  return useLive(() => db.logins.map(clone)) as never
}

export type { Report } from './store'

export async function reportTask(user: { uid: string; email: string | null }, task: { id: string; title: string; ownerUid: string }, message: string) {
  db.reports.unshift(write({ id: id(), taskId: task.id, taskTitle: task.title, ownerUid: task.ownerUid, reporterUid: user.uid, reporterEmail: user.email, message: message.trim(), createdAt: Date.now(), status: 'open' }))
  emit()
}

export function useReports() {
  return useLive(() => db.reports.map(clone)) as never
}

export async function resolveReport(uid: string, rid: string) {
  const r = db.reports.find((x) => x.id === rid)
  if (r) Object.assign(r, { status: 'resolved', resolvedAt: Date.now(), resolvedBy: uid })
  emit()
}

export function useMyProfile(uid: string) {
  return useLive(() => (db.profiles.get(uid) ? clone(db.profiles.get(uid)) : null)) as never
}

export async function setPreferredLevel(uid: string, level: string) {
  db.profiles.set(uid, { ...(db.profiles.get(uid) ?? {}), uid, preferredLevel: level, onboarded: true })
  emit()
}
