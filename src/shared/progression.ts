import type { Area } from './domain'

/**
 * Two different things, kept apart on purpose:
 *  - OFFICIAL_GOALS: what the national documents say for a whole trinforløb (1.–3., 4.–6., 7.–9.).
 *    Paraphrased, with sources. Not editable in the app.
 *  - DEFAULT_PROGRESSION: the app's own suggested placement on a single grade. The teacher can
 *    edit it; it is sent to the model as guidance and used to judge whether a topic fits a grade.
 */

export interface Source {
  title: string
  url: string
  note: string
}

export const SOURCES: Source[] = [
  {
    title: 'Fælles Mål 2019 – Matematik (Børne- og Undervisningsministeriet)',
    url: 'https://www.uvm.dk/-/media/filer/uvm/udd/folke/pdf24/maj/240513-faellesmaal-matematik.pdf',
    note: 'Gældende læreplan. Kompetencemål efter 3., 6. og 9. klassetrin er bindende; færdigheds- og vidensområder og -mål er vejledende fra 1. januar 2025.',
  },
  {
    title: 'Læseplan for matematik (emu.dk)',
    url: 'https://arkiv.emu.dk/sites/default/files/2020-09/GSK_L%C3%A6seplan_Matematik.pdf',
    note: 'Vejledende beskrivelse af indholdet i de tre trinforløb.',
  },
  {
    title: 'Fagplan for matematik, andet udkast juni 2026 (uvm.dk)',
    url: 'https://uvm.dk/media/115b23fj/260624-fagplan-for-matematik-juni-2026.pdf',
    note: 'Udkast, der afprøves i efteråret 2026 og efter planen træder i kraft i skoleåret 2027/2028. Appens fire områder følger udkastets kerneidéer.',
  },
]

export interface Stage {
  name: string
  grades: number[]
  goals: Record<Area, string[]>
}

/** Paraphrased from the fagplan draft (June 2026); see SOURCES. */
export const OFFICIAL_GOALS: Stage[] = [
  {
    name: '1.–3. klassetrin',
    grades: [1, 2, 3],
    goals: {
      'Tal og regnestrategier': [
        'Naturlige tal til antal, rækkefølge og størrelse; titalssystemet.',
        'Fleksible strategier til regning med naturlige tal.',
      ],
      Algebra: [
        'Generelle sammenhænge og regneregler for naturlige tal med støtte i forskellige repræsentationer.',
        'Ukendte tal findes ved at sammenligne regneudtryk.',
      ],
      'Geometri og måling': [
        'Egenskaber ved plane og rumlige figurer.',
        'Sammenligne og måle længde, vægt og areal i hele enheder.',
      ],
      'Statistik og sandsynlighed': [
        'Indsamle, ordne og tolke data om kategorier og antal i tabeller og diagrammer.',
        'Uformelle overvejelser om chance.',
      ],
    },
  },
  {
    name: '4.–6. klassetrin',
    grades: [4, 5, 6],
    goals: {
      'Tal og regnestrategier': [
        'Brøker som størrelse og del af en helhed; sammenhængen mellem brøk, decimaltal og procent.',
        'Regning med rationale tal, herunder negative hele tal.',
      ],
      Algebra: [
        'Sammenhænge beskrevet med tabeller, regneudtryk, grafer og udtryk med variable.',
        'Opstille og løse ligninger ved at sammenligne regneudtryk.',
      ],
      'Geometri og måling': [
        'Polygoners egenskaber: vinkler, parallelitet og symmetri; koordinatsystem.',
        'Måle vinkler, længder, areal og rumfang; beregne omkreds og areal af udvalgte polygoner og rumfang af kasser.',
      ],
      'Statistik og sandsynlighed': [
        'Data om kategorier, antal og målinger i tabeller og diagrammer.',
        'Sandsynlighed bestemt gennem eksperimenter.',
      ],
    },
  },
  {
    name: '7.–9. klassetrin',
    grades: [7, 8, 9],
    goals: {
      'Tal og regnestrategier': [
        'Reelle tal, forhold, kvadratrod, potens og primtal.',
        'Regning med forhold, procent og rationale tal.',
      ],
      Algebra: [
        'Lineær og ikke-lineær vækst, herunder lineære og eksponentielle funktioner.',
        'Tabeller, grafer og forskrifter; løse lineære ligninger grafisk og algebraisk.',
      ],
      'Geometri og måling': [
        'Kongruente og ligedannede figurer; Pythagoras’ sætning.',
        'Formler for omkreds, areal og rumfang af plane og rumlige figurer.',
      ],
      'Statistik og sandsynlighed': [
        'Sammenligne fordelinger og undersøge sammenhænge med tabeller, diagrammer og deskriptorer.',
        'Sætte tal på sandsynligheder med data, eksperimenter, simuleringer og enkle modeller.',
      ],
    },
  },
]

export type Progression = Record<string, Record<Area, string>>

/** The app's own suggested placement per grade. Editable by the teacher. */
export const DEFAULT_PROGRESSION: Progression = {
  '1': {
    'Tal og regnestrategier': 'Tal til 100, tælle og sammenligne, enere og tiere, plus og minus uden tierovergang.',
    Algebra: 'Talmønstre, regnehistorier med et ukendt tal (□ + 3 = 7).',
    'Geometri og måling': 'Genkende trekant, firkant og cirkel; sammenligne og måle længder med ikke-standardenheder.',
    'Statistik og sandsynlighed': 'Tælle, sortere og vise antal i enkle tabeller og billeddiagrammer.',
  },
  '2': {
    'Tal og regnestrategier': 'Tal til 1000, plus og minus med tierovergang, begyndende gange som gentagen addition; penge.',
    Algebra: 'Mønstre og regneregler (fx byttereglen), ukendte tal i regnehistorier.',
    'Geometri og måling': 'Figurers egenskaber (sider, hjørner), måle i cm og m, klokken og tid.',
    'Statistik og sandsynlighed': 'Tabeller og søjlediagrammer, aflæse og sammenligne grupper.',
  },
  '3': {
    'Tal og regnestrategier': 'Tal til 10.000, den lille tabel, division som deling, overslag.',
    Algebra: 'Sammenligne regneudtryk, finde ukendte tal, sammenhængen mellem gange og division.',
    'Geometri og måling': 'Areal ved optælling af kvadrater (hele enheder), spejling, måle længde og vægt i standardenheder.',
    'Statistik og sandsynlighed': 'Indsamle egne data, søjle- og pindediagrammer, chance: sikkert, muligt, umuligt.',
  },
  '4': {
    'Tal og regnestrategier': 'Brøker som del af en helhed, decimaltal (tiendedele), gange og division med flercifrede tal.',
    Algebra: 'Talmønstre og regneudtryk, regnearternes hierarki, enkle tabeller over sammenhænge.',
    'Geometri og måling': 'Vinkler (ret, spids, stump), polygoner, omkreds af polygoner, areal af rektangler, koordinatsystemets 1. kvadrant.',
    'Statistik og sandsynlighed': 'Typetal og variationsbredde, diagrammer over målinger.',
  },
  '5': {
    'Tal og regnestrategier': 'Brøker og decimaltal, sammenligning og forkortning, procent som hundrededele, negative tal på tallinjen.',
    Algebra: 'Enkle ligninger løst ved at sammenligne regneudtryk, udtryk med variable.',
    'Geometri og måling': 'Omkreds og areal af rektangler, kvadrater og sammensatte figurer, areal af retvinklede trekanter, måle vinkler, symmetri.',
    'Statistik og sandsynlighed': 'Middeltal, median og typetal; sandsynlighed bestemt ved eksperimenter.',
  },
  '6': {
    'Tal og regnestrategier': 'Brøk, decimaltal og procent som samme størrelse, regning med negative hele tal, forhold i hverdagen.',
    Algebra: 'Ligninger, formler i ord og symboler, grafer for enkle sammenhænge.',
    'Geometri og måling': 'Areal af trekanter, parallelogrammer og trapezer, rumfang af kasser, koordinatsystem med alle fire kvadranter, målestoksforhold.',
    'Statistik og sandsynlighed': 'Hyppighed og frekvens, middeltal og median, sandsynlighed fra eksperimenter og simple optællinger.',
  },
  '7': {
    'Tal og regnestrategier': 'Procentregning (dele, hele, procentdel), forhold, potenser og kvadratrod.',
    Algebra: 'Reducere udtryk, løse lineære ligninger, formler, lineære sammenhænge i tabel og graf.',
    'Geometri og måling': 'Cirklens omkreds og areal, vinkelsummer, konstruktion af trekanter, rumfang af prismer.',
    'Statistik og sandsynlighed': 'Hyppighed, frekvens og summeret frekvens; teoretisk sandsynlighed og enkel kombinatorik.',
  },
  '8': {
    'Tal og regnestrategier': 'Potenser og kvadratrødder, store og små tal, procentvis ændring, renter.',
    Algebra: 'Lineære funktioner (forskrift, hældning, skæring), ligninger grafisk og algebraisk.',
    'Geometri og måling': 'Pythagoras’ sætning, ligedannede figurer, rumfang og overflade af cylinder og prisme.',
    'Statistik og sandsynlighed': 'Grupperede data, kvartiler og boksplot, sandsynlighed ved simulering og modeller.',
  },
  '9': {
    'Tal og regnestrategier': 'Reelle tal, procent og vækst, hverdagsøkonomi (lån, renter, budget).',
    Algebra: 'Lineære og eksponentielle funktioner, andengradsudtryk i enkle tilfælde, ligningssystemer grafisk.',
    'Geometri og måling': 'Rumfang og overflade af kegle, pyramide og kugle, målestoksforhold, ligedannethed.',
    'Statistik og sandsynlighed': 'Stikprøver, sammenligning af fordelinger, sandsynlighedsmodeller.',
  },
}

export function stageFor(grade: number): Stage {
  return OFFICIAL_GOALS.find((s) => s.grades.includes(grade)) ?? OFFICIAL_GOALS[0]
}

/** Text sent to the model as context for a grade. */
export function progressionContext(p: Progression, grade: number): string {
  const lines: string[] = []
  for (const g of [grade - 1, grade, grade + 1]) {
    const row = p[String(g)]
    if (!row) continue
    lines.push(`${g}. klasse${g === grade ? ' (valgt)' : ''}:`)
    for (const [area, text] of Object.entries(row)) lines.push(`  - ${area}: ${text}`)
  }
  const stage = stageFor(grade)
  lines.push(`Officielle mål for trinforløbet ${stage.name} (fagplan-udkast juni 2026):`)
  for (const [area, goals] of Object.entries(stage.goals)) lines.push(`  - ${area}: ${goals.join(' ')}`)
  return lines.join('\n')
}
