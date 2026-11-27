import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SavedSet, Task } from '../src/shared/domain'
import { pointRows, pointTablePdf, studentPdf, teacherPdf } from '../src/shared/pdfcore'

const fonts = {
  regular: readFileSync('public/fonts/LiberationSans-Regular.ttf'),
  bold: readFileSync('public/fonts/LiberationSans-Bold.ttf'),
}

const base = (i: number, over: Partial<Task>): Task => ({
  id: `t${i}`,
  ownerUid: 'u1',
  title: `Opgave ${i}`,
  intro: '',
  figure: null,
  parts: [],
  grade: 5,
  area: 'Geometri og måling',
  topic: 'Areal',
  difficulty: 'Middel',
  issues: [],
  verified: [],
  source: 'ai',
  editedByTeacher: false,
  createdAt: 0,
  updatedAt: 0,
  ...over,
})

const set: SavedSet = {
  id: 's1',
  title: 'Areal · 5. klasse',
  createdAt: 0,
  totalPoints: 0,
  tasks: [
    base(1, {
      title: 'Køkkengulvet',
      intro: 'Figuren viser et L-formet køkkengulv. Alle vinkler er rette.',
      figure: {
        unit: 'm',
        grid: false,
        caption: '',
        shapes: [
          {
            kind: 'polygon',
            points: [
              [0, 0],
              [6, 0],
              [6, 3],
              [2, 3],
              [2, 5],
              [0, 5],
            ],
            radius: 0,
            sideLabels: ['6 m', '3 m', '4 m', '2 m', '2 m', '5 m'],
            rightAngles: [0, 1, 2, 4, 5],
            dashed: false,
            label: '',
          },
        ],
      },
      parts: [
        {
          question: 'Beregn gulvets areal i m^2.',
          answer: 'RIGTIGT-FACIT-22 m^2',
          solution: '6 · 3 + 2 · 2 = 22',
          points: 2,
          criteria: [
            { points: 1, description: 'Deler figuren op' },
            { points: 1, description: '22 m^2' },
          ],
          check: { expression: '6*3+2*2', value: 22, unit: 'm^2' },
        },
        {
          question: 'Fliserne koster 250 kr. pr. m^2. Hvad koster fliserne?',
          answer: '5500 kr.',
          solution: '22 · 250 = 5500',
          points: 1,
          criteria: [{ points: 1, description: '5500 kr.' }],
          check: { expression: '22*250', value: 5500, unit: 'kr.' },
        },
      ],
    }),
    base(2, {
      title: 'Brøkdele af haven',
      intro: 'En have er 12 m lang og 8 m bred. \\frac{3}{4} af haven er græs, og resten er bede. Dybden er 10^{-2} km.',
      parts: [
        {
          question: 'Hvor mange m^2 er græs? Skriv også \\frac{1}{4} af arealet.',
          answer: '72 m^2 græs og 24 m^2 bede',
          solution: '\\frac{3}{4} · 96 = 72',
          points: 3,
          criteria: [
            { points: 1, description: 'Areal 96 m^2' },
            { points: 2, description: '72 m^2 og 24 m^2' },
          ],
          check: { expression: '96*3/4', value: 72, unit: 'm^2' },
        },
      ],
    }),
    base(3, {
      title: 'Cirkelbedet',
      intro: 'Figuren viser et rundt bed.',
      figure: {
        unit: 'm',
        grid: false,
        caption: '',
        shapes: [{ kind: 'circle', points: [[0, 0]], radius: 3, sideLabels: [], rightAngles: [], dashed: false, label: 'r = 3 m' }],
      },
      parts: [
        {
          question: 'Beregn bedets areal. Rund af til hele m^2.',
          answer: '28 m^2',
          solution: 'π · 3^2 ≈ 28,27',
          points: 2,
          criteria: [
            { points: 1, description: 'Formel' },
            { points: 1, description: '28 m^2' },
          ],
          check: { expression: 'pi*3^2', value: 28, unit: 'm^2' },
        },
      ],
    }),
    base(99, {
      title: 'Andengradspolynomium og tangent',
      grade: 11,
      niveau: 'B',
      area: 'Funktioner og infinitesimalregning',
      topic: 'Differentialregning',
      intro: "Figuren viser grafen for f(x) = \\frac{1}{2}x^2 - 2x + 1 og punktet P(4; 1). Væksten er e^{0,5x}, vektoren \\vec{a} og \\binom{10}{3} = 120. Indeks a_1 og \\int_0^2 x\\,dx.",
      figure: {
        unit: '',
        grid: true,
        caption: '',
        axes: { xMin: -2, xMax: 6, yMin: -3, yMax: 8, xStep: 1, yStep: 1, xLabel: 'x', yLabel: 'y' },
        shapes: [
          { kind: 'function', expression: '0.5x^2-2x+1', points: [], radius: 0, sideLabels: [], rightAngles: [], dashed: false, label: 'f' },
          { kind: 'point', expression: '', points: [[4, 1]], radius: 0, sideLabels: [], rightAngles: [], dashed: false, label: 'P(4; 1)' },
        ],
      },
      parts: [
        {
          question: "Bestem f'(4), og bestem en ligning for tangenten i P.",
          answer: "f'(4) = 2, y = 2x - 7",
          solution: "f'(x) = x - 2, så f'(4) = 2. Tangent: y = 2(x - 4) + 1.",
          points: 3,
          criteria: [
            { points: 1, description: "f'(x) = x - 2" },
            { points: 2, description: 'Tangentligning y = 2x - 7' },
          ],
          check: { expression: '4-2', value: 2, unit: '' },
        },
      ],
    }),
    ...Array.from({ length: 4 }, (_, k) =>
      base(4 + k, {
        title: `Ternet figur ${k + 1}`,
        intro: 'Figuren er tegnet på kvadratnet. Hvert tern er 1 cm × 1 cm.',
        figure: {
          unit: 'cm',
          grid: true,
          caption: '',
          shapes: [
            {
              kind: 'polygon',
              points: [
                [0, 0],
                [4 + k, 0],
                [4 + k, 3],
                [0, 3],
              ],
              radius: 0,
              sideLabels: ['', '', '', ''],
              rightAngles: [],
              dashed: false,
              label: '',
            },
          ],
        },
        parts: [
          {
            question: 'Tæl ternene. Hvad er arealet?',
            answer: `${(4 + k) * 3} cm^2`,
            solution: 'Tæl',
            points: 1,
            criteria: [{ points: 1, description: 'Korrekt' }],
            check: { expression: `${4 + k}*3`, value: (4 + k) * 3, unit: 'cm^2' },
          },
        ],
      }),
    ),
  ],
}

const text = (bytes: Uint8Array, name: string) => {
  mkdirSync('test-output', { recursive: true })
  const path = `test-output/${name}.pdf`
  writeFileSync(path, bytes)
  return execFileSync('pdftotext', ['-layout', path, '-']).toString()
}

describe('PDFs', () => {
  it('student sheet has no answers and correct numbering', async () => {
    const t = text(await studentPdf(set, fonts), 'elev')
    expect(t).not.toContain('RIGTIGT-FACIT')
    expect(t).not.toMatch(/Facit|Løsningsforslag/)
    expect(t).toContain('Opgave 1')
    expect(t).toMatch(/1a[\s\S]*1b[\s\S]*Opgave 2/)
    expect(t).toContain('Navn:')
    expect(t).toContain('æ') // Danish characters survive (græs)
    expect(t).toContain('Figuren er ikke målfast.')
  })
  it('teacher guide has answers with same numbering', async () => {
    const t = text(await teacherPdf(set, fonts), 'laerer')
    expect(t).toContain('RIGTIGT-FACIT-22')
    expect(t).toMatch(/1a[\s\S]*1b[\s\S]*Opgave 2/)
  })
  it('point table rows and total agree', async () => {
    const rows = pointRows(set)
    expect(rows.map((r) => r.label)).toEqual(['1a', '1b', '2', '3', '4', '5', '6', '7', '8'])
    const t = text(await pointTablePdf(set, fonts), 'point')
    expect(t).toMatch(/I alt\s+15/)
  })
})
