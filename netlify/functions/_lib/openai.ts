import { mockPlan, mockTasks } from './mock'

export interface Msg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message)
  }
}

/**
 * One call to the OpenAI Responses API with Structured Outputs (strict JSON Schema).
 * The key is read from the OPENAI_API_KEY environment variable on the server only.
 * With MOCK_AI=1 (local development and tests) a deterministic local generator answers instead.
 */
export async function structuredCall<T>(args: {
  name: 'plan' | 'tasks'
  schema: object
  messages: Msg[]
  timeoutMs: number
}): Promise<T> {
  if (process.env.MOCK_AI === '1') {
    const delay = Number(process.env.MOCK_AI_DELAY_MS ?? 0)
    if (delay) await new Promise((r) => setTimeout(r, delay))
    return (args.name === 'plan' ? mockPlan(args.messages) : mockTasks(args.messages)) as T
  }
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new AiError('OPENAI_API_KEY mangler på serveren.', 500)

  const body: Record<string, unknown> = {
    model: process.env.OPENAI_MODEL || 'gpt-5.6-terra',
    input: args.messages,
    text: { format: { type: 'json_schema', name: args.name, schema: args.schema, strict: true } },
    store: false,
  }
  const effort = process.env.OPENAI_REASONING_EFFORT ?? 'low'
  if (effort && effort !== 'none') body.reasoning = { effort }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs)
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new AiError('AI-kaldet tog for lang tid. Prøv igen med færre opgaver.', 504)
    throw new AiError('Kunne ikke kontakte OpenAI.')
  } finally {
    clearTimeout(timer)
  }
  const json = (await res.json().catch(() => null)) as any
  if (!res.ok) {
    const msg = json?.error?.message ?? res.statusText
    console.error('OpenAI error', res.status, msg)
    if (res.status === 429) throw new AiError('OpenAI har travlt eller kvoten er brugt. Prøv igen om lidt.', 429)
    throw new AiError(`OpenAI afviste kaldet (${res.status}).`)
  }
  if (json?.status === 'incomplete') throw new AiError('AI-svaret blev afbrudt. Prøv med færre opgaver.')
  for (const item of json?.output ?? []) {
    if (item.type !== 'message') continue
    for (const c of item.content ?? []) {
      if (c.type === 'refusal') throw new AiError('AI afviste at lave opgaverne.', 422)
      if (c.type === 'output_text') {
        try {
          return JSON.parse(c.text) as T
        } catch {
          throw new AiError('AI-svaret var ikke gyldig JSON.')
        }
      }
    }
  }
  throw new AiError('AI-svaret var tomt.')
}
