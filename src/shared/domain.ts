import { z } from 'zod'
import { LEVEL_KEYS } from './levels'

/** The fixed list of mathematical areas. Follows the core-idea areas in the national fagplan for matematik. */
export const AREAS = [
  'Tal og regnestrategier',
  'Algebra',
  'Geometri og måling',
  'Statistik og sandsynlighed',
  'Funktioner og infinitesimalregning',
] as const
export type Area = (typeof AREAS)[number]

export const DIFFICULTIES = ['Let', 'Middel', 'Svær'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
export const niveauSchema = z.enum(['A', 'B', 'C']).nullable().optional()

/** Hard limit on tasks per generation (cost and time). */
export const MAX_TASKS_PER_GENERATION = 20
/** Tasks expanded per server call, so each call stays well inside the function time limit. */
export const TASKS_PER_CHUNK = 2

export const pointSchema = z.number().int().min(0).max(20)

export const criterionSchema = z.object({
  points: z.number().int().min(1).max(10),
  description: z.string().trim().min(1).max(400),
})

export const checkSchema = z.object({
  /** Arithmetic expression that should evaluate to `value`, e.g. "8*5". Empty when the answer is not numeric. */
  expression: z.string().max(200),
  value: z.number().nullable(),
  unit: z.string().max(20),
})

export const partSchema = z.object({
  question: z.string().trim().min(1).max(1200),
  answer: z.string().trim().min(1).max(600),
  solution: z.string().trim().min(1).max(2000),
  points: z.number().int().min(1).max(10),
  criteria: z.array(criterionSchema).min(1).max(6),
  check: checkSchema,
})

export const shapeSchema = z.object({
  kind: z.enum(['polygon', 'circle', 'segment', 'function', 'point']),
  /** For kind "function": the expression in x, e.g. "0,5x^2-2x+1" or "3*1,2^x". */
  expression: z.string().max(200).optional(),
  points: z.array(z.tuple([z.number(), z.number()])).max(12),
  radius: z.number().min(0).max(100),
  sideLabels: z.array(z.string().max(30)).max(12),
  rightAngles: z.array(z.number().int().min(0).max(11)).max(12),
  dashed: z.boolean(),
  label: z.string().max(40),
})

/** A coordinate system: when present the figure is drawn as a graph with axes and ticks. */
export const axesSchema = z.object({
  xMin: z.number(),
  xMax: z.number(),
  yMin: z.number(),
  yMax: z.number(),
  xStep: z.number().positive(),
  yStep: z.number().positive(),
  xLabel: z.string().max(20),
  yLabel: z.string().max(20),
})

export const figureSchema = z.object({
  unit: z.string().max(10),
  grid: z.boolean(),
  axes: axesSchema.nullable().optional(),
  shapes: z.array(shapeSchema).min(1).max(8),
  caption: z.string().max(200),
})

export const taskContentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  intro: z.string().trim().max(2000),
  figure: figureSchema.nullable(),
  parts: z.array(partSchema).min(1).max(6),
  grade: z.number().int().min(1).max(12),
  niveau: niveauSchema,
  area: z.enum(AREAS),
  topic: z.string().trim().min(1).max(60),
  difficulty: z.enum(DIFFICULTIES),
  /** The model's estimate of minutes a typical student needs. */
  minutes: z.number().int().min(1).max(120).optional(),
})

export type Criterion = z.infer<typeof criterionSchema>
export type Check = z.infer<typeof checkSchema>
export type Part = z.infer<typeof partSchema>
export type Shape = z.infer<typeof shapeSchema>
export type Figure = z.infer<typeof figureSchema>
export type Axes = z.infer<typeof axesSchema>
export type TaskContent = z.infer<typeof taskContentSchema>

export interface Issue {
  /** 'error' blocks nothing in the UI but is sent back to the model once; 'note' is information. */
  level: 'error' | 'note'
  part?: number
  message: string
}

/** A task as stored in the bank. */
export interface Task extends TaskContent {
  id: string
  /** The teacher who saved the task. Everyone can see and use it; only the owner can change it. */
  ownerUid: string
  issues: Issue[]
  /** Per part: whether the numeric check was recomputed and agreed. */
  verified: boolean[]
  /** 'starter' = curated AImforA starter tasks. */
  source: 'ai' | 'manual' | 'starter'
  editedByTeacher: boolean
  /** How many saved sets (by any teacher) have used the task. */
  usedCount?: number
  /** Title of the task this one is a variant of. */
  variantOf?: string
  createdAt: number
  updatedAt: number
}

/** A saved set: a frozen copy of the tasks at the moment the teacher approved it. */
export interface SavedSet {
  id: string
  title: string
  createdAt: number
  tasks: Task[]
  totalPoints: number
  /** Token of the public student link (/elev/<token>), when the set is shared digitally. */
  shareToken?: string
}

export const taskPoints = (t: Pick<TaskContent, 'parts'>) => t.parts.reduce((s, p) => s + p.points, 0)

/** "Opgave 3" parts are labelled a, b, c ... A task with one part has no letter. */
export function partLabel(taskNo: number, partIndex: number, partCount: number): string {
  return partCount === 1 ? String(taskNo) : `${taskNo}${String.fromCharCode(97 + partIndex)}`
}

export function normalizeTopic(topic: string): string {
  const t = topic.trim().replace(/\s+/g, ' ')
  return t ? t[0].toLocaleUpperCase('da') + t.slice(1) : t
}

export const planRequestSchema = z.object({
  grade: z.number().int().min(1).max(12),
  niveau: niveauSchema,
  topic: z.string().trim().min(2).max(120),
  count: z.number().int().min(1).max(MAX_TASKS_PER_GENERATION),
  difficulty: z.enum(['Let', 'Middel', 'Svær', 'Blandet']),
  /** The teacher's own progression for the grade (editable in the app), sent as context. */
  progression: z.string().max(4000).default(''),
  requestId: z.string().min(8).max(80),
})
export type PlanRequest = z.infer<typeof planRequestSchema>

export const planItemSchema = z.object({
  title: z.string().min(1).max(120),
  angle: z.string().min(1).max(2500),
  difficulty: z.enum(DIFFICULTIES),
  area: z.enum(AREAS),
  topic: z.string().min(1).max(60),
  needsFigure: z.boolean(),
})
export type PlanItem = z.infer<typeof planItemSchema>

export const fitSchema = z.object({
  status: z.enum(['passer', 'for_svaert', 'for_let', 'uklart']),
  explanation: z.string().max(600),
  /** Level keys (see levels.ts), e.g. "8" or "11B". */
  suggestedLevels: z.array(z.enum(LEVEL_KEYS as [string, ...string[]])).max(9),
})
export type Fit = z.infer<typeof fitSchema>

export const planResponseSchema = z.object({
  fit: fitSchema,
  items: z.array(planItemSchema),
})
export type PlanResponse = z.infer<typeof planResponseSchema>

export const generateRequestSchema = z.object({
  grade: z.number().int().min(1).max(12),
  niveau: niveauSchema,
  topic: z.string().trim().min(2).max(120),
  items: z.array(planItemSchema).min(1).max(TASKS_PER_CHUNK),
  /** Titles of the other tasks in the same generation, so the chunk avoids repeating them. */
  siblings: z.array(z.string().max(120)).max(MAX_TASKS_PER_GENERATION).default([]),
  progression: z.string().max(4000).default(''),
  requestId: z.string().min(8).max(80),
})
export type GenerateRequest = z.infer<typeof generateRequestSchema>

export interface GeneratedTask extends TaskContent {
  issues: Issue[]
  verified: boolean[]
}

/** Minutes a typical student needs: the model's estimate, otherwise a rule of thumb from points. */
export function estMinutes(t: Pick<TaskContent, 'parts' | 'grade'> & { minutes?: number }): number {
  if (t.minutes) return t.minutes
  const perPoint = t.grade >= 10 ? 4 : t.grade >= 7 ? 3 : 2.5
  return Math.max(2, Math.round(taskPoints(t) * perPoint))
}

export interface PointRow {
  label: string
  title: string
  max: number
}

/** One row per task or sub-question, numbered as in all three PDFs. */
export function pointRows(set: Pick<SavedSet, 'tasks'>): PointRow[] {
  return set.tasks.flatMap((t, i) =>
    t.parts.map((p, j) => ({ label: partLabel(i + 1, j, t.parts.length), title: j === 0 ? t.title : '', max: p.points })),
  )
}

/** What students may see of a set: no answers, solutions, criteria or checks. */
export interface StudentTask {
  title: string
  intro: string
  figure: Figure | null
  parts: { question: string; points: number }[]
  grade: number
  niveau?: 'A' | 'B' | 'C' | null
}

export interface StudentSet {
  title: string
  ownerUid: string
  setId: string
  createdAt: number
  totalPoints: number
  minutes: number
  tasks: StudentTask[]
}

export function toStudentSet(set: SavedSet, ownerUid: string): StudentSet {
  return {
    title: set.title,
    ownerUid,
    setId: set.id,
    createdAt: Date.now(),
    totalPoints: set.tasks.reduce((s, t) => s + taskPoints(t), 0),
    minutes: set.tasks.reduce((m, t) => m + estMinutes(t), 0),
    tasks: set.tasks.map((t) => ({
      title: t.title,
      intro: t.intro,
      figure: t.figure ?? null,
      parts: t.parts.map((p) => ({ question: p.question, points: p.points })),
      grade: t.grade,
      niveau: t.niveau ?? null,
    })),
  }
}
