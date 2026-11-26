import type { GeneratedTask, PlanItem, PlanResponse } from '../shared/domain'
import { auth } from './firebase'

export class ApiError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new ApiError('Du skal være logget ind.')
  const token = await user.getIdToken()
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Ingen forbindelse til serveren.')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? `Serverfejl (${res.status}).`)
  return data as T
}

export const newRequestId = () => crypto.randomUUID()

export function planTasks(args: {
  grade: number
  topic: string
  count: number
  difficulty: string
  progression: string
  requestId: string
}) {
  return post<PlanResponse>('/api/plan', args)
}

export function generateChunk(args: {
  grade: number
  topic: string
  items: PlanItem[]
  siblings: string[]
  progression: string
  requestId: string
}) {
  return post<{ tasks: GeneratedTask[]; notices: string[]; repaired: boolean }>('/api/generate', args)
}
