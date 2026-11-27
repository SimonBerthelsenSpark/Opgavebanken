/**
 * The small maths notation tasks are written in: plain Danish text with a subset of LaTeX.
 * Fractions \frac{a}{b}, binomial coefficients \binom{n}{k}, vectors \vec{a}, powers x^2 / e^{0,5x},
 * indices a_1 / x_{0}, integrals \int_0^2, Greek letters, ≤ ≥ ≠ ≈ ∞ and the usual function names.
 * The same token stream is rendered on screen (HTML) and in the PDFs (drawn by hand), so both agree.
 */

export type MathToken =
  | { t: 'text'; s: string }
  | { t: 'frac'; num: string; den: string }
  | { t: 'binom'; n: string; k: string }
  | { t: 'sup'; s: string }
  | { t: 'sub'; s: string }
  | { t: 'vec'; s: string }

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' }

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π',
  rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', Phi: 'Φ',
}

const COMMANDS: [RegExp, string][] = [
  [/\\left|\\right|\\displaystyle|\\limits/g, ''],
  [/\\[,;:! ]|\\quad|\\qquad/g, ' '],
  [/\\cdot|\\times|⋅/g, '·'],
  [/\\div/g, ':'],
  [/\\approx/g, '≈'],
  [/\\leq?(?![a-z])/g, '≤'],
  [/\\geq?(?![a-z])/g, '≥'],
  [/\\neq?(?![a-z])/g, '≠'],
  [/\\pm/g, '±'],
  [/\\infty/g, '∞'],
  [/\\int(?![a-z])/g, '∫'],
  [/\\sum(?![a-z])/g, 'Σ'],
  [/\\(?:Rightarrow|implies)/g, '⇒'],
  [/\\(?:Leftrightarrow|iff)/g, '⇔'],
  [/\\(?:to|rightarrow)(?![a-z])/g, '→'],
  [/\\in(?![a-z])/g, '∈'],
  [/\\perp/g, '⊥'],
  [/\\parallel/g, '∥'],
  [/\\angle/g, '∠'],
  [/\\mathbb\{R\}/g, 'ℝ'],
  [/\\(?:c|l)?dots/g, '…'],
  [/\^\s*\{?\\circ\}?|\\degree/g, '°'],
  [/\\(ln|log|sin|cos|tan|lim|exp|min|max)(?![a-z])/g, '$1'],
  [/\\(?:text|mathrm|operatorname|mathit)\{([^{}]*)\}/g, '$1'],
  [/\\%/g, '%'],
  [/\\\{/g, '{'],
  [/\\\}/g, '}'],
  [/\$/g, ''],
]

export function normalizeMath(input: string): string {
  let s = input.replace(/\r\n?/g, '\n')
  for (const [re, r] of COMMANDS) s = s.replace(re, r)
  s = s.replace(/\\([A-Za-z]+)/g, (m, name: string) => GREEK[name] ?? m)
  return (
    s
      // f'(x) and f''(x)
      .replace(/([A-Za-z])''(?=\()/g, '$1″')
      .replace(/([A-Za-z])'(?=\()/g, '$1′')
      // simple numeric powers become superscript characters: x^2, cm^2, 10^{-3}
      .replace(/\^\{(-?\d+)\}|\^(-?\d)(?![\d,.])/g, (_m, a?: string, b?: string) => [...(a ?? b ?? '')].map((c) => SUP[c] ?? c).join(''))
      // units written as m2 / cm3 right after a number
      .replace(/(\d\s?(?:mm|cm|dm|m|km))([23])(?![\d])/g, (_m, u: string, p: string) => u + SUP[p])
      // multiplication between numbers written with *
      .replace(/(\d)\s*\*\s*(?=\d)/g, '$1 · ')
  )
}

/** Reads a {group} (with nested braces) or a single character at position i. */
function group(s: string, i: number): [string, number] {
  while (s[i] === ' ') i++
  if (s[i] !== '{') {
    // a run like ^-1, ^x, _12 or a single symbol
    const m = /^-?[0-9A-Za-zα-ωΑ-Ω]+|^./.exec(s.slice(i))
    const run = m ? m[0] : ''
    // for letters take a single character (x^2y = x²·y), digits as a run
    const take = /^-?\d+$/.test(run) ? run : run.slice(0, run.startsWith('-') ? 2 : 1)
    return [take, i + take.length]
  }
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++
    else if (s[j] === '}') {
      depth--
      if (depth === 0) return [s.slice(i + 1, j), j + 1]
    }
  }
  return [s.slice(i + 1), s.length]
}

/** Split text into runs, fractions, binomials, vectors, super- and subscripts. */
export function tokenizeMath(input: string): MathToken[] {
  const s = normalizeMath(input)
  const out: MathToken[] = []
  let buf = ''
  const flush = () => {
    if (buf) out.push({ t: 'text', s: buf })
    buf = ''
  }
  let i = 0
  while (i < s.length) {
    const rest = s.slice(i)
    const cmd = /^\\(d?frac|tfrac|binom|vec|overrightarrow|sqrt)/.exec(rest)
    if (cmd) {
      flush()
      const name = cmd[1]
      let j = i + cmd[0].length
      if (name === 'sqrt') {
        let index = ''
        if (s[j] === '[') {
          const end = s.indexOf(']', j)
          index = s.slice(j + 1, end)
          j = end + 1
        }
        const [arg, k] = group(s, j)
        if (index) out.push({ t: 'sup', s: index })
        buf += /^[\w,.]+$/.test(arg) ? `√${arg}` : `√(${arg})`
        i = k
        continue
      }
      const [a, j2] = group(s, j)
      if (name === 'vec' || name === 'overrightarrow') {
        out.push({ t: 'vec', s: normalizeMath(a) })
        i = j2
        continue
      }
      const [b, j3] = group(s, j2)
      if (name === 'binom') out.push({ t: 'binom', n: normalizeMath(a).trim(), k: normalizeMath(b).trim() })
      else out.push({ t: 'frac', num: normalizeMath(a).trim(), den: normalizeMath(b).trim() })
      i = j3
      continue
    }
    if (s[i] === '_' && (s[i + 1] === '_' || s[i + 1] === ' ' || s[i + 1] === undefined || s[i - 1] === '_' || s[i - 1] === ' ')) {
      // a fill-in blank "____", not an index
      buf += s[i]
      i++
      continue
    }
    if (s[i] === '^' || s[i] === '_') {
      const [a, j] = group(s, i + 1)
      if (a) {
        flush()
        out.push({ t: s[i] === '^' ? 'sup' : 'sub', s: plain(a) })
        i = j
        continue
      }
    }
    buf += s[i]
    i++
  }
  flush()
  return out
}

/** Flattens notation inside a super-/subscript or a fraction part. */
function plain(s: string): string {
  return tokenizeMath(s)
    .map((t) =>
      t.t === 'text' || t.t === 'sup' || t.t === 'sub' || t.t === 'vec'
        ? t.s
        : t.t === 'frac'
          ? `${t.num}/${t.den}`
          : `K(${t.n},${t.k})`,
    )
    .join('')
}

/** Plain-text version (for search and places where notation cannot be drawn). */
export function plainMath(input: string): string {
  return tokenizeMath(input)
    .map((t) =>
      t.t === 'text' || t.t === 'vec'
        ? t.s
        : t.t === 'sup'
          ? `^${t.s}`
          : t.t === 'sub'
            ? `_${t.s}`
            : t.t === 'frac'
              ? `${t.num}/${t.den}`
              : `K(${t.n},${t.k})`,
    )
    .join('')
}
