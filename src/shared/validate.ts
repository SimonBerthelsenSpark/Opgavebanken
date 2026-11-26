import { agrees, answerMentions, evaluate, formatDa } from './calc'
import type { Issue, TaskContent } from './domain'
import { figureProblems } from './figure'
import { normalizeMath } from './mathtext'

const MENTIONS_FIGURE = /\b(figur(en|erne|er)?|tegning(en)?|skitse(n)?)\b/i

export interface TaskCheck {
  issues: Issue[]
  /** Per part: the numeric answer was recomputed with code and agreed with the answer. */
  verified: boolean[]
}

/**
 * Checks a single task. Runs on the server after generation and in the browser while the teacher
 * edits, so the same rules apply everywhere.
 */
export function checkTask(task: TaskContent, opts: { needsFigure?: boolean } = {}): TaskCheck {
  const issues: Issue[] = []
  const verified: boolean[] = []

  const allText = [task.intro, ...task.parts.map((p) => p.question)].join('\n')
  if (!task.figure && (opts.needsFigure || MENTIONS_FIGURE.test(allText)))
    issues.push({ level: 'error', message: 'Opgaven henviser til en figur, men der er ingen figur med.' })
  if (task.figure) for (const p of figureProblems(task.figure)) issues.push({ level: 'error', message: p })

  task.parts.forEach((part, i) => {
    let ok = false
    const critSum = part.criteria.reduce((s, c) => s + c.points, 0)
    if (critSum !== part.points)
      issues.push({
        level: 'error',
        part: i,
        message: `Delpointkriterierne giver ${critSum} point, men delspørgsmålet giver ${part.points} point.`,
      })

    const expr = part.check.expression.trim()
    if (expr) {
      try {
        const computed = evaluate(expr)
        if (part.check.value === null) {
          issues.push({ level: 'error', part: i, message: 'Regneudtrykket mangler en facit-værdi at sammenligne med.' })
        } else if (!agrees(computed, part.check.value)) {
          issues.push({
            level: 'error',
            part: i,
            message: `Efterregning af ${expr} giver ${formatDa(round(computed))}, men facit-værdien er ${formatDa(part.check.value)}.`,
          })
        } else if (!answerMentions(part.answer, part.check.value)) {
          issues.push({
            level: 'error',
            part: i,
            message: `Facit nævner ikke det efterregnede resultat ${formatDa(part.check.value)}.`,
          })
        } else {
          ok = true
        }
      } catch (e) {
        issues.push({ level: 'error', part: i, message: `Regneudtrykket "${expr}" kunne ikke beregnes: ${(e as Error).message}` })
      }
    }
    const unit = normalizeMath(part.check.unit.trim())
    if (ok && unit && !normalizeMath(part.answer).replace(/\s/g, '').includes(unit.replace(/\s/g, ''))) {
      ok = false
      issues.push({ level: 'error', part: i, message: `Facit mangler enheden ${unit}.` })
    }
    verified.push(ok)
  })
  return { issues, verified }
}

/** Checks across a batch: count and duplicate titles. */
export function checkBatch(tasks: TaskContent[], expected: number): Issue[] {
  const issues: Issue[] = []
  if (tasks.length !== expected)
    issues.push({ level: 'error', message: `Der kom ${tasks.length} opgaver, men der blev bedt om ${expected}.` })
  const seen = new Set<string>()
  for (const t of tasks) {
    const key = t.title.trim().toLowerCase()
    if (seen.has(key)) issues.push({ level: 'error', message: `Titlen "${t.title}" går igen.` })
    seen.add(key)
  }
  return issues
}

const round = (n: number) => Math.round(n * 1e4) / 1e4
