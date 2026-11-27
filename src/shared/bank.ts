import { DIFFICULTIES, estMinutes, type TaskContent, type TaskContent as TC } from './domain'
import { levelKey } from './levels'
import { plainMath } from './mathtext'

export interface Filters {
  grade: string // level key (levels.ts), '' = all
  area: string
  topic: string
  difficulty: string
  q: string
}

export const EMPTY_FILTERS: Filters = { grade: '', area: '', topic: '', difficulty: '', q: '' }

export const filtersActive = (f: Filters) => Object.values(f).some((v) => v !== '')

const fold = (s: string) => s.toLocaleLowerCase('da').normalize('NFC')

export function matches(t: TaskContent, f: Filters): boolean {
  if (f.grade && levelKey(t) !== f.grade) return false
  if (f.area && t.area !== f.area) return false
  if (f.topic && fold(t.topic) !== fold(f.topic)) return false
  if (f.difficulty && t.difficulty !== f.difficulty) return false
  if (f.q.trim()) {
    const hay = fold(
      plainMath([t.title, t.intro, t.topic, t.area, ...t.parts.flatMap((p) => [p.question, p.answer])].join(' ')),
    )
    for (const word of fold(f.q).split(/\s+/).filter(Boolean)) if (!hay.includes(word)) return false
  }
  return true
}

/** Draw n distinct items at random (Fisher–Yates on a copy). */
export function pickRandom<T>(items: T[], n: number, rand: () => number = Math.random): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, Math.min(n, a.length))
}


/**
 * Picks tasks for a set of about `target` minutes: well-checked and popular tasks first (with some
 * randomness so two teachers don't get identical sets), ordered from easy to hard.
 */
export function pickForDuration<T extends TC & { verified?: boolean[]; usedCount?: number; source?: string }>(
  candidates: T[],
  target: number,
  rand: () => number = Math.random,
): { picked: T[]; minutes: number } {
  const score = (t: T) =>
    (t.verified?.length && t.verified.every(Boolean) ? 2 : 0) + Math.min(3, t.usedCount ?? 0) + (t.source === 'starter' ? 1 : 0) + rand() * 2.5
  const ranked = candidates.map((t) => ({ t, s: score(t) })).sort((a, b) => b.s - a.s)
  const picked: T[] = []
  let minutes = 0
  for (const { t } of ranked) {
    const m = estMinutes(t)
    if (minutes + m > target + 3) continue
    picked.push(t)
    minutes += m
    if (minutes >= target - 3) break
  }
  picked.sort((a, b) => DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty))
  return { picked, minutes }
}
