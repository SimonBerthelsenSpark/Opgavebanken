import { getStore } from '@netlify/blobs'

interface KV {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

const memory = new Map<string, string>()
const memoryKV: KV & { list: (prefix: string) => Promise<string[]> } = {
  list: async (prefix) => [...memory.keys()].filter((k) => k.startsWith(prefix)),
  get: async (k) => memory.get(k) ?? null,
  set: async (k, v) => {
    memory.set(k, v)
  },
}

export function kv(): KV & { list?: (prefix: string) => Promise<string[]> } {
  try {
    const store = getStore({ name: 'ai-guard', consistency: 'strong' })
    return {
      get: (k) => store.get(k, { type: 'text' }),
      set: async (k, v) => {
        await store.set(k, v)
      },
      list: async (prefix) => (await store.list({ prefix })).blobs.map((b) => b.key),
    }
  } catch {
    return memoryKV // outside Netlify (unit tests)
  }
}

export class GuardError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

/**
 * Stops the same request from running twice (a double click, a retried fetch) and caps how many
 * AI calls one teacher can make per hour. The browser also locks the button while a call runs.
 */
export async function guard(uid: string, requestId: string, opts: { admin?: boolean } = {}): Promise<void> {
  const store = kv()
  const reqKey = `req/${uid}/${requestId}`
  if (await store.get(reqKey)) throw new GuardError('Denne forespørgsel er allerede sendt.', 409)
  await store.set(reqKey, String(Date.now()))

  const limit = Number(process.env.AI_CALLS_PER_HOUR ?? 60)
  const hour = new Date().toISOString().slice(0, 13)
  const rateKey = `rate/${uid}/${hour}`
  const used = Number((await store.get(rateKey)) ?? 0)
  if (used >= limit && !opts.admin)
    throw new GuardError('Du har brugt timens kvote for AI-generering. Prøv igen senere.', 429)
  await store.set(rateKey, String(used + 1))

  // A ceiling for all teachers together, so the OpenAI bill cannot run away.
  const dayLimit = Number(process.env.AI_CALLS_PER_DAY_TOTAL ?? 500)
  const dayKey = `rate/all/${new Date().toISOString().slice(0, 10)}`
  const today = Number((await store.get(dayKey)) ?? 0)
  if (today >= dayLimit)
    throw new GuardError('Dagens samlede kvote for AI-generering er brugt. Prøv igen i morgen.', 429)
  await store.set(dayKey, String(today + 1))
  await bump(usageKey(uid), "calls")
}

/** Daily usage per teacher for the admin overview: {calls, tasks}. */
export async function bump(key: string, field: 'calls' | 'tasks', by = 1): Promise<void> {
  const store = kv()
  const cur = JSON.parse((await store.get(key)) ?? '{"calls":0,"tasks":0}') as Record<string, number>
  cur[field] = (cur[field] ?? 0) + by
  await store.set(key, JSON.stringify(cur))
}

export const usageKey = (uid: string) => `usage/${new Date().toISOString().slice(0, 10)}/${uid}`
