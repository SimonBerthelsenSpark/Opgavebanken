import { type Difficulty, DIFFICULTIES, type GeneratedTask, type PlanItem, TASKS_PER_CHUNK, type TaskContent } from '../shared/domain'
import { levelOf } from '../shared/levels'
import { plainMath } from '../shared/mathtext'
import { type Progression, progressionContext } from '../shared/progression'
import { generateChunk, newRequestId, planTasks } from './api'

/**
 * Generation without the step-by-step preview: used by "Hurtigt sæt", variants and the admin's
 * starter sets. Plans N ideas, writes them in parallel chunks and retries missing ones one by one.
 */
export async function generateTasks(opts: {
  levelKey: string
  topic: string
  count: number
  difficulty: Difficulty | 'Blandet'
  progression: Progression
  onProgress?: (done: number, total: number) => void
}): Promise<GeneratedTask[]> {
  const level = levelOf(opts.levelKey)
  const context = progressionContext(opts.progression, level.key)
  const plan = await planTasks({
    grade: level.grade,
    niveau: level.niveau,
    topic: opts.topic,
    count: opts.count,
    difficulty: opts.difficulty,
    progression: context,
    requestId: newRequestId(),
  })
  const written = await writeItems(plan.items, level.key, opts.topic, context, opts.onProgress)
  return written.filter((t): t is GeneratedTask => t !== null)
}

async function writeItems(
  items: PlanItem[],
  levelKey: string,
  topic: string,
  context: string,
  onProgress?: (done: number, total: number) => void,
): Promise<(GeneratedTask | null)[]> {
  const level = levelOf(levelKey)
  const result: (GeneratedTask | null)[] = items.map(() => null)
  let done = 0
  const run = async (indexes: number[], size: number) => {
    const chunks: number[][] = []
    for (let i = 0; i < indexes.length; i += size) chunks.push(indexes.slice(i, i + size))
    const base = newRequestId()
    await Promise.all(
      chunks.map(async (idx, c) => {
        try {
          const res = await generateChunk({
            grade: level.grade,
            niveau: level.niveau,
            topic,
            items: idx.map((i) => items[i]),
            siblings: items.filter((_, i) => !idx.includes(i)).map((it) => it.title),
            progression: context,
            requestId: `${base}-${c}`,
          })
          idx.forEach((slot, k) => {
            if (res.tasks[k]) {
              result[slot] = res.tasks[k]
              onProgress?.(++done, items.length)
            }
          })
        } catch {
          /* retried below */
        }
      }),
    )
  }
  await run(
    items.map((_, i) => i),
    TASKS_PER_CHUNK,
  )
  const missing = result.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0)
  if (missing.length) await run(missing, 1)
  return result
}

const shift = (d: Difficulty, by: -1 | 0 | 1): Difficulty =>
  DIFFICULTIES[Math.max(0, Math.min(2, DIFFICULTIES.indexOf(d) + by))]

/** New tasks like the given ones: same mathematics, new situation and numbers; optionally easier/harder. */
export async function generateVariants(
  tasks: (TaskContent & { title: string })[],
  by: -1 | 0 | 1,
  progression: Progression,
  onProgress?: (done: number, total: number) => void,
): Promise<(GeneratedTask & { variantOf: string })[]> {
  // group by level so each call has one level
  const out: (GeneratedTask & { variantOf: string })[] = []
  const groups = new Map<string, (TaskContent & { title: string })[]>()
  for (const t of tasks) {
    const key = `${t.grade}${t.niveau ?? ''}`
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  let done = 0
  for (const [key, group] of groups) {
    const items: PlanItem[] = group.map((t) => {
      const target = shift(t.difficulty, by)
      const how =
        by === 0
          ? 'samme sværhedsgrad'
          : by < 0
            ? 'lettere: færre trin, enklere tal og mere stilladsering'
            : 'sværere: flere trin, mindre hjælp i teksten og mere ræsonnement'
      const original = plainMath([t.intro, ...t.parts.map((p, i) => `${i + 1}) ${p.question}`)].join(' ')).slice(0, 1800)
      return {
        title: `${t.title}${by === 0 ? ' (variant)' : by < 0 ? ' (let)' : ' (svær)'}`.slice(0, 120),
        angle: `Variant af en eksisterende opgave: samme matematiske indhold og samme opgavetype, men ny situation og nye tal, ${how}. Originalen lød: ${original}`,
        difficulty: target,
        area: t.area,
        topic: t.topic,
        needsFigure: Boolean(t.figure),
      }
    })
    const level = levelOf(key)
    const written = await writeItems(items, level.key, group[0].topic, '', (d) => onProgress?.(done + d, tasks.length))
    written.forEach((w, i) => {
      if (!w) return
      done++
      out.push({ ...w, variantOf: group[i].title })
    })
  }
  return out
}
