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

describe('levels', async () => {
  const { LEVELS, levelLabel, neighbours } = await import('../src/shared/levels')
  const { progressionContext, DEFAULT_PROGRESSION } = await import('../src/shared/progression')
  it('labels folkeskole and gymnasium levels', () => {
    expect(levelLabel({ grade: 5 })).toBe('5. klasse')
    expect(levelLabel({ grade: 11, niveau: 'B' })).toBe('2.g – Matematik B')
    expect(levelLabel({ grade: 12, niveau: 'A' }, true)).toBe('3.g A')
    expect(LEVELS.filter((l) => l.school === 'gymnasium')).toHaveLength(6)
  })
  it('gives context within the same niveau', () => {
    expect(neighbours('11A').map((l) => l.key)).toEqual(['10A', '12A'])
    const ctx = progressionContext(DEFAULT_PROGRESSION, '11B')
    expect(ctx).toContain('2.g – Matematik B (valgt)')
    expect(ctx).toContain('Matematik B (stx)')
    expect(ctx).not.toContain('Matematik A')
  })
})

describe('gymnasium maths', async () => {
  const { compile } = await import('../src/shared/calc')
  const { figureProblems: problems, layoutFigure: layout } = await import('../src/shared/figure')
  it('evaluates functions in degrees, logarithms and binomials', () => {
    expect(evaluate('sin(30)')).toBeCloseTo(0.5, 9)
    expect(evaluate('2*cos(60)')).toBeCloseTo(1, 9)
    expect(evaluate('ln(e^2)')).toBeCloseTo(2, 9)
    expect(evaluate('log(1000)')).toBeCloseTo(3, 9)
    expect(evaluate('binom(10; 3)')).toBe(120)
    expect(evaluate('5!')).toBe(120)
    expect(evaluate('200*1,05^10')).toBeCloseTo(325.78, 2)
    expect(evaluate('atan(1)')).toBeCloseTo(45, 9)
    expect(compile('0.5x^2-2x+1', true)(4)).toBe(1)
    expect(() => evaluate('x+1')).toThrow()
  })
  it('tokenizes gymnasium notation', () => {
    const t = tokenizeMath("f(x) = e^{0,5x} og f'(x), \\vec{a}, \\binom{10}{3}, a_1, \\int_0^2 x\\,dx ≤ \\infty")
    const kinds = t.map((x) => x.t)
    expect(kinds).toContain('sup')
    expect(kinds).toContain('vec')
    expect(kinds).toContain('binom')
    expect(kinds).toContain('sub')
    const text = t.filter((x) => x.t === 'text').map((x) => (x as { s: string }).s).join('')
    expect(text).toContain('f′(x)')
    expect(text).toContain('∫')
    expect(text).toContain('∞')
    expect(tokenizeMath('Udfyld: ____ cm').every((x) => x.t === 'text')).toBe(true)
  })
  const graph = (label: string) => ({
    unit: '',
    grid: true,
    caption: '',
    axes: { xMin: -2, xMax: 6, yMin: -3, yMax: 8, xStep: 1, yStep: 1, xLabel: 'x', yLabel: 'y' },
    shapes: [
      { kind: 'function' as const, expression: '0.5x^2-2x+1', points: [], radius: 0, sideLabels: [], rightAngles: [], dashed: false, label: 'f' },
      { kind: 'point' as const, expression: '', points: [[4, 1]] as [number, number][], radius: 0, sideLabels: [], rightAngles: [], dashed: false, label },
    ],
  })
  it('draws and checks graphs', () => {
    expect(problems(graph('P(4; 1)'))).toEqual([])
    expect(problems(graph('P(4; 2)'))[0]).toMatch(/mærket/)
    const l = layout(graph('P(4; 1)'), 360, 260)
    expect(l.prims.some((p) => p.k === 'poly' && p.pts.length > 50)).toBe(true)
    expect(l.prims.filter((p) => p.k === 'text').length).toBeGreaterThan(10)
  })
})
