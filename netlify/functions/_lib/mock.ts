import type { Msg } from './openai'

/**
 * Deterministic stand-in for OpenAI, used only when MOCK_AI=1 (local development and automated
 * tests). It returns data in exactly the shape the strict JSON Schemas describe, so the whole
 * server-side validation and the UI can be exercised without a key or token costs.
 */

const field = (text: string, label: string) => new RegExp(`${label}:\\s*(.+)`).exec(text)?.[1]?.trim() ?? ''

export function mockPlan(messages: Msg[]) {
  const user = messages.find((m) => m.role === 'user')?.content ?? ''
  const grade = Number.parseInt(field(user, 'Klassetrin'), 10) || 5
  const topic = field(user, 'Emne \\(lærerens ord\\)') || 'areal'
  const count = Number.parseInt(field(user, 'Antal opgaver'), 10) || 4
  const diff = field(user, 'Sværhedsgrad') || 'Blandet'
  const tooHard = /pythagoras|eksponentiel|andengrads/i.test(topic) && grade < 7
  const angles = [
    'Beregn areal af et rektangel direkte ud fra mål på figuren.',
    'Find en ukendt side baglæns, når arealet er kendt.',
    'Sammensat L-formet figur, der skal deles op.',
    'Areal af en retvinklet trekant som halvdelen af et rektangel.',
    'Hverdagssituation: fliser på et gulv, hvor antal skal beregnes.',
    'Find og forklar fejlen i en elevs arealberegning.',
    'Sammenlign to figurer med samme omkreds men forskelligt areal.',
    'Tæl tern på kvadratnet og bestem arealet.',
    'Åben opgave: tegn to forskellige rektangler med arealet 24 cm^2.',
    'Halvdelen og en fjerdedel af en have – arealer med brøker.',
    'Omkreds og areal af et kvadrat, når omkredsen er kendt.',
    'Ræsonnement: hvad sker der med arealet, når siderne fordobles?',
  ]
  const levels = ['Let', 'Middel', 'Svær'] as const
  const items = Array.from({ length: count }, (_, i) => ({
    title: `Areal ${i + 1}: ${angles[i % angles.length].split(/[.:]/)[0]}`.slice(0, 80),
    angle: angles[i % angles.length],
    difficulty: diff === 'Blandet' ? levels[Math.min(2, Math.floor((i * 3) / count))] : diff,
    area: 'Geometri og måling',
    topic: i % 3 === 2 ? 'Omkreds' : 'Areal',
    needsFigure: i % 6 !== 5,
  }))
  return {
    fit: tooHard
      ? { status: 'for_svaert', explanation: `Emnet hører typisk til i udskolingen og ligger over niveauet for ${grade}. klasse.`, suggestedLevels: ['8'] }
      : { status: 'passer', explanation: '', suggestedLevels: [] },
    items,
  }
}

export function mockTasks(messages: Msg[]) {
  const user = messages.find((m) => m.role === 'user')?.content ?? ''
  const repairing = messages.some((m) => m.role === 'user' && m.content.startsWith('Kontrollen fandt fejl'))
  const ideas = [...user.matchAll(/^\d+\. (.+?) – (.+) \(Sværhedsgrad: ([^;]+); område: ([^;]+); emne: ([^;]+); figur: (ja|nej)\)$/gm)]
  const tasks = ideas.map((m, i) => {
    const [, title, , difficulty, area, topic, fig] = m
    const w = 4 + ((title.length + i) % 6)
    const h = 3 + (i % 4)
    const inject = process.env.MOCK_AI_INJECT_ERROR === '1' && !repairing && i === 0
    const areaValue = w * h + (inject ? 1 : 0)
    const withFigure = fig === 'ja'
    const parts = [
      {
        question: withFigure ? 'Beregn arealet af figuren.' : `Et rektangel er ${w} cm langt og ${h} cm bredt. Beregn arealet.`,
        answer: `${areaValue} cm^2`,
        solution: `Areal = længde · bredde = ${w} · ${h} = ${w * h} cm^2.`,
        points: 2,
        criteria: [
          { points: 1, description: `Korrekt opstilling: ${w} · ${h}` },
          { points: 1, description: `Korrekt resultat ${w * h} cm^2 med enhed` },
        ],
        check: { expression: `${w}*${h}`, value: areaValue, unit: 'cm^2' },
      },
      {
        question: 'Beregn omkredsen.',
        answer: `${2 * (w + h)} cm`,
        solution: `Omkreds = 2 · (${w} + ${h}) = ${2 * (w + h)} cm.`,
        points: 1,
        criteria: [{ points: 1, description: `${2 * (w + h)} cm med enhed` }],
        check: { expression: `2*(${w}+${h})`, value: 2 * (w + h), unit: 'cm' },
      },
    ]
    if (i % 4 === 3)
      parts.push({
        question: 'Hvor stor en del af rektanglet er \\frac{1}{4} af arealet? Angiv svaret i cm^2.',
        answer: `${(w * h) / 4} cm^2`.replace('.', ','),
        solution: `\\frac{1}{4} · ${w * h} = ${(w * h) / 4}`.replace('.', ','),
        points: 1,
        criteria: [{ points: 1, description: 'Korrekt fjerdedel med enhed' }],
        check: { expression: `${w * h}/4`, value: (w * h) / 4, unit: 'cm^2' },
      })
    return {
      title,
      intro: withFigure
        ? `Figuren viser et rektangel med mål i cm. (${difficulty})`
        : `Lise vil lægge et tæppe i sit værelse.`,
      figure: withFigure
        ? {
            unit: 'cm',
            grid: false,
            caption: '',
            shapes: [
              {
                kind: 'polygon',
                points: [
                  [0, 0],
                  [w, 0],
                  [w, h],
                  [0, h],
                ],
                radius: 0,
                sideLabels: [`${w} cm`, `${h} cm`, '', ''],
                rightAngles: [0],
                dashed: false,
                label: '',
              },
            ],
          }
        : null,
      parts,
      area,
      topic,
      difficulty,
    }
  })
  return { tasks }
}
