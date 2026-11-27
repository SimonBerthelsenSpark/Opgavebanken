import type { Area } from './domain'
import { levelOf, neighbours } from './levels'

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
    title: 'Læreplaner for matematik A, B og C – stx, august 2024 (uvm.dk)',
    url: 'https://uvm.dk/-/media/filer/uvm/gym-laereplaner-2017/stx/240613-matematik-b---stx--august-2024.pdf',
    note: 'Gymnasiets niveauer. Linket er B-niveau; A og C ligger samme sted. Vejledningerne blev opdateret i november 2025.',
  },
  {
    title: 'Fagplan for matematik, andet udkast juni 2026 (uvm.dk)',
    url: 'https://uvm.dk/media/115b23fj/260624-fagplan-for-matematik-juni-2026.pdf',
    note: 'Udkast, der afprøves i efteråret 2026 og efter planen træder i kraft i skoleåret 2027/2028. Appens fire områder følger udkastets kerneidéer.',
  },
]

export interface Stage {
  name: string
  /** Level keys (levels.ts) the stage covers. */
  grades: string[]
  goals: Partial<Record<Area, string[]>>
}

/** Folkeskole: paraphrased from the fagplan draft (June 2026). Gymnasium: from the stx læreplaner (2024). See SOURCES. */
export const OFFICIAL_GOALS: Stage[] = [
  {
    name: '1.–3. klassetrin',
    grades: ['1', '2', '3'],
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
    grades: ['4', '5', '6'],
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
    grades: ['7', '8', '9'],
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
  {
    name: 'Matematik C (stx)',
    grades: ['10C'],
    goals: {
      'Tal og regnestrategier': ['Tal- og bogstavregning, procent- og rentesregning.'],
      Algebra: ['Ligninger og formler, herunder løsning med og uden hjælpemidler.'],
      'Funktioner og infinitesimalregning': ['Lineære funktioner, eksponentielle funktioner og potensfunktioner; regression.'],
      'Geometri og måling': ['Ensvinklede og retvinklede trekanter, trigonometri i retvinklede trekanter.'],
      'Statistik og sandsynlighed': ['Deskriptiv statistik for ugrupperede og grupperede data.'],
    },
  },
  {
    name: 'Matematik B (stx)',
    grades: ['10B', '11B'],
    goals: {
      Algebra: ['Polynomier, især andengradspolynomier; logaritmefunktioner.'],
      'Funktioner og infinitesimalregning': [
        'Differentialregning: differentialkvotient som væksthastighed, regneregler, monotoni og optimering.',
      ],
      'Geometri og måling': ['Trigonometri i vilkårlige trekanter (sinus- og cosinusrelationer).'],
      'Statistik og sandsynlighed': [
        'Sandsynlighedsregning, kombinatorik, stokastisk variabel og binomialfordelingen; deskriptiv statistik.',
      ],
    },
  },
  {
    name: 'Matematik A (stx)',
    grades: ['10A', '11A', '12A'],
    goals: {
      Algebra: ['Polynomier, logaritmer og ligningsløsning, også symbolsk.'],
      'Funktioner og infinitesimalregning': [
        'Differential- og integralregning, differentialligninger og funktioner af to variable.',
      ],
      'Geometri og måling': ['Vektorer i planen og rummet, analytisk geometri, trigonometri.'],
      'Statistik og sandsynlighed': ['Binomial- og normalfordeling, statistiske test og konfidensintervaller.'],
    },
  },
]

export type Progression = Record<string, Partial<Record<Area, string>>>

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
  '10C': {
    'Tal og regnestrategier': 'Tal- og bogstavregning, procent, renters rente og indekstal.',
    Algebra: 'Ligninger, formler og omformning.',
    'Funktioner og infinitesimalregning': 'Lineære og eksponentielle funktioner, potensfunktioner, regression.',
    'Geometri og måling': 'Ensvinklede trekanter, Pythagoras, sinus, cosinus og tangens i retvinklede trekanter.',
    'Statistik og sandsynlighed': 'Deskriptiv statistik: kvartiler, boksplot, sumkurver.',
  },
  '10B': {
    'Tal og regnestrategier': 'Tal- og bogstavregning, procent og renter.',
    Algebra: 'Ligninger og formler, andengradsligninger.',
    'Funktioner og infinitesimalregning': 'Lineære og eksponentielle funktioner, potensfunktioner, regression.',
    'Geometri og måling': 'Trigonometri i retvinklede trekanter.',
    'Statistik og sandsynlighed': 'Deskriptiv statistik.',
  },
  '11B': {
    Algebra: 'Andengradspolynomier, logaritmer.',
    'Funktioner og infinitesimalregning': 'Differentialregning, tangenter, monotoni og optimering.',
    'Geometri og måling': 'Sinus- og cosinusrelationer i vilkårlige trekanter.',
    'Statistik og sandsynlighed': 'Kombinatorik, sandsynlighed, binomialfordeling.',
  },
  '10A': {
    'Tal og regnestrategier': 'Tal- og bogstavregning, procent og renter.',
    Algebra: 'Ligninger, andengradsligninger, logaritmer.',
    'Funktioner og infinitesimalregning': 'Lineære, eksponentielle og potensfunktioner, regression.',
    'Geometri og måling': 'Trigonometri, vektorer i planen.',
    'Statistik og sandsynlighed': 'Deskriptiv statistik.',
  },
  '11A': {
    Algebra: 'Polynomier og logaritmer.',
    'Funktioner og infinitesimalregning': 'Differentialregning, optimering, begyndende integralregning.',
    'Geometri og måling': 'Vektorer i planen, cirklens ligning.',
    'Statistik og sandsynlighed': 'Binomialfordeling, normalfordeling.',
  },
  '12A': {
    'Funktioner og infinitesimalregning': 'Integralregning (arealer, rumfang), differentialligninger, funktioner af to variable.',
    'Geometri og måling': 'Vektorer i rummet, linjer og planer.',
    'Statistik og sandsynlighed': 'Hypotesetest (chi-i-anden), konfidensintervaller.',
  },
}

export function stageFor(key: string): Stage {
  return OFFICIAL_GOALS.find((s) => s.grades.includes(key)) ?? OFFICIAL_GOALS[0]
}

/** Text sent to the model for a level (folkeskole grade or gymnasium year + niveau). */
export function progressionContext(p: Progression, key: string): string {
  const lines: string[] = []
  const current = levelOf(key)
  const around = neighbours(key)
  for (const l of [...around.filter((n) => n.grade < current.grade), current, ...around.filter((n) => n.grade > current.grade)]) {
    const row = p[l.key] ?? DEFAULT_PROGRESSION[l.key]
    if (!row) continue
    lines.push(`${l.label}${l.key === key ? ' (valgt)' : ''}:`)
    for (const [area, text] of Object.entries(row)) if (text) lines.push(`  - ${area}: ${text}`)
  }
  const stage = stageFor(key)
  lines.push(`Officielle mål for ${stage.name}:`)
  for (const [area, goals] of Object.entries(stage.goals)) lines.push(`  - ${area}: ${(goals ?? []).join(' ')}`)
  return lines.join('\n')
}

/**
 * Topics per grade for the "Emne" dropdown, grouped by area. The app's own suggested placement
 * (like DEFAULT_PROGRESSION), so generated tasks get consistent topic names that filter well.
 */
export const GRADE_TOPICS: Record<string, Partial<Record<Area, string[]>>> = {
  1: {
    'Tal og regnestrategier': ['Tal til 100', 'Plus og minus', 'Tælle og sammenligne', 'Penge'],
    Algebra: ['Talmønstre', 'Ukendte tal'],
    'Geometri og måling': ['Figurer', 'Længde', 'Klokken'],
    'Statistik og sandsynlighed': ['Tabeller og diagrammer'],
  },
  2: {
    'Tal og regnestrategier': ['Tal til 1000', 'Plus og minus', 'Gange', 'Penge'],
    Algebra: ['Mønstre', 'Regneregler'],
    'Geometri og måling': ['Figurer', 'Længde og måling', 'Klokken og tid'],
    'Statistik og sandsynlighed': ['Tabeller og diagrammer'],
  },
  3: {
    'Tal og regnestrategier': ['Tal til 10.000', 'Gange', 'Division', 'Overslag', 'Penge'],
    Algebra: ['Ukendte tal', 'Regneudtryk'],
    'Geometri og måling': ['Areal', 'Spejling', 'Længde og vægt', 'Klokken og tid'],
    'Statistik og sandsynlighed': ['Diagrammer', 'Chance'],
  },
  4: {
    'Tal og regnestrategier': ['Brøker', 'Decimaltal', 'Gange', 'Division', 'Overslag'],
    Algebra: ['Regneudtryk', 'Talmønstre'],
    'Geometri og måling': ['Vinkler', 'Polygoner', 'Omkreds', 'Areal', 'Koordinatsystem'],
    'Statistik og sandsynlighed': ['Diagrammer', 'Typetal og variationsbredde'],
  },
  5: {
    'Tal og regnestrategier': ['Brøker', 'Decimaltal', 'Procent', 'Negative tal', 'Gange og division'],
    Algebra: ['Ligninger', 'Variable og formler'],
    'Geometri og måling': ['Omkreds', 'Areal', 'Vinkler', 'Symmetri', 'Koordinatsystem'],
    'Statistik og sandsynlighed': ['Middeltal og median', 'Sandsynlighed', 'Diagrammer'],
  },
  6: {
    'Tal og regnestrategier': ['Brøker', 'Decimaltal', 'Procent', 'Negative tal', 'Forhold'],
    Algebra: ['Ligninger', 'Formler', 'Grafer'],
    'Geometri og måling': ['Areal', 'Omkreds', 'Rumfang', 'Koordinatsystem', 'Målestoksforhold'],
    'Statistik og sandsynlighed': ['Hyppighed og frekvens', 'Middeltal og median', 'Sandsynlighed'],
  },
  7: {
    'Tal og regnestrategier': ['Procent', 'Forhold', 'Potenser', 'Kvadratrod', 'Brøker'],
    Algebra: ['Ligninger', 'Reduktion', 'Formler', 'Lineære sammenhænge'],
    'Geometri og måling': ['Cirkler', 'Vinkler', 'Trekanter', 'Rumfang'],
    'Statistik og sandsynlighed': ['Hyppighed og frekvens', 'Sandsynlighed', 'Kombinatorik'],
  },
  8: {
    'Tal og regnestrategier': ['Potenser og kvadratrod', 'Procent', 'Renter', 'Store og små tal'],
    Algebra: ['Lineære funktioner', 'Ligninger', 'Formler'],
    'Geometri og måling': ['Pythagoras', 'Ligedannede figurer', 'Rumfang og overflade', 'Cirkler'],
    'Statistik og sandsynlighed': ['Boksplot og kvartiler', 'Grupperede data', 'Sandsynlighed'],
  },
  9: {
    'Tal og regnestrategier': ['Procent og vækst', 'Økonomi', 'Reelle tal'],
    Algebra: ['Lineære funktioner', 'Eksponentielle funktioner', 'Ligningssystemer', 'Andengradsudtryk'],
    'Geometri og måling': ['Rumfang og overflade', 'Pythagoras', 'Målestoksforhold', 'Ligedannede figurer'],
    'Statistik og sandsynlighed': ['Statistik og stikprøver', 'Sandsynlighed'],
  },
  '10C': {
    'Tal og regnestrategier': ['Procent og renter', 'Indekstal'],
    Algebra: ['Ligninger og formler'],
    'Funktioner og infinitesimalregning': ['Lineære funktioner', 'Eksponentielle funktioner', 'Potensfunktioner', 'Regression'],
    'Geometri og måling': ['Ensvinklede trekanter', 'Retvinklet trigonometri'],
    'Statistik og sandsynlighed': ['Deskriptiv statistik'],
  },
  '10B': {
    'Tal og regnestrategier': ['Procent og renter'],
    Algebra: ['Ligninger og formler', 'Andengradsligninger'],
    'Funktioner og infinitesimalregning': ['Lineære funktioner', 'Eksponentielle funktioner', 'Potensfunktioner', 'Regression'],
    'Geometri og måling': ['Retvinklet trigonometri'],
    'Statistik og sandsynlighed': ['Deskriptiv statistik'],
  },
  '11B': {
    Algebra: ['Andengradspolynomier', 'Logaritmer'],
    'Funktioner og infinitesimalregning': ['Differentialregning', 'Tangenter', 'Monotoni', 'Optimering'],
    'Geometri og måling': ['Sinus- og cosinusrelationer'],
    'Statistik og sandsynlighed': ['Kombinatorik', 'Sandsynlighed', 'Binomialfordeling'],
  },
  '10A': {
    'Tal og regnestrategier': ['Procent og renter'],
    Algebra: ['Ligninger', 'Andengradsligninger', 'Logaritmer'],
    'Funktioner og infinitesimalregning': ['Lineære funktioner', 'Eksponentielle funktioner', 'Potensfunktioner', 'Regression'],
    'Geometri og måling': ['Trigonometri', 'Vektorer i planen'],
    'Statistik og sandsynlighed': ['Deskriptiv statistik'],
  },
  '11A': {
    Algebra: ['Polynomier', 'Logaritmer'],
    'Funktioner og infinitesimalregning': ['Differentialregning', 'Optimering', 'Integralregning'],
    'Geometri og måling': ['Vektorer i planen', 'Cirklens ligning'],
    'Statistik og sandsynlighed': ['Binomialfordeling', 'Normalfordeling'],
  },
  '12A': {
    'Funktioner og infinitesimalregning': ['Integralregning', 'Differentialligninger', 'Funktioner af to variable'],
    'Geometri og måling': ['Vektorer i rummet'],
    'Statistik og sandsynlighed': ['Hypotesetest', 'Konfidensintervaller'],
  },
}

export const MIXED_PREFIX = 'Blandet'

/** The topic text sent to the model for a dropdown choice. */
export function topicRequest(choice: string, key: string): string {
  const label = levelOf(key).label
  if (choice === 'mixed:all') return `${MIXED_PREFIX}: emner fra hele pensum for ${label}`
  if (choice.startsWith('mixed:')) return `${MIXED_PREFIX} inden for ${choice.slice(6)} (${label})`
  return choice
}

export function topicCatalogText(key: string): string {
  const row = GRADE_TOPICS[key]
  return row ? Object.entries(row).map(([a, ts]) => `  - ${a}: ${ts.join(', ')}`).join('\n') : ''
}
