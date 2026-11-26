import type { Figure } from './domain'

/**
 * Figures are described as data (shapes with coordinates in the task's unit) so that the server can
 * check the stated measures against the geometry, and the same drawing can be rendered as SVG on
 * screen and as vector graphics in the PDF.
 */

export type Prim =
  | { k: 'poly'; pts: [number, number][]; closed: boolean; dashed: boolean; weight: number }
  | { k: 'circle'; cx: number; cy: number; r: number; dashed: boolean }
  | { k: 'dot'; cx: number; cy: number }
  | { k: 'text'; x: number; y: number; s: string; anchor: 'start' | 'middle' | 'end' }
  | { k: 'gridline'; x1: number; y1: number; x2: number; y2: number }

export interface FigureLayout {
  width: number
  height: number
  prims: Prim[]
  fontSize: number
}

const PAD = 30

function bbox(fig: Figure) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const s of fig.shapes) {
    if (s.kind === 'circle' && s.points[0]) {
      const [cx, cy] = s.points[0]
      add(cx - s.radius, cy - s.radius)
      add(cx + s.radius, cy + s.radius)
    } else for (const [x, y] of s.points) add(x, y)
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  if (fig.grid) {
    minX = Math.floor(minX)
    minY = Math.floor(minY)
    maxX = Math.ceil(maxX)
    maxY = Math.ceil(maxY)
  }
  return { minX, minY, maxX: Math.max(maxX, minX + 1e-6), maxY: Math.max(maxY, minY + 1e-6) }
}

/** Lay out a figure in a box of at most maxW × maxH (y grows downwards). */
export function layoutFigure(fig: Figure, maxW: number, maxH: number, fontSize = 11): FigureLayout {
  const b = bbox(fig)
  const bw = b.maxX - b.minX
  const bh = b.maxY - b.minY
  // room for the longest label on the left and right of the drawing
  const longest = Math.max(0, ...fig.shapes.flatMap((s) => [...s.sideLabels, s.label].map((l) => l.trim().length)))
  const PX = Math.max(PAD, fontSize * 1.4 + longest * fontSize * 0.62)
  const scale = Math.min((maxW - 2 * PX) / bw, (maxH - 2 * PAD) / bh, 60)
  const width = bw * scale + 2 * PX
  const height = bh * scale + 2 * PAD
  const X = (x: number) => PX + (x - b.minX) * scale
  const Y = (y: number) => PAD + (b.maxY - y) * scale // maths y-up → screen y-down
  const prims: Prim[] = []

  if (fig.grid) {
    for (let x = b.minX; x <= b.maxX + 1e-9; x += 1) prims.push({ k: 'gridline', x1: X(x), y1: Y(b.minY), x2: X(x), y2: Y(b.maxY) })
    for (let y = b.minY; y <= b.maxY + 1e-9; y += 1) prims.push({ k: 'gridline', x1: X(b.minX), y1: Y(y), x2: X(b.maxX), y2: Y(y) })
  }

  // centroid of everything, used to push labels outwards
  const all = fig.shapes.flatMap((s) => s.points)
  const gx = all.length ? all.reduce((a, p) => a + X(p[0]), 0) / all.length : width / 2
  const gy = all.length ? all.reduce((a, p) => a + Y(p[1]), 0) / all.length : height / 2
  const off = fontSize * 1.1
  const textAt = (x: number, y: number, s: string) =>
    prims.push({ k: 'text', x, y: y + fontSize * 0.35, s, anchor: 'middle' })

  for (const s of fig.shapes) {
    const pts = s.points.map(([x, y]) => [X(x), Y(y)] as [number, number])
    if (s.kind === 'polygon' && pts.length >= 2) {
      prims.push({ k: 'poly', pts, closed: true, dashed: s.dashed, weight: 1.4 })
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length
      const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
      // orientation decides which side of an edge is outside (works for concave shapes too)
      const signed = pts.reduce((acc, p, i) => {
        const q = pts[(i + 1) % pts.length]
        return acc + p[0] * q[1] - q[0] * p[1]
      }, 0)
      pts.forEach((a, i) => {
        const label = s.sideLabels[i]?.trim()
        if (!label) return
        const bpt = pts[(i + 1) % pts.length]
        const mx = (a[0] + bpt[0]) / 2
        const my = (a[1] + bpt[1]) / 2
        const len = Math.hypot(bpt[0] - a[0], bpt[1] - a[1]) || 1
        const dir = signed >= 0 ? 1 : -1
        const nx = (dir * (bpt[1] - a[1])) / len
        const ny = (dir * -(bpt[0] - a[0])) / len
        const extra = Math.abs(nx) * label.length * fontSize * 0.25
        textAt(mx + nx * (off + extra), my + ny * off, label)
      })
      for (const v of s.rightAngles) {
        const p = pts[v]
        if (!p) continue
        const prev = pts[(v - 1 + pts.length) % pts.length]
        const next = pts[(v + 1) % pts.length]
        const u1 = unit(p, prev)
        const u2 = unit(p, next)
        const m = 8
        prims.push({
          k: 'poly',
          pts: [
            [p[0] + u1[0] * m, p[1] + u1[1] * m],
            [p[0] + (u1[0] + u2[0]) * m, p[1] + (u1[1] + u2[1]) * m],
            [p[0] + u2[0] * m, p[1] + u2[1] * m],
          ],
          closed: false,
          dashed: false,
          weight: 0.8,
        })
      }
      if (s.label.trim()) textAt(cx, cy, s.label.trim())
    } else if (s.kind === 'segment' && pts.length >= 2) {
      const [a, bpt] = pts
      prims.push({ k: 'poly', pts: [a, bpt], closed: false, dashed: s.dashed, weight: 1.1 })
      const label = (s.sideLabels[0] || s.label).trim()
      if (label) {
        const mx = (a[0] + bpt[0]) / 2
        const my = (a[1] + bpt[1]) / 2
        const len = Math.hypot(bpt[0] - a[0], bpt[1] - a[1]) || 1
        let nx = -(bpt[1] - a[1]) / len
        let ny = (bpt[0] - a[0]) / len
        if (nx * (mx - gx) + ny * (my - gy) < 0) {
          nx = -nx
          ny = -ny
        }
        const extra = Math.abs(nx) * label.length * fontSize * 0.25
        textAt(mx + nx * (off + extra), my + ny * off, label)
      }
    } else if (s.kind === 'circle' && pts[0]) {
      const [cx, cy] = pts[0]
      const r = s.radius * scale
      prims.push({ k: 'circle', cx, cy, r, dashed: s.dashed })
      prims.push({ k: 'dot', cx, cy })
      const label = s.label.trim()
      if (label) {
        prims.push({ k: 'poly', pts: [[cx, cy], [cx + r, cy]], closed: false, dashed: true, weight: 0.9 })
        textAt(cx + r / 2, cy - off * 0.8, label)
      }
    }
  }
  return { width, height, prims, fontSize }
}

function unit(from: [number, number], to: [number, number]): [number, number] {
  const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  return [(to[0] - from[0]) / len, (to[1] - from[1]) / len]
}

const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, dm: 100, m: 1000, km: 1_000_000 }

/** "8 cm" → length in figure units; null when the label is not a plain measure (e.g. "x" or "?"). */
export function parseLength(label: string, figureUnit: string): number | null {
  const m = /^\s*(?:[a-zA-ZæøåÆØÅ]\s*=\s*)?(\d+(?:[.,]\d+)?)\s*(mm|cm|dm|km|m)?\s*$/.exec(label.trim())
  if (!m) return null
  const value = Number(m[1].replace(',', '.'))
  const from = m[2] ?? figureUnit
  const fu = UNIT_MM[figureUnit] ?? 1
  const lu = UNIT_MM[from] ?? fu
  return (value * lu) / fu
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.02 * Math.abs(b), 0.051)

/** Inconsistencies between the drawn geometry and the measures written on it. */
export function figureProblems(fig: Figure): string[] {
  const problems: string[] = []
  fig.shapes.forEach((s, si) => {
    const name = `Figurens form ${si + 1}`
    if (s.kind === 'polygon') {
      if (s.points.length < 3) problems.push(`${name}: en polygon skal have mindst 3 hjørner.`)
      s.points.forEach((a, i) => {
        const label = s.sideLabels[i]
        if (!label) return
        const b = s.points[(i + 1) % s.points.length]
        const stated = parseLength(label, fig.unit)
        if (stated === null) return
        const actual = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (!close(actual, stated))
          problems.push(`${name}: siden mærket "${label}" er ${round(actual)} ${fig.unit} lang i tegningen.`)
      })
    } else if (s.kind === 'segment') {
      if (s.points.length !== 2) problems.push(`${name}: et linjestykke skal have præcis 2 punkter.`)
      else {
        const label = s.sideLabels[0] || s.label
        const stated = label ? parseLength(label, fig.unit) : null
        const [a, b] = s.points
        const actual = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (stated !== null && !close(actual, stated))
          problems.push(`${name}: linjestykket mærket "${label}" er ${round(actual)} ${fig.unit} langt i tegningen.`)
      }
    } else if (s.kind === 'circle') {
      if (s.points.length < 1 || s.radius <= 0) problems.push(`${name}: en cirkel skal have centrum og radius.`)
      const m = /^\s*([rd])\s*=\s*(.+)$/i.exec(s.label)
      if (m) {
        const stated = parseLength(m[2], fig.unit)
        const actual = m[1].toLowerCase() === 'd' ? 2 * s.radius : s.radius
        if (stated !== null && !close(actual, stated))
          problems.push(`${name}: cirklen er mærket "${s.label}", men er tegnet med radius ${round(s.radius)}.`)
      }
    }
  })
  return problems
}

const round = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')
