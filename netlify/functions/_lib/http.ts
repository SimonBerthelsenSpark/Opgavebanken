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

/**
 * Runs slow AI work behind a streamed response. Netlify gives streamed functions a longer time limit
 * than buffered ones, and a space is sent every few seconds so nothing in between closes the
 * connection. The body ends with the JSON result; an error is sent as {"error", "status"}.
 * Leading whitespace is valid JSON, so the browser can parse the whole body as usual.
 */
export function streamJson(work: () => Promise<unknown>): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(' '))
      const beat = setInterval(() => controller.enqueue(enc.encode(' ')), 4000)
      let out: unknown
      try {
        out = await work()
      } catch (e) {
        const status = (e as { status?: number }).status ?? 500
        if (!(e as { status?: number }).status) console.error(e)
        out = { error: status === 500 ? 'Der skete en uventet fejl på serveren.' : (e as Error).message, status }
      } finally {
        clearInterval(beat)
      }
      controller.enqueue(enc.encode(JSON.stringify(out)))
      controller.close()
    },
  })
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}
