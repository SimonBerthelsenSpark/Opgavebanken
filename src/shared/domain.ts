import { z } from 'zod'

/** The fixed list of mathematical areas. Follows the core-idea areas in the national fagplan for matematik. */
export const AREAS = [
  'Tal og regnestrategier',
  'Algebra',
  'Geometri og måling',
  'Statistik og sandsynlighed',
] as const
export type Area = (typeof AREAS)[number]

export const DIFFICULTIES = ['Let', 'Middel', 'Svær'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

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
  kind: z.enum(['polygon', 'circle', 'segment']),
  points: z.array(z.tuple([z.number(), z.number()])).max(12),
  radius: z.number().min(0).max(100),
  sideLabels: z.array(z.string().max(30)).max(12),
  rightAngles: z.array(z.number().int().min(0).max(11)).max(12),
  dashed: z.boolean(),
  label: z.string().max(40),
})

export const figureSchema = z.object({
  unit: z.string().max(10),
  grid: z.boolean(),
  shapes: z.array(shapeSchema).min(1).max(8),
  caption: z.string().max(200),
})

export const taskContentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  intro: z.string().trim().max(2000),
  figure: figureSchema.nullable(),
  parts: z.array(partSchema).min(1).max(6),
  grade: z.number().int().min(1).max(9),
  area: z.enum(AREAS),
  topic: z.string().trim().min(1).max(60),
  difficulty: z.enum(DIFFICULTIES),
})

export type Criterion = z.infer<typeof criterionSchema>
export type Check = z.infer<typeof checkSchema>
export type Part = z.infer<typeof partSchema>
export type Shape = z.infer<typeof shapeSchema>
export type Figure = z.infer<typeof figureSchema>
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
  source: 'ai' | 'manual'
  editedByTeacher: boolean
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
  grade: z.number().int().min(1).max(9),
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
  angle: z.string().min(1).max(400),
  difficulty: z.enum(DIFFICULTIES),
  area: z.enum(AREAS),
  topic: z.string().min(1).max(60),
  needsFigure: z.boolean(),
})
export type PlanItem = z.infer<typeof planItemSchema>

export const fitSchema = z.object({
  status: z.enum(['passer', 'for_svaert', 'for_let', 'uklart']),
  explanation: z.string().max(600),
  suggestedGrades: z.array(z.number().int().min(1).max(9)).max(9),
})
export type Fit = z.infer<typeof fitSchema>

export const planResponseSchema = z.object({
  fit: fitSchema,
  items: z.array(planItemSchema),
})
export type PlanResponse = z.infer<typeof planResponseSchema>

export const generateRequestSchema = z.object({
  grade: z.number().int().min(1).max(9),
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
