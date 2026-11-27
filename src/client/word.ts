import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  LeaderType,
  Math as DocxMath,
  MathFraction,
  MathRun,
  Packer,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
} from 'docx'
import { estMinutes, type Figure, partLabel, type SavedSet, taskPoints } from '../shared/domain'
import { figureSvg } from '../shared/figure'
import { tokenizeMath } from '../shared/mathtext'

/**
 * Word (.docx) versions of the student sheet and the marking guide, so teachers can edit wording,
 * add the school logo or reuse tasks. Fractions become real Word equations; figures become images.
 */

type Run = TextRun | DocxMath

function runs(text: string, opts: { bold?: boolean; size?: number; color?: string } = {}): Run[] {
  const base = { bold: opts.bold, size: opts.size, color: opts.color, font: 'Arial' }
  const out: Run[] = []
  for (const tok of tokenizeMath(text)) {
    if (tok.t === 'text') {
      tok.s.split('\n').forEach((line, i) => out.push(new TextRun({ ...base, text: line, break: i > 0 ? 1 : undefined })))
    } else if (tok.t === 'sup') out.push(new TextRun({ ...base, text: tok.s, superScript: true }))
    else if (tok.t === 'sub') out.push(new TextRun({ ...base, text: tok.s, subScript: true }))
    else if (tok.t === 'vec') out.push(new TextRun({ ...base, text: `${tok.s}⃗` }))
    else if (tok.t === 'binom') out.push(new TextRun({ ...base, text: `K(${tok.n},${tok.k})` }))
    else out.push(new DocxMath({ children: [new MathFraction({ numerator: [new MathRun(tok.num)], denominator: [new MathRun(tok.den)] })] }))
  }
  return out
}

const para = (children: Run[], extra: Record<string, unknown> = {}) => new Paragraph({ children, spacing: { after: 120 }, ...extra })

async function figureImage(fig: Figure, maxW: number, maxH: number): Promise<Paragraph> {
  const { svg, width, height } = figureSvg(fig, maxW, maxH)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width * 2
  canvas.height = height * 2
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  ctx.scale(2, 2)
  ctx.drawImage(img, 0, 0)
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b as Blob), 'image/png'))
  const data = new Uint8Array(await blob.arrayBuffer())
  const notes = [fig.caption, fig.grid || fig.axes ? '' : 'Figuren er ikke målfast.'].filter(Boolean).join(' ')
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [
      new ImageRun({ type: 'png', data, transformation: { width: Math.round(width * 0.9), height: Math.round(height * 0.9) } }),
      ...(notes ? [new TextRun({ text: notes, break: 1, size: 16, color: '5D6875', font: 'Arial' })] : []),
    ],
  })
}

function taskHeading(text: string, right: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    shading: { fill: 'F2F3F5' },
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, font: 'Arial', color: '1E2B3A' }), new TextRun({ text: `\t${right}`, size: 20, color: '5D6875', font: 'Arial' })],
  })
}

// a full-width writing line (a tab with an underscore leader; borders on empty paragraphs merge in Word)
const answerLine = () =>
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: LeaderType.UNDERSCORE }],
    spacing: { before: 200 },
    children: [new TextRun({ text: '\t', color: 'C5CBD2', font: 'Arial' })],
  })

export async function studentDocx(set: SavedSet): Promise<Blob> {
  const total = set.tasks.reduce((s, t) => s + taskPoints(t), 0)
  const minutes = set.tasks.reduce((m, t) => m + estMinutes(t), 0)
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: set.title, bold: true, size: 36, font: 'Arial' })] }),
    para([new TextRun({ text: 'Navn: ______________________   Klasse: ______   Dato: ______________', size: 22, font: 'Arial' })]),
    para([new TextRun({ text: `Opgavesættet har ${set.tasks.length} opgaver og giver i alt ${total} point. Forventet tid: ca. ${minutes} minutter.`, size: 20, color: '5D6875', font: 'Arial' })]),
  ]
  for (const [i, t] of set.tasks.entries()) {
    children.push(taskHeading(`Opgave ${i + 1} · ${t.title}`, `(${taskPoints(t)} point)`))
    if (t.intro) children.push(para(runs(t.intro, { size: 22 })))
    if (t.figure) children.push(await figureImage(t.figure, 420, 300))
    t.parts.forEach((p, j) => {
      children.push(
        para([new TextRun({ text: `${partLabel(i + 1, j, t.parts.length)}\t`, bold: true, size: 22, font: 'Arial' }), ...runs(p.question, { size: 22 }), new TextRun({ text: `   (${p.points} p)`, size: 18, color: '5D6875', font: 'Arial' })], {
          spacing: { before: 160, after: 60 },
        }),
      )
      for (let k = 0; k < Math.min(9, 2 + 2 * p.points); k++) children.push(answerLine())
    })
  }
  return Packer.toBlob(new Document({ creator: 'Opgavebanken', title: set.title, sections: [{ children }] }))
}

export async function teacherDocx(set: SavedSet): Promise<Blob> {
  const total = set.tasks.reduce((s, t) => s + taskPoints(t), 0)
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Rettevejledning', bold: true, size: 36, font: 'Arial' })] }),
    para([new TextRun({ text: set.title, size: 24, font: 'Arial' })]),
    para([new TextRun({ text: `Maksimalt ${total} point. Kun til læreren – udleveres ikke til eleverne.`, size: 20, color: '5D6875', font: 'Arial' })]),
  ]
  for (const [i, t] of set.tasks.entries()) {
    children.push(taskHeading(`Opgave ${i + 1} · ${t.title}`, `${taskPoints(t)} point · ${t.topic} · ${t.difficulty}`))
    if (t.intro) children.push(para(runs(t.intro, { size: 20, color: '5D6875' })))
    if (t.figure) children.push(await figureImage(t.figure, 300, 200))
    t.parts.forEach((p, j) => {
      const label = partLabel(i + 1, j, t.parts.length)
      children.push(para([new TextRun({ text: `${label}\t`, bold: true, size: 22, font: 'Arial' }), ...runs(p.question, { size: 20, color: '5D6875' }), new TextRun({ text: `   ${p.points} p`, size: 20, font: 'Arial' })], { spacing: { before: 160, after: 60 } }))
      children.push(para([new TextRun({ text: 'Facit: ', bold: true, size: 20, color: '5D6875', font: 'Arial' }), ...runs(p.answer, { bold: true, size: 22 })]))
      children.push(para([new TextRun({ text: 'Løsningsforslag: ', bold: true, size: 20, color: '5D6875', font: 'Arial' }), ...runs(p.solution, { size: 20 })]))
      for (const c of p.criteria) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: `${c.points} p: `, bold: true, size: 20, font: 'Arial' }), ...runs(c.description, { size: 20 })] }))
    })
  }
  return Packer.toBlob(new Document({ creator: 'Opgavebanken', title: `Rettevejledning – ${set.title}`, sections: [{ children }] }))
}
