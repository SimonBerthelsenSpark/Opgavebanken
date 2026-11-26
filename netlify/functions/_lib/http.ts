import { ZodError } from 'zod'
import { AuthError } from './auth'
import { GuardError } from './guard'
import { AiError } from './openai'

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })

/** Wraps a POST handler: method check, JSON body, and Danish error messages. */
export function handler(fn: (req: Request, body: unknown) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return json({ error: 'Kun POST er tilladt.' }, 405)
    try {
      const body = await req.json().catch(() => {
        throw new ZodError([])
      })
      return await fn(req, body)
    } catch (e) {
      if (e instanceof AuthError || e instanceof GuardError || e instanceof AiError)
        return json({ error: e.message }, e.status)
      if (e instanceof ZodError) return json({ error: 'Ugyldig forespørgsel.', details: e.issues.slice(0, 5) }, 400)
      console.error(e)
      return json({ error: 'Der skete en uventet fejl på serveren.' }, 500)
    }
  }
}
