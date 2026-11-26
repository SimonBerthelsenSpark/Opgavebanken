import type { Config } from '@netlify/functions'
import { isAdminEmail, type UsageStats } from '../../src/shared/admin'
import { AuthError, requireUser } from './_lib/auth'
import { kv } from './_lib/guard'
import { json } from './_lib/http'

/** AI usage per teacher for the last 14 days (admins only). */
export default async (req: Request): Promise<Response> => {
  try {
    const user = await requireUser(req)
    if (!isAdminEmail(user.email, process.env.AUTH_EMULATOR === '1')) throw new AuthError('Kun for administratorer.', 403)
    const store = kv()
    const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10))
    const users: UsageStats['users'] = {}
    for (const day of days) {
      const keys = (await store.list?.(`usage/${day}/`)) ?? []
      for (const key of keys) {
        const uid = key.slice(`usage/${day}/`.length)
        const v = JSON.parse((await store.get(key)) ?? '{}') as { calls?: number; tasks?: number }
        ;(users[uid] ??= []).push({ day, calls: v.calls ?? 0, tasks: v.tasks ?? 0 })
      }
    }
    const stats: UsageStats = {
      days,
      users,
      dayLimit: Number(process.env.AI_CALLS_PER_DAY_TOTAL ?? 500),
      hourLimit: Number(process.env.AI_CALLS_PER_HOUR ?? 60),
    }
    return json(stats)
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: 'Statistikken kunne ikke hentes.' }, 500)
  }
}

export const config: Config = { path: '/api/admin-stats' }
