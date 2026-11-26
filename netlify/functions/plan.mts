import type { Config } from '@netlify/functions'
import { normalizeTopic, type PlanRequest, type PlanResponse, planRequestSchema, planResponseSchema } from '../../src/shared/domain'
import { requireUser } from './_lib/auth'
import { guard } from './_lib/guard'
import { handler, streamJson } from './_lib/http'
import { structuredCall } from './_lib/openai'
import { planPrompt } from './_lib/prompts'
import { planJsonSchema } from './_lib/schemas'

/** Step 1: judge whether the topic fits the grade and plan N distinct task ideas. */
export default handler(async (req, body) => {
  const user = await requireUser(req)
  const input = planRequestSchema.parse(body)
  await guard(user.uid, `plan-${input.requestId}`)
  return streamJson(() => makePlan(input))
})

async function makePlan(input: PlanRequest) {
  const { system, user: userMsg } = planPrompt(input)
  const raw = await structuredCall<PlanResponse>({
    name: 'plan',
    schema: planJsonSchema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
    timeoutMs: Number(process.env.FUNCTION_BUDGET_MS ?? 55_000) - 3000,
  })
  const plan = planResponseSchema.parse(raw)
  let items = plan.items.map((it) => ({
    ...it,
    topic: normalizeTopic(it.topic),
    difficulty: input.difficulty === 'Blandet' ? it.difficulty : input.difficulty,
  }))
  // The schema cannot pin the array length, so it is enforced here.
  if (items.length > input.count) items = items.slice(0, input.count)
  while (items.length < input.count && items.length > 0) {
    const src = items[items.length % plan.items.length]
    items.push({ ...src, title: `${src.title} (variant ${items.length + 1})`, angle: `${src.angle} Brug en anden situation og andre tal end opgaven "${src.title}".` })
  }
  if (!items.length) return { error: 'AI lavede ingen opgaveidéer. Prøv at formulere emnet anderledes.', status: 502 }
  return { fit: plan.fit, items }
}

export const config: Config = { path: '/api/plan' }
