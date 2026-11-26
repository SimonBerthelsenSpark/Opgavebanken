import type { Config } from '@netlify/functions'
import { type GeneratedTask, type GenerateRequest, generateRequestSchema } from '../../src/shared/domain'
import { evaluateOutput } from './_lib/evaluate'
import { requireUser } from './_lib/auth'
import { bump, guard, usageKey } from './_lib/guard'
import { handler, streamJson } from './_lib/http'
import { type Msg, structuredCall } from './_lib/openai'
import { repairPrompt, tasksPrompt } from './_lib/prompts'
import { tasksJsonSchema } from './_lib/schemas'

const BUDGET_MS = Number(process.env.FUNCTION_BUDGET_MS ?? 55_000)

/** Step 2: write a chunk of planned ideas as full tasks, check them, and repair once if needed. */
export default handler(async (req, body) => {
  const started = Date.now()
  const user = await requireUser(req)
  const input = generateRequestSchema.parse(body)
  await guard(user.uid, `gen-${input.requestId}`)
  return streamJson(() => write(input, user.uid, started))
})

async function write(input: GenerateRequest, uid: string, started: number) {
  const { system, user: userMsg } = tasksPrompt(input)
  const messages: Msg[] = [
    { role: 'system', content: system },
    { role: 'user', content: userMsg },
  ]
  const first = await structuredCall<unknown>({ name: 'tasks', schema: tasksJsonSchema, messages, timeoutMs: BUDGET_MS - 2000 })
  let result = evaluateOutput(first, input)
  let repaired = false

  const remaining = BUDGET_MS - (Date.now() - started)
  if (result.problems.length && remaining > 20_000) {
    try {
      const second = await structuredCall<unknown>({
        name: 'tasks',
        schema: tasksJsonSchema,
        messages: [
          ...messages,
          { role: 'assistant', content: JSON.stringify(first) },
          { role: 'user', content: repairPrompt(result.problems.join('\n')) },
        ],
        timeoutMs: remaining - 1500,
      })
      const retry = evaluateOutput(second, input)
      // keep the better version of each task
      const tasks = result.tasks.map((t, i) => {
        const r = retry.tasks[i]
        if (!r) return t
        if (!t) return r
        const errs = (x: GeneratedTask) => x.issues.filter((s) => s.level === 'error').length
        return errs(r) <= errs(t) ? r : t
      })
      result = { tasks, problems: retry.problems }
      repaired = true
    } catch (e) {
      console.warn('Repair call failed; returning first result with flags', e)
    }
  }

  const tasks = result.tasks.filter((t): t is GeneratedTask => t !== null)
  const notices: string[] = []
  if (tasks.length < input.items.length)
    notices.push(`${input.items.length - tasks.length} af ${input.items.length} opgaver kunne ikke laves korrekt og er udeladt.`)
  if (tasks.length) await bump(usageKey(uid), 'tasks', tasks.length).catch(() => undefined)
  return { tasks, notices, repaired }
}

export const config: Config = { path: '/api/generate' }
