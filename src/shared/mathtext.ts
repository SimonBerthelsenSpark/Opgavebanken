/**
 * The tiny maths notation tasks are written in. The model (and the teacher) write plain Danish text
 * with fractions as \frac{a}{b}; units and powers like cm^2 become cm². The same token stream is
 * rendered on screen (stacked fractions in HTML) and in the PDFs (stacked fractions drawn by hand),
 * so both look the same.
 */

export type MathToken = { t: 'text'; s: string } | { t: 'frac'; num: string; den: string }

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' }

export function normalizeMath(input: string): string {
  return (
    input
      .replace(/\r\n?/g, '\n')
      .replace(/\$/g, '')
      .replace(/\\cdot|\\times|⋅/g, '·')
      .replace(/\\div/g, ':')
      .replace(/\\pi/g, 'π')
      .replace(/\\approx/g, '≈')
      .replace(/\\leq?/g, '≤')
      .replace(/\\geq?/g, '≥')
      .replace(/\\sqrt\{([^{}]*)\}/g, (_m, a: string) => (/^[\w,.]+$/.test(a) ? `√${a}` : `√(${a})`))
      .replace(/\\(?:text|mathrm)\{([^{}]*)\}/g, '$1')
      .replace(/\\%/g, '%')
      // powers: x^2, cm^2, 10^{-3}
      .replace(/\^\{(-?\d+)\}|\^(-?\d)/g, (_m, a?: string, b?: string) =>
        [...(a ?? b ?? '')].map((c) => SUP[c] ?? c).join(''),
      )
      // units written as m2 / cm3 right after a number
      .replace(/(\d\s?(?:mm|cm|dm|m|km))([23])(?![\d])/g, (_m, u: string, p: string) => u + SUP[p])
      // multiplication between numbers written with * or x
      .replace(/(\d)\s*\*\s*(?=\d)/g, '$1 · ')
  )
}

/** Split normalized text into text runs and stacked fractions. */
export function tokenizeMath(input: string): MathToken[] {
  const s = normalizeMath(input)
  const out: MathToken[] = []
  const re = /\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g
  let last = 0
  for (const m of s.matchAll(re)) {
    if (m.index > last) out.push({ t: 'text', s: s.slice(last, m.index) })
    out.push({ t: 'frac', num: m[1].trim(), den: m[2].trim() })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ t: 'text', s: s.slice(last) })
  return out
}

/** Plain-text version (for search and for places where fractions cannot be stacked). */
export function plainMath(input: string): string {
  return tokenizeMath(input)
    .map((t) => (t.t === 'text' ? t.s : `${t.num}/${t.den}`))
    .join('')
}
