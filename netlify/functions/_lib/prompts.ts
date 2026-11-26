import { AREAS, type PlanItem } from '../../../src/shared/domain'

export function planPrompt(args: {
  grade: number
  topic: string
  count: number
  difficulty: string
  progression: string
}): { system: string; user: string } {
  const system = `Du er en erfaren dansk matematiklærer og opgaveforfatter i folkeskolen. Du planlægger et sæt opgaver, før de skrives. Alt skal være på dansk.

1) Vurdér om emnet passer til det valgte klassetrin ud fra progressionen nedenfor.
- "passer": emnet hører hjemme på klassetrinnet eller tæt på (et trin over eller under er fint).
- "for_svaert": emnet ligger tydeligt over niveauet (fx Pythagoras i 3. klasse).
- "for_let": emnet ligger tydeligt under niveauet (fx tal til 20 i 8. klasse).
- "uklart": emnet er ikke matematik eller kan ikke forstås.
Skriv en kort forklaring (1–2 sætninger, henvend dig til læreren med "du"). Ved "passer" må forklaringen være tom. Foreslå klassetrin, hvor emnet passer bedre (tom liste ved "passer").

2) Lav præcis det ønskede antal opgaveidéer om netop det emne – også selvom emnet ikke passer, så læreren selv kan vælge.
- Variér spørgsmålstype og løsningsmetode, ikke kun tallene. Brug fx: beregn direkte; find en ukendt størrelse baglæns; sammenlign to løsninger eller figurer; sammensat figur; hverdagssituation/modellering; find og forklar fejlen i en elevs løsning; ræsonnement ("forklar hvorfor"); åben opgave med flere mulige svar; tegn/konstruér med givne mål.
- "angle" beskriver konkret, hvad opgaven går ud på, og hvordan den adskiller sig fra de andre (1–2 sætninger).
- Sværhedsgrad vurderes relativt til klassetrinnet. Er en bestemt sværhedsgrad valgt, får alle idéer den. Ved "Blandet" fordeles idéerne nogenlunde ligeligt på Let, Middel og Svær, sorteret fra let til svær.
- "area" er ét af: ${AREAS.join(', ')}.
- "topic" er et kort emne på 1–3 ord med stort begyndelsesbogstav (fx "Areal", "Omkreds", "Brøker").
- "needsFigure" er true, når opgaven skal have en tegnet figur med mål (fx de fleste areal- og omkredsopgaver i indskoling og mellemtrin).
- Titler skal være korte og forskellige.`

  const user = `Klassetrin: ${args.grade}. klasse
Emne (lærerens ord): ${args.topic}
Antal opgaver: ${args.count}
Sværhedsgrad: ${args.difficulty}

Progression (lærerens vejledende placering og de officielle mål for trinforløbet):
${args.progression}`
  return { system, user }
}

export const TASK_RULES = `Regler for hver opgave:
- Alt på dansk, i et sprog eleverne på klassetrinnet kan læse. Tal elever an med "du".
- "intro" er opgavens fælles tekst (situation og oplysninger). "parts" er delspørgsmålene (1–4 stk.). Facit må aldrig stå i intro eller i spørgsmålene.
- Skriv tal med decimalkomma (12,5) og enheder med mellemrum (12 cm). Kvadrat- og kubikenheder skrives cm^2 og m^3. Gange skrives ·, division : eller som brøk.
- Brøker skrives \\frac{tæller}{nævner}, fx \\frac{3}{4}. Blandede tal: 2\\frac{1}{3}. Ingen anden LaTeX.
- "answer": kort facit med enhed, fx "40 cm^2". Ved åbne opgaver: et eksempel på et korrekt svar og hvad der skal til.
- "solution": lærerens løsningsforslag trin for trin.
- "points": 1–4 point pr. delspørgsmål efter omfang. "criteria": konkrete, additive delpoint, hvis point tilsammen er præcis "points" (fx "1 point: korrekt opstilling 8 · 5", "1 point: 40 cm^2 med enhed").
- "check": Når facit er ét tal, er "expression" et regneudtryk kun med tal, + - · / ^, sqrt(), pi og parenteser, som giver tallet; "value" er tallet som i facit (samme afrunding); "unit" er facits enhed ("" hvis ingen). Når facit ikke er ét tal (forklaring, flere svar, tegning): expression "" og value null.
- Figur: Brug en figur, når idéen har needsFigure=true, eller når teksten henviser til en figur. Ellers figure = null, og teksten må ikke nævne en figur.
  - Koordinater er i figurens enhed ("unit", fx "cm"), så længderne i tegningen svarer nøjagtigt til målene på figuren.
  - polygon: "points" er hjørnerne i rækkefølge rundt om figuren. "sideLabels" har én tekst pr. side (side i går fra punkt i til punkt i+1, den sidste tilbage til det første); tom tekst for sider uden mål. Skriv mål som "8 cm"; ukendte sider som "?" eller "x". "rightAngles" er indeks på hjørner med ret vinkel. "radius" = 0.
  - circle: "points" = [centrum], "radius" i figurens enhed, "label" fx "r = 3 cm".
  - segment: to punkter, fx en højde (dashed = true) med målet i sideLabels[0].
  - "grid" = true giver kvadratnet med 1 enhed pr. tern (til opgaver, hvor eleven tæller tern); brug da hele koordinater.
  - Alle mål, eleven skal bruge, skal stå på figuren eller i teksten. "caption" kan være tom.
- Sæt "area", "topic" og "difficulty" som i idéen.`

export function tasksPrompt(args: {
  grade: number
  topic: string
  items: PlanItem[]
  siblings: string[]
  progression: string
}): { system: string; user: string } {
  const system = `Du er en erfaren dansk matematiklærer og opgaveforfatter i folkeskolen. Du skriver færdige opgaver ud fra en plan. Lav præcis én opgave pr. idé, i samme rækkefølge.

${TASK_RULES}`
  const ideas = args.items
    .map(
      (it, i) =>
        `${i + 1}. ${it.title} – ${it.angle} (Sværhedsgrad: ${it.difficulty}; område: ${it.area}; emne: ${it.topic}; figur: ${it.needsFigure ? 'ja' : 'nej'})`,
    )
    .join('\n')
  const user = `Klassetrin: ${args.grade}. klasse
Lærerens emne: ${args.topic}

Idéer, der skal skrives som opgaver (${args.items.length} stk.):
${ideas}

Andre opgaver i samme sæt (gentag dem ikke): ${args.siblings.join('; ') || 'ingen'}

Progression:
${args.progression}`
  return { system, user }
}

export function repairPrompt(problems: string): string {
  return `Kontrollen fandt fejl i opgaverne nedenfor. Ret fejlene og returnér de rettede opgaver i samme rækkefølge og samme format. Bevar alt, der er korrekt.

Fejl:
${problems}`
}
