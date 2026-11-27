/**
 * Levels a task can be written for: folkeskolens 1.–9. klasse and the gymnasium (stx) years with
 * Matematik C, B and A. A level is stored on a task as grade (1–12, where 10–12 are 1.g–3.g) plus
 * niveau ('A' | 'B' | 'C' in the gymnasium, null in folkeskolen).
 */
export type Niveau = 'A' | 'B' | 'C'

export interface Level {
  key: string
  grade: number
  niveau: Niveau | null
  label: string
  short: string
  school: 'folkeskole' | 'gymnasium'
}

const folke: Level[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => ({
  key: String(g),
  grade: g,
  niveau: null,
  label: `${g}. klasse`,
  short: `${g}. kl.`,
  school: 'folkeskole',
}))

const gym = (year: 1 | 2 | 3, niveau: Niveau): Level => ({
  key: `${year + 9}${niveau}`,
  grade: year + 9,
  niveau,
  label: `${year}.g – Matematik ${niveau}`,
  short: `${year}.g ${niveau}`,
  school: 'gymnasium',
})

export const LEVELS: Level[] = [...folke, gym(1, 'C'), gym(1, 'B'), gym(2, 'B'), gym(1, 'A'), gym(2, 'A'), gym(3, 'A')]
export const LEVEL_KEYS = LEVELS.map((l) => l.key)

export const levelKey = (t: { grade: number; niveau?: Niveau | null }) => `${t.grade}${t.niveau ?? ''}`

export function levelOf(key: string): Level {
  return LEVELS.find((l) => l.key === key) ?? LEVELS[4]
}

export function levelLabel(t: { grade: number; niveau?: Niveau | null }, short = false): string {
  const l = LEVELS.find((x) => x.key === levelKey(t))
  if (l) return short ? l.short : l.label
  return t.grade > 9 ? `${t.grade - 9}.g` : short ? `${t.grade}. kl.` : `${t.grade}. klasse`
}

/** The level before and after in the same track (same school, same niveau in the gymnasium). */
export function neighbours(key: string): Level[] {
  const l = levelOf(key)
  return LEVELS.filter(
    (x) => x.school === l.school && x.niveau === l.niveau && Math.abs(x.grade - l.grade) === 1,
  )
}
