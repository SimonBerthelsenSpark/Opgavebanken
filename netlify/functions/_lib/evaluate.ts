import {
  type GeneratedTask,
  type GenerateRequest,
  normalizeTopic,
  taskContentSchema,
} from '../../../src/shared/domain'
import { checkBatch, checkTask } from '../../../src/shared/validate'

export interface Evaluated {
  tasks: (GeneratedTask | null)[]
  problems: string[]
}

/** Coerce, validate with Zod and run the content checks (calculations, figures, points). */
export function evaluateOutput(raw: unknown, input: GenerateRequest): Evaluated {
  const list = Array.isArray((raw as any)?.tasks) ? ((raw as any).tasks as any[]) : []
  const problems: string[] = []
  const tasks = input.items.map((item, i) => {
    const t = list[i]
    if (!t) {
      problems.push(`Opgave ${i + 1} ("${item.title}") mangler.`)
      return null
    }
    const candidate = {
      ...t,
      grade: input.grade,
      topic: normalizeTopic(String(t.topic ?? item.topic)),
      figure: t.figure
        ? {
            ...t.figure,
            shapes: (t.figure.shapes ?? []).map((s: any) => ({
              ...s,
              points: (s.points ?? []).map((p: number[]) => [Number(p?.[0]) || 0, Number(p?.[1]) || 0]),
            })),
          }
        : null,
    }
    const parsed = taskContentSchema.safeParse(candidate)
    if (!parsed.success) {
      const why = parsed.error.issues
        .slice(0, 4)
        .map((iss) => `${iss.path.join('.')}: ${iss.message}`)
        .join('; ')
      problems.push(`Opgave ${i + 1}: ugyldige felter (${why}).`)
      return null
    }
    const { issues, verified } = checkTask(parsed.data, { needsFigure: item.needsFigure })
    for (const iss of issues)
      if (iss.level === 'error')
        problems.push(`Opgave ${i + 1}${iss.part !== undefined ? `, delspørgsmål ${iss.part + 1}` : ''}: ${iss.message}`)
    return { ...parsed.data, issues, verified }
  })
  const present = tasks.filter((t): t is GeneratedTask => t !== null)
  for (const iss of checkBatch(present, present.length)) problems.push(iss.message)
  return { tasks, problems }
}

