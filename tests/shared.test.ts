import { describe, expect, it } from 'vitest'
import { evaluateOutput } from '../netlify/functions/_lib/evaluate'
import { mockPlan, mockTasks } from '../netlify/functions/_lib/mock'
import { agrees, answerMentions, evaluate } from '../src/shared/calc'
import type { TaskContent } from '../src/shared/domain'
import { figureProblems, layoutFigure, parseLength } from '../src/shared/figure'
import { normalizeMath, tokenizeMath } from '../src/shared/mathtext'
import { checkTask } from '../src/shared/validate'

describe('calc', () => {
  it('evaluates school arithmetic', () => {
    expect(evaluate('8*5')).toBe(40)
    expect(evaluate('2·(4+3)')).toBe(14)
    expect(evaluate('12,5 : 5')).toBe(2.5)
    expect(evaluate('pi*3^2')).toBeCloseTo(28.274, 3)
    expect(evaluate('2pi')).toBeCloseTo(6.283, 3)
    expect(evaluate('sqrt(9)+-1')).toBe(2)
    expect(() => evaluate('alert(1)')).toThrow()
  })
  it('compares at stated precision', () => {
    expect(agrees(28.2743, 28.27)).toBe(true)
    expect(agrees(28.2743, 28.3)).toBe(true)
    expect(agrees(28.2743, 28.2)).toBe(false)
    expect(agrees(40, 41)).toBe(false)
  })
  it('finds Danish numbers in answers', () => {
    expect(answerMentions('40 cm²', 40)).toBe(true)
    expect(answerMentions('Arealet er 12,5 m^2', 12.5)).toBe(true)
    expect(answerMentions('1.250 kr.', 1250)).toBe(true)
    expect(answerMentions('140 cm²', 40)).toBe(false)
    expect(answerMentions('\\frac{3}{4}', 0.75)).toBe(true)
  })
})

describe('mathtext', () => {
  it('normalizes units and powers', () => {
    expect(normalizeMath('40 cm^2 og 8 m3')).toBe('40 cm² og 8 m³')
    expect(normalizeMath('8*5')).toBe('8 · 5')
  })
  it('tokenizes fractions', () => {
    expect(tokenizeMath('Tag \\frac{3}{4} af 2\\frac{1}{2}')).toEqual([
      { t: 'text', s: 'Tag ' },
      { t: 'frac', num: '3', den: '4' },
      { t: 'text', s: ' af 2' },
      { t: 'frac', num: '1', den: '2' },
    ])
  })
})

const rect = (labels: string[]) => ({
  unit: 'cm',
  grid: false,
  caption: '',
  shapes: [
    {
      kind: 'polygon' as const,
      points: [
        [0, 0],
        [8, 0],
        [8, 5],
        [0, 5],
      ] as [number, number][],
      radius: 0,
      sideLabels: labels,
      rightAngles: [0],
      dashed: false,
      label: '',
    },
  ],
})

describe('figure', () => {
  it('parses measures', () => {
    expect(parseLength('8 cm', 'cm')).toBe(8)
    expect(parseLength('0,5 m', 'cm')).toBe(50)
    expect(parseLength('x', 'cm')).toBeNull()
    expect(parseLength('r = 3 cm', 'cm')).toBe(3)
  })
  it('checks side labels against the drawing', () => {
    expect(figureProblems(rect(['8 cm', '5 cm', '', '']))).toEqual([])
    expect(figureProblems(rect(['8 cm', '6 cm', '', ''])).length).toBe(1)
  })
  it('lays out with labels', () => {
    const l = layoutFigure(rect(['8 cm', '5 cm', '', '']), 300, 200)
    expect(l.prims.filter((p) => p.k === 'text').length).toBe(2)
    expect(l.width).toBeLessThanOrEqual(300)
  })
})

const task = (over: Partial<TaskContent> = {}): TaskContent => ({
  title: 'Rektangel',
  intro: 'Figuren viser et rektangel.',
  figure: rect(['8 cm', '5 cm', '', '']),
  parts: [
    {
      question: 'Beregn arealet.',
      answer: '40 cm^2',
      solution: '8 · 5 = 40',
      points: 2,
      criteria: [
        { points: 1, description: 'opstilling' },
        { points: 1, description: 'resultat' },
      ],
      check: { expression: '8*5', value: 40, unit: 'cm^2' },
    },
  ],
  grade: 5,
  area: 'Geometri og måling',
  topic: 'Areal',
  difficulty: 'Let',
  ...over,
})

describe('checkTask', () => {
  it('accepts a correct task', () => {
    const r = checkTask(task())
    expect(r.issues).toEqual([])
    expect(r.verified).toEqual([true])
  })
  it('flags wrong answers, points and missing figure', () => {
    const t = task({ figure: null })
    t.parts[0] = { ...t.parts[0], answer: '41 cm^2', check: { ...t.parts[0].check, value: 41 }, points: 3 }
    const msgs = checkTask(t).issues.map((i) => i.message).join('\n')
    expect(msgs).toMatch(/figur/)
    expect(msgs).toMatch(/Efterregning/)
    expect(msgs).toMatch(/Delpointkriterierne/)
  })
  it('flags a missing unit', () => {
    const t = task()
    t.parts[0] = { ...t.parts[0], answer: '40' }
    expect(checkTask(t).issues[0].message).toMatch(/enheden cm²/)
  })
})

describe('mock pipeline', () => {
  it('produces valid, verified tasks', () => {
    const plan = mockPlan([{ role: 'user', content: 'Klassetrin: 5. klasse\nEmne (lærerens ord): areal\nAntal opgaver: 12\nSværhedsgrad: Blandet' }])
    expect(plan.items.length).toBe(12)
    const items = plan.items.slice(0, 3) as any
    const lines = items.map((it: any, i: number) => `${i + 1}. ${it.title} – ${it.angle} (Sværhedsgrad: ${it.difficulty}; område: ${it.area}; emne: ${it.topic}; figur: ${it.needsFigure ? 'ja' : 'nej'})`)
    const raw = mockTasks([{ role: 'user', content: lines.join('\n') }])
    const r = evaluateOutput(raw, { grade: 5, topic: 'areal', items, siblings: [], progression: '', requestId: 'xxxxxxxxxx' })
    expect(r.problems).toEqual([])
    expect(r.tasks.every((t) => t && t.verified.every(Boolean))).toBe(true)
  })
})

describe('Firestore codec', async () => {
  const { decodeTask, encodeTask, hasNestedArray } = await import('../src/shared/codec')
  it('stores figure points without nested arrays and reads them back', () => {
    const t = task()
    expect(hasNestedArray(t)).toBe(true) // what Firestore rejects
    const stored = JSON.parse(JSON.stringify(encodeTask(t)))
    expect(hasNestedArray(stored)).toBe(false)
    expect(decodeTask(stored)).toEqual(t)
  })
})
