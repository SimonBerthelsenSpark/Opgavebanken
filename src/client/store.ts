import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { db } from './firebase'

/** Firestore rejects `undefined`; a JSON round trip removes it. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

const tasksCol = (uid: string) => collection(db, 'users', uid, 'tasks')
const setsCol = (uid: string) => collection(db, 'users', uid, 'sets')

export function useTasks(uid: string) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(
    () =>
      onSnapshot(
        query(tasksCol(uid), orderBy('createdAt', 'desc')),
        (snap) => setTasks(snap.docs.map((d) => ({ ...(d.data() as Task), id: d.id }))),
        (e) => setError(e.message),
      ),
    [uid],
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
    const ref = doc(tasksCol(uid))
    const { editedByTeacher, ...content } = t as TaskContent & { editedByTeacher?: boolean; id?: string }
    delete (content as { id?: string }).id
    batch.set(
      ref,
      clean({
        ...content,
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
  await updateDoc(doc(tasksCol(uid), id), clean({ ...rest, issues, verified, editedByTeacher: true, updatedAt: Date.now() }))
}

export const deleteTask = (uid: string, id: string) => deleteDoc(doc(tasksCol(uid), id))

/** Saves a frozen copy of the tasks; later edits in the bank do not change it. */
export async function saveSet(uid: string, title: string, tasks: Task[]): Promise<string> {
  const ref = await addDoc(
    setsCol(uid),
    clean({ title, createdAt: Date.now(), tasks, totalPoints: tasks.reduce((s, t) => s + taskPoints(t), 0) }),
  )
  return ref.id
}

export function useSets(uid: string) {
  const [sets, setSets] = useState<SavedSet[] | null>(null)
  useEffect(
    () =>
      onSnapshot(query(setsCol(uid), orderBy('createdAt', 'desc')), (snap) =>
        setSets(snap.docs.map((d) => ({ ...(d.data() as SavedSet), id: d.id }))),
      ),
    [uid],
  )
  return sets
}

export async function loadSet(uid: string, id: string): Promise<SavedSet | null> {
  const snap = await getDoc(doc(setsCol(uid), id))
  return snap.exists() ? { ...(snap.data() as SavedSet), id: snap.id } : null
}

export const renameSet = (uid: string, id: string, title: string) => updateDoc(doc(setsCol(uid), id), { title })
export const deleteSet = (uid: string, id: string) => deleteDoc(doc(setsCol(uid), id))

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
