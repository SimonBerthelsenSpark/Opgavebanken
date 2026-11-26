import type { TaskContent } from './domain'
import { plainMath } from './mathtext'

export interface Filters {
  grade: string // '' = all
  area: string
  topic: string
  difficulty: string
  q: string
}

export const EMPTY_FILTERS: Filters = { grade: '', area: '', topic: '', difficulty: '', q: '' }

export const filtersActive = (f: Filters) => Object.values(f).some((v) => v !== '')

const fold = (s: string) => s.toLocaleLowerCase('da').normalize('NFC')

export function matches(t: TaskContent, f: Filters): boolean {
  if (f.grade && String(t.grade) !== f.grade) return false
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
