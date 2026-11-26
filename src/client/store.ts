import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { type SavedSet, type Task, type TaskContent, taskPoints } from '../shared/domain'
import { DEFAULT_PROGRESSION, type Progression } from '../shared/progression'
import { checkTask } from '../shared/validate'
import { decodeTask, encodeTask } from '../shared/codec'
import { db } from './firebase'

/** Firestore rejects `undefined`; a JSON round trip removes it. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** The shared bank: every logged-in teacher sees every task. */
const tasksCol = () => collection(db, 'tasks')
/** Where version 1 kept each teacher's private bank (moved to the shared bank on login). */
const oldTasksCol = (uid: string) => collection(db, 'users', uid, 'tasks')
const setsCol = (uid: string) => collection(db, 'users', uid, 'sets')

export function useTasks(_uid: string) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(
    () =>
      onSnapshot(
        query(tasksCol(), orderBy('createdAt', 'desc')),
        (snap) => setTasks(snap.docs.map((d) => decodeTask({ ...(d.data() as Task), id: d.id }))),
        (e) => setError(e.message),
      ),
    [],
  )
  return { tasks, error }
}

export async function saveNewTasks(
  uid: string,
  items: (TaskContent & { editedByTeacher?: boolean })[],
): Promise<void> {
  const batch = writeBatch(db)
  const now = Date.now()
  items.forEach((t, i) => {
    const { issues, verified } = checkTask(t)
    const ref = doc(tasksCol())
    const { editedByTeacher, ...content } = t as TaskContent & { editedByTeacher?: boolean; id?: string }
    delete (content as { id?: string }).id
    batch.set(
      ref,
      clean({
        ...encodeTask(content),
        ownerUid: uid,
        issues,
        verified,
        source: 'ai',
        editedByTeacher: Boolean(editedByTeacher),
        createdAt: now + (items.length - i), // keep generation order in the newest-first list
        updatedAt: now,
      }),
    )
  })
  await batch.commit()
}

export async function updateTask(uid: string, task: Task): Promise<void> {
  const { id, ...rest } = task
  const { issues, verified } = checkTask(rest)
  await updateDoc(doc(tasksCol(), id), clean({ ...encodeTask(rest), issues, verified, editedByTeacher: true, updatedAt: Date.now() }))
}

export const deleteTask = (_uid: string, id: string) => deleteDoc(doc(tasksCol(), id))

/** Saves a frozen copy of the tasks; later edits in the bank do not change it. */
export async function saveSet(uid: string, title: string, tasks: Task[]): Promise<string> {
  const ref = await addDoc(
    setsCol(uid),
    clean({ title, createdAt: Date.now(), tasks: tasks.map(encodeTask), totalPoints: tasks.reduce((s, t) => s + taskPoints(t), 0) }),
  )
  // the admin overview shows how many sets a teacher has, without reading the private sets
  await setDoc(profileDoc(uid), { setCount: increment(1) }, { merge: true }).catch(() => undefined)
  return ref.id
}

export function useSets(uid: string) {
  const [sets, setSets] = useState<SavedSet[] | null>(null)
  useEffect(
    () =>
      onSnapshot(query(setsCol(uid), orderBy('createdAt', 'desc')), (snap) =>
        setSets(snap.docs.map((d) => { const v = d.data() as SavedSet; return { ...v, id: d.id, tasks: v.tasks.map(decodeTask) } })),
      ),
    [uid],
  )
  return sets
}

export async function loadSet(uid: string, id: string): Promise<SavedSet | null> {
  const snap = await getDoc(doc(setsCol(uid), id))
  if (!snap.exists()) return null
  const v = snap.data() as SavedSet
  return { ...v, id: snap.id, tasks: v.tasks.map(decodeTask) }
}

export const renameSet = (uid: string, id: string, title: string) => updateDoc(doc(setsCol(uid), id), { title })
export async function deleteSet(uid: string, id: string) {
  await deleteDoc(doc(setsCol(uid), id))
  await setDoc(profileDoc(uid), { setCount: increment(-1) }, { merge: true }).catch(() => undefined)
}

const progressionDoc = (uid: string) => doc(db, 'users', uid, 'meta', 'progression')

export function useProgression(uid: string) {
  const [progression, setProgression] = useState<Progression>(DEFAULT_PROGRESSION)
  const [custom, setCustom] = useState(false)
  useEffect(
    () =>
      onSnapshot(progressionDoc(uid), (snap) => {
        const data = snap.data() as { grades?: Progression } | undefined
        if (data?.grades) {
          setProgression({ ...DEFAULT_PROGRESSION, ...data.grades })
          setCustom(true)
        } else {
          setProgression(DEFAULT_PROGRESSION)
          setCustom(false)
        }
      }),
    [uid],
  )
  return { progression, custom }
}

export const saveProgression = (uid: string, grades: Progression) =>
  setDoc(progressionDoc(uid), { grades, updatedAt: Date.now() })
export const resetProgression = (uid: string) => deleteDoc(progressionDoc(uid))

/** Moves tasks from the old private bank (users/{uid}/tasks) into the shared bank, once. */
export async function migratePrivateTasks(uid: string): Promise<number> {
  const old = await getDocs(oldTasksCol(uid))
  if (old.empty) return 0
  const batch = writeBatch(db)
  for (const d of old.docs) {
    batch.set(doc(tasksCol(), d.id), { ...d.data(), ownerUid: uid })
    batch.delete(d.ref)
  }
  await batch.commit()
  return old.size
}

// ---- profiles and logins (for the admin overview)

export interface Profile {
  uid: string
  email: string | null
  name: string | null
  provider: string
  emailVerified: boolean
  createdAt: number
  lastLoginAt: number
  loginCount: number
  setCount?: number
}

export interface LoginEntry {
  id: string
  uid: string
  email: string | null
  at: number
  device: string
}

const profileDoc = (uid: string) => doc(db, 'profiles', uid)

function device(): string {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} på ${os}` : browser
}

/** Records a login once per browser session: updates the profile and adds a login entry. */
export async function recordLogin(user: {
  uid: string
  email: string | null
  displayName: string | null
  emailVerified: boolean
  providerData: { providerId: string }[]
  metadata: { creationTime?: string }
}): Promise<void> {
  const flag = `ob.login.${user.uid}`
  if (sessionStorage.getItem(flag)) return
  const now = Date.now()
  await setDoc(
    profileDoc(user.uid),
    {
      uid: user.uid,
      email: user.email,
      name: user.displayName,
      provider: user.providerData[0]?.providerId ?? 'password',
      emailVerified: user.emailVerified,
      createdAt: user.metadata.creationTime ? Date.parse(user.metadata.creationTime) : now,
      lastLoginAt: now,
      loginCount: increment(1),
    },
    { merge: true },
  )
  await addDoc(collection(db, 'logins'), { uid: user.uid, email: user.email, at: now, device: device() })
  // only after both writes succeeded, so a refused write is retried on the next page load
  sessionStorage.setItem(flag, '1')
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'profiles'),
        (snap) => setProfiles(snap.docs.map((d) => d.data() as Profile)),
        (e) => setError(e.message),
      ),
    [],
  )
  return { profiles, error }
}

export function useLogins(max = 100) {
  const [logins, setLogins] = useState<LoginEntry[] | null>(null)
  useEffect(
    () =>
      onSnapshot(query(collection(db, 'logins'), orderBy('at', 'desc'), limit(max)), (snap) =>
        setLogins(snap.docs.map((d) => ({ ...(d.data() as Omit<LoginEntry, 'id'>), id: d.id }))),
      ),
    [max],
  )
  return logins
}
