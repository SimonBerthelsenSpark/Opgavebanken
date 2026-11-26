import type { GeneratedTask, PlanItem, PlanResponse } from '../shared/domain'
import { auth } from './firebase'

export class ApiError extends Error {}

async function send(path: string, token: string, body: unknown): Promise<Response> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Ingen forbindelse til serveren.')
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const user = auth.currentUser
  if (!user) throw new ApiError('Du skal være logget ind.')
  let res = await send(path, await user.getIdToken(), body)
  if (res.status === 403) {
    // The login token is cached for up to an hour and may still say "e-mail not confirmed" after
    // the teacher clicked the link. Fetch a fresh token once and try again.
    await user.reload().catch(() => undefined)
    res = await send(path, await user.getIdToken(true), body)
  }
  // AI answers are streamed: spaces while the model works, then the JSON (or {"error"})
  const text = await res.text().catch(() => '')
  let data: { error?: string } & Record<string, unknown> = {}
  try {
    data = JSON.parse(text)
  } catch {
    if (res.ok) throw new ApiError('Forbindelsen til serveren blev afbrudt, før AI var færdig. Prøv igen.')
  }
  if (!res.ok || data.error) throw new ApiError(data.error ?? `Serverfejl (${res.status}).`)
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

export async function adminStats(): Promise<import('../shared/admin').UsageStats> {
  const user = auth.currentUser
  if (!user) throw new ApiError('Du skal være logget ind.')
  const res = await fetch('/api/admin-stats', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? `Serverfejl (${res.status}).`)
  return data
}
