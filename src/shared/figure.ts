import { compile } from './calc'
import type { Axes, Figure } from './domain'

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
  if (fig.axes) return layoutGraph(fig, fig.axes, maxW, maxH, fontSize)
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
  if (fig.axes) return graphProblems(fig, fig.axes)
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

const fmtTick = (v: number) => String(Math.round(v * 1e6) / 1e6).replace('.', ',')

/** Coordinate-system figures: axes with ticks, function graphs, points, segments and polygons. */
function layoutGraph(fig: Figure, ax: Axes, maxW: number, maxH: number, fontSize: number): FigureLayout {
  const padL = fontSize * 3.2
  const padR = fontSize * 2
  const padT = fontSize * 1.6
  const padB = fontSize * 2.2
  const w = Math.min(maxW, 380) - padL - padR
  const h = Math.min(maxH, 300) - padT - padB
  const sx = w / (ax.xMax - ax.xMin)
  const sy = h / (ax.yMax - ax.yMin)
  const X = (x: number) => padL + (x - ax.xMin) * sx
  const Y = (y: number) => padT + (ax.yMax - y) * sy
  const prims: Prim[] = []
  const small = fontSize * 0.85
  // keep ticks readable: at most ~16 per axis
  const step = (range: number, st: number) => {
    let s = st
    while (range / s > 16) s *= 2
    return s
  }
  const xs = step(ax.xMax - ax.xMin, ax.xStep)
  const ys = step(ax.yMax - ax.yMin, ax.yStep)
  const ticks = (min: number, max: number, st: number) => {
    const out: number[] = []
    for (let v = Math.ceil(min / st - 1e-9) * st; v <= max + 1e-9; v += st) out.push(Math.round(v * 1e9) / 1e9)
    return out
  }
  if (fig.grid) {
    for (const x of ticks(ax.xMin, ax.xMax, xs)) prims.push({ k: 'gridline', x1: X(x), y1: Y(ax.yMin), x2: X(x), y2: Y(ax.yMax) })
    for (const y of ticks(ax.yMin, ax.yMax, ys)) prims.push({ k: 'gridline', x1: X(ax.xMin), y1: Y(y), x2: X(ax.xMax), y2: Y(y) })
  }
  const x0 = ax.xMin <= 0 && ax.xMax >= 0 ? 0 : ax.xMin // where the y-axis stands
  const y0 = ax.yMin <= 0 && ax.yMax >= 0 ? 0 : ax.yMin // where the x-axis lies
  const arrow = (x: number, y: number, dx: number, dy: number) =>
    prims.push({ k: 'poly', pts: [[x - dx * 6 - dy * 3.5, y - dy * 6 + dx * 3.5], [x, y], [x - dx * 6 + dy * 3.5, y - dy * 6 - dx * 3.5]], closed: false, dashed: false, weight: 1 })
  prims.push({ k: 'poly', pts: [[X(ax.xMin), Y(y0)], [X(ax.xMax) + 8, Y(y0)]], closed: false, dashed: false, weight: 1 })
  arrow(X(ax.xMax) + 8, Y(y0), 1, 0)
  prims.push({ k: 'poly', pts: [[X(x0), Y(ax.yMin)], [X(x0), Y(ax.yMax) - 8]], closed: false, dashed: false, weight: 1 })
  arrow(X(x0), Y(ax.yMax) - 8, 0, -1)
  prims.push({ k: 'text', x: X(ax.xMax) + 10, y: Y(y0) + small * 1.4, s: ax.xLabel || 'x', anchor: 'end' })
  prims.push({ k: 'text', x: X(x0) + 6, y: Y(ax.yMax) - 2, s: ax.yLabel || 'y', anchor: 'start' })
  for (const x of ticks(ax.xMin, ax.xMax, xs)) {
    if (Math.abs(x - x0) < 1e-9 && x0 === 0) continue
    prims.push({ k: 'poly', pts: [[X(x), Y(y0) - 3], [X(x), Y(y0) + 3]], closed: false, dashed: false, weight: 0.8 })
    prims.push({ k: 'text', x: X(x), y: Y(y0) + small * 1.35, s: fmtTick(x), anchor: 'middle' })
  }
  for (const y of ticks(ax.yMin, ax.yMax, ys)) {
    if (Math.abs(y - y0) < 1e-9 && y0 === 0) continue
    prims.push({ k: 'poly', pts: [[X(x0) - 3, Y(y)], [X(x0) + 3, Y(y)]], closed: false, dashed: false, weight: 0.8 })
    prims.push({ k: 'text', x: X(x0) - 5, y: Y(y) + small * 0.35, s: fmtTick(y), anchor: 'end' })
  }
  if (x0 === 0 && y0 === 0) prims.push({ k: 'text', x: X(0) - 5, y: Y(0) + small * 1.35, s: '0', anchor: 'end' })

  for (const s of fig.shapes) {
    if (s.kind === 'function' && s.expression) {
      let f: (x: number) => number
      try {
        f = compile(s.expression, true)
      } catch {
        continue
      }
      const N = 300
      let run: [number, number][] = []
      const flush = () => {
        if (run.length > 1) prims.push({ k: 'poly', pts: run, closed: false, dashed: s.dashed, weight: 1.5 })
        run = []
      }
      let lastInside: [number, number] | null = null
      for (let i = 0; i <= N; i++) {
        const x = ax.xMin + ((ax.xMax - ax.xMin) * i) / N
        let y: number
        try {
          y = f(x)
        } catch {
          y = Number.NaN
        }
        if (Number.isFinite(y) && y >= ax.yMin && y <= ax.yMax) {
          run.push([X(x), Y(y)])
          lastInside = [X(x), Y(y)]
        } else flush()
      }
      flush()
      if (s.label.trim() && lastInside) prims.push({ k: 'text', x: lastInside[0] + 4, y: lastInside[1] - 6, s: s.label.trim(), anchor: 'start' })
    } else if (s.kind === 'point' && s.points[0]) {
      const [px, py] = s.points[0]
      prims.push({ k: 'dot', cx: X(px), cy: Y(py) })
      if (s.label.trim()) prims.push({ k: 'text', x: X(px) + 5, y: Y(py) - 6, s: s.label.trim(), anchor: 'start' })
    } else if (s.kind === 'segment' && s.points.length >= 2) {
      const [a, b] = s.points
      prims.push({ k: 'poly', pts: [[X(a[0]), Y(a[1])], [X(b[0]), Y(b[1])]], closed: false, dashed: s.dashed, weight: 1.1 })
      const label = (s.sideLabels[0] || s.label).trim()
      if (label) prims.push({ k: 'text', x: X(b[0]) + 4, y: Y(b[1]) - 4, s: label, anchor: 'start' })
    } else if (s.kind === 'polygon' && s.points.length >= 2) {
      prims.push({ k: 'poly', pts: s.points.map(([x, y]) => [X(x), Y(y)] as [number, number]), closed: true, dashed: s.dashed, weight: 1.3 })
    } else if (s.kind === 'circle' && s.points[0]) {
      // circles stay round only with equal scales; draw with the x-scale
      prims.push({ k: 'circle', cx: X(s.points[0][0]), cy: Y(s.points[0][1]), r: s.radius * sx, dashed: s.dashed })
    }
  }
  return { width: w + padL + padR, height: h + padT + padB, prims, fontSize: small }
}

/** Problems specific to coordinate-system figures. */
function graphProblems(fig: Figure, ax: Axes): string[] {
  const p: string[] = []
  if (!(ax.xMin < ax.xMax) || !(ax.yMin < ax.yMax)) p.push('Koordinatsystemet har ugyldige akser (min skal være mindre end max).')
  if ((ax.xMax - ax.xMin) / ax.xStep > 100 || (ax.yMax - ax.yMin) / ax.yStep > 100) p.push('Koordinatsystemets inddeling er for fin.')
  fig.shapes.forEach((s, i) => {
    const name = `Figurens form ${i + 1}`
    if (s.kind === 'function') {
      try {
        const f = compile(s.expression ?? '', true)
        let inside = 0
        for (let k = 0; k <= 60; k++) {
          const y = f(ax.xMin + ((ax.xMax - ax.xMin) * k) / 60)
          if (Number.isFinite(y) && y >= ax.yMin && y <= ax.yMax) inside++
        }
        if (inside < 3) p.push(`${name}: grafen for ${s.expression} ligger uden for koordinatsystemet.`)
      } catch (e) {
        p.push(`${name}: forskriften "${s.expression}" kan ikke tegnes (${(e as Error).message}).`)
      }
    }
    if (s.kind === 'point' && s.points[0]) {
      const [x, y] = s.points[0]
      if (x < ax.xMin || x > ax.xMax || y < ax.yMin || y > ax.yMax) p.push(`${name}: punktet ligger uden for koordinatsystemet.`)
      const m = /\(\s*(-?\d+(?:,\d+)?)\s*;\s*(-?\d+(?:,\d+)?)\s*\)/.exec(s.label)
      if (m) {
        const lx = Number(m[1].replace(',', '.'))
        const ly = Number(m[2].replace(',', '.'))
        if (Math.abs(lx - x) > 0.01 || Math.abs(ly - y) > 0.01) p.push(`${name}: punktet er mærket "${s.label}", men tegnet i (${fmtTick(x)}; ${fmtTick(y)}).`)
      }
    }
  })
  return p
}
