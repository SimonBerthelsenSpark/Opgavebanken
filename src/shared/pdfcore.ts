import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib'
import { type SavedSet, type Task, partLabel, taskPoints } from './domain'
import { layoutFigure } from './figure'
import { levelLabel } from './levels'
import { tokenizeMath } from './mathtext'

/**
 * The three A4 PDFs for a saved set. Everything is drawn from the same frozen snapshot, so numbering
 * and points agree across the student sheet, the marking guide and the point table.
 * Text is laid out by hand: stacked fractions, superscripts the font lacks, and blocks that keep a
 * task's heading, text and figure together on one page.
 */

export interface FontBytes {
  regular: Uint8Array | ArrayBuffer
  bold: Uint8Array | ArrayBuffer
}

const A4: [number, number] = [595.28, 841.89]
const M = 50 // margin
const INK = rgb(0.07, 0.09, 0.12)
const SOFT = rgb(0.33, 0.36, 0.4)
const LINE = rgb(0.72, 0.74, 0.77)
const BAND = rgb(0.95, 0.955, 0.965)

const SUP_PLAIN: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' }
const REPLACE: [RegExp, string][] = [
  [/∠/g, 'vinkel '],
  [/△/g, 'trekant '],
  [/[   ]/g, ' '],
  [/\t/g, '  '],
]

type Seg = { s: string; sup: boolean }
type Run =
  | { t: 'word'; segs: Seg[]; font: PDFFont; size: number; w: number }
  | { t: 'space'; w: number }
  | { t: 'frac'; num: string; den: string; font: PDFFont; size: number; w: number }
  | { t: 'br' }
interface Line {
  runs: Run[]
  height: number
  frac: boolean
}

class Writer {
  page!: PDFPage
  y = 0
  readonly width = A4[0] - 2 * M
  private charset: Set<number>
  constructor(
    readonly pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.charset = new Set(regular.getCharacterSet().filter((c) => bold.getCharacterSet().includes(c)))
    this.newPage()
  }

  newPage() {
    this.page = this.pdf.addPage(A4)
    this.y = A4[1] - M
  }

  /** Start a new page unless `h` fits. Returns true when a page was added. */
  ensure(h: number): boolean {
    if (this.y - h < M + 20 && this.y < A4[1] - M - 1) {
      this.newPage()
      return true
    }
    return false
  }

  clean(s: string): Seg[] {
    let t = s
    for (const [re, r] of REPLACE) t = t.replace(re, r)
    const segs: Seg[] = []
    for (const ch of t) {
      const cp = ch.codePointAt(0) as number
      let piece: Seg
      if (this.charset.has(cp)) piece = { s: ch, sup: false }
      else if (SUP_PLAIN[ch]) piece = { s: SUP_PLAIN[ch], sup: true }
      else piece = { s: '?', sup: false }
      const last = segs[segs.length - 1]
      if (last && last.sup === piece.sup) last.s += piece.s
      else segs.push(piece)
    }
    return segs
  }

  segWidth(segs: Seg[], font: PDFFont, size: number) {
    return segs.reduce((w, g) => w + font.widthOfTextAtSize(g.s, g.sup ? size * 0.65 : size), 0)
  }

  textWidth(s: string, font: PDFFont, size: number) {
    return this.segWidth(this.clean(s), font, size)
  }

  /** Break text with fractions into lines of at most maxW. */
  layout(text: string, font: PDFFont, size: number, maxW: number): Line[] {
    const runs: Run[] = []
    for (const tok of tokenizeMath(text)) {
      if (tok.t === 'frac') {
        const fs = size * 0.8
        const w = Math.max(this.textWidth(tok.num, font, fs), this.textWidth(tok.den, font, fs)) + 3
        runs.push({ t: 'frac', num: tok.num, den: tok.den, font, size, w })
        continue
      }
      for (const piece of tok.s.split(/(\n| +)/)) {
        if (!piece) continue
        if (piece === '\n') runs.push({ t: 'br' })
        else if (/^ +$/.test(piece)) runs.push({ t: 'space', w: font.widthOfTextAtSize(' ', size) * piece.length })
        else {
          const segs = this.clean(piece)
          runs.push({ t: 'word', segs, font, size, w: this.segWidth(segs, font, size) })
        }
      }
    }
    const lines: Line[] = []
    let cur: Run[] = []
    let w = 0
    const push = () => {
      while (cur.length && cur[cur.length - 1].t === 'space') cur.pop()
      const frac = cur.some((r) => r.t === 'frac')
      lines.push({ runs: cur, frac, height: size * (frac ? 2.35 : 1.38) })
      cur = []
      w = 0
    }
    for (const r of runs) {
      if (r.t === 'br') {
        push()
        continue
      }
      if (r.t === 'space' && cur.length === 0) continue
      const rw = r.w
      // a word directly attached to a fraction (e.g. "2\frac{1}{3}") moves with it
      if (w + rw > maxW && cur.length && r.t !== 'space') push()
      cur.push(r)
      w += rw
    }
    if (cur.length || !lines.length) push()
    return lines
  }

  height(lines: Line[]) {
    return lines.reduce((h, l) => h + l.height, 0)
  }

  drawLines(lines: Line[], x: number, color = INK) {
    for (const line of lines) {
      const size = line.runs.find((r): r is Exclude<Run, { t: 'br' } | { t: 'space' }> => r.t === 'word' || r.t === 'frac')?.size ?? 11
      const base = this.y - (line.frac ? size * 1.5 : size * 1.0)
      let cx = x
      for (const r of line.runs) {
        if (r.t === 'space') cx += r.w
        else if (r.t === 'word') {
          for (const g of r.segs) {
            const fs = g.sup ? r.size * 0.65 : r.size
            this.page.drawText(g.s, { x: cx, y: base + (g.sup ? r.size * 0.38 : 0), size: fs, font: r.font, color })
            cx += r.font.widthOfTextAtSize(g.s, fs)
          }
        } else if (r.t === 'frac') {
          const fs = r.size * 0.8
          const bar = base + r.size * 0.3
          const nw = this.textWidth(r.num, r.font, fs)
          const dw = this.textWidth(r.den, r.font, fs)
          this.drawSegs(this.clean(r.num), cx + (r.w - nw) / 2, bar + 2.2, r.font, fs, color)
          this.drawSegs(this.clean(r.den), cx + (r.w - dw) / 2, bar - fs * 0.78, r.font, fs, color)
          this.page.drawLine({ start: { x: cx + 0.5, y: bar }, end: { x: cx + r.w - 0.5, y: bar }, thickness: 0.7, color })
          cx += r.w
        }
      }
      this.y -= line.height
    }
  }

  private drawSegs(segs: Seg[], x: number, y: number, font: PDFFont, size: number, color = INK) {
    let cx = x
    for (const g of segs) {
      const fs = g.sup ? size * 0.65 : size
      this.page.drawText(g.s, { x: cx, y: y + (g.sup ? size * 0.38 : 0), size: fs, font, color })
      cx += font.widthOfTextAtSize(g.s, fs)
    }
  }

  /** A single line of plain text; anchor right when `right` is set. */
  text(s: string, x: number, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; right?: boolean; y?: number } = {}) {
    const font = opts.font ?? this.regular
    const size = opts.size ?? 11
    const segs = this.clean(s)
    const w = this.segWidth(segs, font, size)
    this.drawSegs(segs, opts.right ? x - w : x, opts.y ?? this.y - size, font, size, opts.color ?? INK)
  }

  hline(y: number, x1 = M, x2 = A4[0] - M, color = LINE, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color })
  }

  figure(task: Task, maxW: number, maxH: number, withNote: boolean): { h: number; draw: () => void } {
    const fig = task.figure
    if (!fig) return { h: 0, draw: () => {} }
    const l = layoutFigure(fig, maxW, maxH, 10)
    const note = withNote && !fig.grid ? 'Figuren er ikke målfast.' : ''
    const captionLines = [fig.caption, note].filter(Boolean)
    const h = l.height + captionLines.length * 11 + 6
    return {
      h,
      draw: () => {
        const ox = M + (this.width - l.width) / 2
        const top = this.y
        const X = (x: number) => ox + x
        const Y = (y: number) => top - y
        for (const p of l.prims) {
          if (p.k === 'gridline')
            this.page.drawLine({ start: { x: X(p.x1), y: Y(p.y1) }, end: { x: X(p.x2), y: Y(p.y2) }, thickness: 0.4, color: LINE })
          else if (p.k === 'poly') {
            const pts = p.closed ? [...p.pts, p.pts[0]] : p.pts
            for (let i = 0; i < pts.length - 1; i++)
              this.page.drawLine({
                start: { x: X(pts[i][0]), y: Y(pts[i][1]) },
                end: { x: X(pts[i + 1][0]), y: Y(pts[i + 1][1]) },
                thickness: p.weight,
                color: INK,
                dashArray: p.dashed ? [4, 3] : undefined,
                lineCap: 1,
              })
          } else if (p.k === 'circle')
            this.page.drawEllipse({
              x: X(p.cx),
              y: Y(p.cy),
              xScale: p.r,
              yScale: p.r,
              borderColor: INK,
              borderWidth: 1.2,
              borderDashArray: p.dashed ? [4, 3] : undefined,
            })
          else if (p.k === 'dot') this.page.drawCircle({ x: X(p.cx), y: Y(p.cy), size: 1.6, color: INK })
          else {
            const w = this.textWidth(p.s, this.regular, l.fontSize)
            this.text(p.s, X(p.x) - (p.anchor === 'middle' ? w / 2 : p.anchor === 'end' ? w : 0), { size: l.fontSize, y: Y(p.y) })
          }
        }
        this.y -= l.height + 2
        for (const c of captionLines) {
          const w = this.textWidth(c, this.regular, 8.5)
          this.text(c, M + (this.width - w) / 2, { size: 8.5, color: SOFT })
          this.y -= 11
        }
        this.y -= 4
      },
    }
  }

  footer(title: string, label: string) {
    const pages = this.pdf.getPages()
    pages.forEach((p, i) => {
      const s = `${label} · ${title} · Side ${i + 1} af ${pages.length}`
      const segs = this.clean(s)
      const w = this.segWidth(segs, this.regular, 8)
      let cx = (A4[0] - w) / 2
      for (const g of segs) {
        const fs = g.sup ? 8 * 0.65 : 8
        p.drawText(g.s, { x: cx, y: 28, size: fs, font: this.regular, color: SOFT })
        cx += this.regular.widthOfTextAtSize(g.s, fs)
      }
    })
  }
}

/** Grey band with the task heading; long titles wrap instead of running into the right-hand text. */
function taskBand(w: Writer, left: string, right: string, rightSize: number) {
  const rw = right ? w.textWidth(right, w.regular, rightSize) + 12 : 0
  const lines = w.layout(left, w.bold, 12, w.width - rw)
  const h = 6 + lines.length * 15
  w.page.drawRectangle({ x: M - 4, y: w.y - h + 2, width: w.width + 8, height: h, color: BAND })
  if (right) w.text(right, A4[0] - M, { size: rightSize, color: SOFT, right: true, y: w.y - 12 })
  const top = w.y
  w.y -= 1
  for (const line of lines) {
    w.drawLines([{ ...line, height: 15 }], M)
  }
  w.y = top - h - 6
}

function bandHeight(w: Writer, left: string, right: string, rightSize: number) {
  const rw = right ? w.textWidth(right, w.regular, rightSize) + 12 : 0
  return 6 + w.layout(left, w.bold, 12, w.width - rw).length * 15 + 6
}

async function open(fonts: FontBytes, title: string) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  pdf.setTitle(title)
  pdf.setLanguage('da-DK')
  pdf.setCreator('Opgavebanken')
  const regular = await pdf.embedFont(fonts.regular, { subset: true })
  const bold = await pdf.embedFont(fonts.bold, { subset: true })
  return new Writer(pdf, regular, bold)
}

const pts = (n: number) => `${n} ${n === 1 ? 'point' : 'point'}`

function header(w: Writer, heading: string, sub: string) {
  w.text(heading, M, { font: w.bold, size: 18 })
  w.y -= 24
  if (sub) {
    w.text(sub, M, { size: 11, color: SOFT })
    w.y -= 16
  }
}

function nameFields(w: Writer, fields: [string, number][]) {
  w.y -= 8
  let x = M
  const base = w.y - 11
  for (const [label, len] of fields) {
    w.text(`${label}:`, x, { size: 11, y: base })
    const lx = x + w.textWidth(`${label}:`, w.regular, 11) + 4
    w.hline(base - 2, lx, lx + len, INK, 0.6)
    x = lx + len + 16
  }
  w.y -= 26
}

/** 1. The student sheet: no answers, no teacher notes. */
export async function studentPdf(set: SavedSet, fonts: FontBytes): Promise<Uint8Array> {
  const w = await open(fonts, set.title)
  const total = set.tasks.reduce((s, t) => s + taskPoints(t), 0)
  header(w, set.title, '')
  nameFields(w, [
    ['Navn', 210],
    ['Klasse', 50],
    ['Dato', 90],
  ])
  w.text(`Opgavesættet har ${set.tasks.length} opgaver og giver i alt ${pts(total)}.`, M, { size: 10, color: SOFT })
  w.y -= 16
  w.hline(w.y)
  w.y -= 14

  const textX = M + 26
  const textW = w.width - 26 - 46
  set.tasks.forEach((task, i) => {
    const n = i + 1
    const headTitle = `Opgave ${n}  ·  ${task.title}`
    const intro = task.intro ? w.layout(task.intro, w.regular, 11, w.width) : []
    const fig = w.figure(task, w.width, 230, true)
    const headH = bandHeight(w, headTitle, `(${pts(taskPoints(task))})`, 10) + w.height(intro) + (intro.length ? 4 : 0) + fig.h

    const parts = task.parts.map((p, j) => {
      const q = w.layout(p.question, w.regular, 11, textW)
      const lines = Math.min(9, 2 + 2 * p.points)
      return { p, j, q, lines, h: w.height(q) + 6 + lines * 20 + 8 }
    })

    // keep heading, text, figure and the first question together
    const first = parts[0]
    const firstQ = first ? w.height(first.q) + 26 : 0
    w.ensure(headH + firstQ)
    taskBand(w, headTitle, `(${pts(taskPoints(task))})`, 10)
    if (intro.length) {
      w.drawLines(intro, M)
      w.y -= 4
    }
    fig.draw()

    for (const part of parts) {
      w.ensure(Math.min(part.h, w.height(part.q) + 6 + 3 * 20))
      const top = w.y
      const base = top - (part.q[0]?.frac ? 11 * 1.5 : 11)
      w.text(partLabel(n, part.j, task.parts.length), M, { font: w.bold, size: 11, y: base })
      w.text(`(${part.p.points} p)`, A4[0] - M, { size: 10, color: SOFT, right: true, y: base })
      w.drawLines(part.q, textX)
      w.y = Math.min(w.y, top - 14) - 6
      for (let k = 0; k < part.lines; k++) {
        if (w.ensure(20)) w.y -= 4
        w.y -= 20
        w.hline(w.y, textX, A4[0] - M, LINE, 0.5)
      }
      w.y -= 10
    }
    w.y -= 6
  })
  w.footer(set.title, 'Elevark')
  return w.pdf.save()
}

/** 2. The marking guide with the same numbering, answers, solutions and partial-credit criteria. */
export async function teacherPdf(set: SavedSet, fonts: FontBytes): Promise<Uint8Array> {
  const w = await open(fonts, `Rettevejledning – ${set.title}`)
  const total = set.tasks.reduce((s, t) => s + taskPoints(t), 0)
  header(w, 'Rettevejledning', set.title)
  w.text(`Maksimalt ${pts(total)}. Kun til læreren – udleveres ikke til eleverne.`, M, { size: 10, color: SOFT })
  w.y -= 16
  w.hline(w.y)
  w.y -= 14

  const ix = M + 26
  const iw = w.width - 26
  set.tasks.forEach((task, i) => {
    const n = i + 1
    const intro = task.intro ? w.layout(task.intro, w.regular, 9.5, w.width) : []
    const fig = w.figure(task, w.width, 140, false)
    const head = `Opgave ${n}  ·  ${task.title}`
    const meta = `${pts(taskPoints(task))} · ${levelLabel(task, true)} · ${task.topic} · ${task.difficulty}`
    w.ensure(bandHeight(w, head, meta, 9) + w.height(intro) + fig.h + 60)
    taskBand(w, head, meta, 9)
    if (intro.length) {
      w.drawLines(intro, M, SOFT)
      w.y -= 4
    }
    fig.draw()

    task.parts.forEach((p, j) => {
      const q = w.layout(p.question, w.regular, 9.5, iw)
      const ans = w.layout(p.answer, w.bold, 11, iw - 44)
      const sol = w.layout(p.solution, w.regular, 10, iw)
      const crits = p.criteria.map((c) => w.layout(`${c.points} p: ${c.description}`, w.regular, 10, iw - 10))
      const h = w.height(q) + w.height(ans) + 14 + w.height(sol) + 14 + crits.reduce((s, c) => s + w.height(c), 0) + 16
      w.ensure(Math.min(h, 400))
      const top = w.y
      const base = top - (q[0]?.frac ? 9.5 * 1.5 : 9.5)
      w.text(partLabel(n, j, task.parts.length), M, { font: w.bold, size: 11, y: base })
      w.text(`${p.points} p`, A4[0] - M, { size: 10, right: true, y: base })
      w.drawLines(q, ix, SOFT)
      w.y = Math.min(w.y, top - 14) - 2
      const fy = w.y
      w.text('Facit:', ix, { font: w.bold, size: 10, color: SOFT, y: fy - 11 })
      w.drawLines(ans, ix + 44)
      w.y -= 3
      w.text('Løsningsforslag', ix, { font: w.bold, size: 9, color: SOFT })
      w.y -= 12
      w.drawLines(sol, ix)
      w.y -= 3
      w.text('Point (delpoint lægges sammen)', ix, { font: w.bold, size: 9, color: SOFT })
      w.y -= 12
      for (const c of crits) {
        w.text('•', ix, { size: 10, y: w.y - 10 })
        w.drawLines(c, ix + 10)
      }
      w.y -= 10
    })
    w.y -= 6
  })
  w.footer(set.title, 'Rettevejledning')
  return w.pdf.save()
}

export interface PointRow {
  label: string
  title: string
  max: number
}

export function pointRows(set: SavedSet): PointRow[] {
  return set.tasks.flatMap((t, i) =>
    t.parts.map((p, j) => ({ label: partLabel(i + 1, j, t.parts.length), title: j === 0 ? t.title : '', max: p.points })),
  )
}

/** 3. A printable point table: one row per task or sub-question, max points, empty score, total. */
export async function pointTablePdf(set: SavedSet, fonts: FontBytes): Promise<Uint8Array> {
  const w = await open(fonts, `Pointtabel – ${set.title}`)
  header(w, 'Pointtabel', set.title)
  nameFields(w, [
    ['Elevens navn', 230],
    ['Klasse', 60],
  ])
  const rows = pointRows(set)
  const total = rows.reduce((s, r) => s + r.max, 0)
  const cols = [M, M + 60, M + w.width - 190, M + w.width - 95, M + w.width]
  const RH = 24

  const head = () => {
    w.page.drawRectangle({ x: M, y: w.y - RH, width: w.width, height: RH, color: BAND })
    const by = w.y - RH + 8
    w.text('Opgave', cols[0] + 8, { font: w.bold, size: 10, y: by })
    w.text('Titel', cols[1] + 8, { font: w.bold, size: 10, y: by })
    w.text('Maks. point', cols[3] - 8, { font: w.bold, size: 10, right: true, y: by })
    w.text('Opnåede point', cols[4] - 8, { font: w.bold, size: 10, right: true, y: by })
    w.hline(w.y, M, M + w.width, INK, 0.8)
    w.y -= RH
    w.hline(w.y, M, M + w.width, INK, 0.8)
  }
  const verticals = (top: number, bottom: number) => {
    for (const x of cols) w.page.drawLine({ start: { x, y: top }, end: { x, y: bottom }, thickness: 0.6, color: INK })
  }
  const fit = (s: string, max: number) => {
    let t = s
    while (t && w.textWidth(t, w.regular, 10) > max) t = t.slice(0, -2)
    return t === s ? s : `${t.trimEnd()}…`
  }

  let top = w.y
  head()
  for (const r of rows) {
    if (w.y - RH < M + 60) {
      verticals(top, w.y)
      w.newPage()
      top = w.y
      head()
    }
    const by = w.y - RH + 8
    w.text(r.label, cols[0] + 8, { font: w.bold, size: 10, y: by })
    if (r.title) w.text(fit(r.title, cols[2] - cols[1] - 12), cols[1] + 8, { size: 10, y: by })
    w.text(String(r.max), cols[3] - 8, { size: 10, right: true, y: by })
    w.y -= RH
    w.hline(w.y, M, M + w.width, LINE, 0.5)
  }
  w.hline(w.y, M, M + w.width, INK, 1.2)
  const by = w.y - RH + 8
  w.text('I alt', cols[0] + 8, { font: w.bold, size: 11, y: by })
  w.text(String(total), cols[3] - 8, { font: w.bold, size: 11, right: true, y: by })
  w.y -= RH
  w.hline(w.y, M, M + w.width, INK, 1.2)
  verticals(top, w.y)
  w.footer(set.title, 'Pointtabel')
  return w.pdf.save()
}
