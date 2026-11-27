/**
 * A small, safe arithmetic evaluator used to re-check the model's answers and to draw graphs.
 * Supports numbers (comma or point decimals), + - * / : ^, parentheses, implicit multiplication
 * ("2pi", "3x", "2(x+1)"), the constants pi/π and e, the variable x (when given), and the functions
 * sqrt, ln, log (base 10), exp, abs, sin, cos, tan, asin, acos, atan (in degrees, as in school),
 * binom(n; k) and fact(n). Arguments of two-argument functions are separated by ";" because the
 * comma is the Danish decimal sign. No identifiers other than these, no eval().
 */

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  abs: Math.abs,
  sin: (d) => Math.sin((d * Math.PI) / 180),
  cos: (d) => Math.cos((d * Math.PI) / 180),
  tan: (d) => Math.tan((d * Math.PI) / 180),
  asin: (v) => (Math.asin(v) * 180) / Math.PI,
  acos: (v) => (Math.acos(v) * 180) / Math.PI,
  atan: (v) => (Math.atan(v) * 180) / Math.PI,
  fact: (n) => factorial(n),
  binom: (n, k) => factorial(n) / (factorial(k) * factorial(n - k)),
}
const ARITY: Record<string, number> = { binom: 2 }

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) throw new Error('Fakultet kræver et helt tal mellem 0 og 170')
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

type Tok =
  | { t: 'num'; v: number }
  | { t: 'op'; v: string }
  | { t: 'fn'; v: string }
  | { t: 'const'; v: number }
  | { t: 'var' }

const ALIASES: [RegExp, string][] = [
  [/[·×⋅]/g, '*'],
  [/÷/g, '/'],
  [/:/g, '/'],
  [/[−–]/g, '-'],
  [/√/g, 'sqrt'],
  [/π/g, 'pi'],
  [/²/g, '^2'],
  [/³/g, '^3'],
  [/arcsin|sin\^-1|sin⁻¹/g, 'asin'],
  [/arccos|cos\^-1|cos⁻¹/g, 'acos'],
  [/arctan|tan\^-1|tan⁻¹/g, 'atan'],
  [/\\/g, ''],
  [/\{/g, '('],
  [/\}/g, ')'],
  [/\[/g, '('],
  [/\]/g, ')'],
]

function tokenize(src: string, withX: boolean): Tok[] {
  let s = src
  for (const [re, r] of ALIASES) s = s.replace(re, r)
  const names = [...Object.keys(FUNCTIONS), 'pi', 'e', ...(withX ? ['x'] : [])].sort((a, b) => b.length - a.length)
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    const num = /^\d+(?:[.,]\d+)?/.exec(s.slice(i))
    if (num) {
      out.push({ t: 'num', v: Number(num[0].replace(',', '.')) })
      i += num[0].length
      continue
    }
    const word = /^[a-zA-Z]+/.exec(s.slice(i))
    if (word) {
      // runs like "xsin" or "epi": take the longest known name at the start
      const hit = names.find((n) => word[0].startsWith(n))
      if (!hit) throw new Error(`Ukendt navn i regneudtryk: "${word[0]}"`)
      if (hit === 'pi') out.push({ t: 'const', v: Math.PI })
      else if (hit === 'e') out.push({ t: 'const', v: Math.E })
      else if (hit === 'x') out.push({ t: 'var' })
      else out.push({ t: 'fn', v: hit })
      i += hit.length
      continue
    }
    if ('+-*/^();!'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
      continue
    }
    throw new Error(`Ukendt tegn i regneudtryk: "${c}"`)
  }
  // implicit multiplication
  const res: Tok[] = []
  for (const tok of out) {
    const prev = res[res.length - 1]
    const prevEnds =
      prev && (prev.t === 'num' || prev.t === 'const' || prev.t === 'var' || (prev.t === 'op' && (prev.v === ')' || prev.v === '!')))
    const curStarts = tok.t === 'num' || tok.t === 'const' || tok.t === 'var' || tok.t === 'fn' || (tok.t === 'op' && tok.v === '(')
    if (prevEnds && curStarts) res.push({ t: 'op', v: '*' })
    res.push(tok)
  }
  return res
}

/** Compiles an expression once; the result can be evaluated for many x (graphs). */
export function compile(expression: string, withX = false): (x?: number) => number {
  const toks = tokenize(expression, withX)
  return (x = 0) => {
    let pos = 0
    const isOp = (v: string) => {
      const t = toks[pos]
      return t?.t === 'op' && t.v === v
    }
    const expect = (v: string) => {
      if (!isOp(v)) throw new Error(`Mangler "${v}"`)
      pos++
    }
    function primary(): number {
      const t = toks[pos++]
      if (!t) throw new Error('Regneudtrykket slutter for tidligt')
      if (t.t === 'num' || t.t === 'const') return t.v
      if (t.t === 'var') return x
      if (t.t === 'fn') {
        const n = ARITY[t.v] ?? 1
        if (n === 1 && !isOp('(')) return FUNCTIONS[t.v](power()) // sin30, sqrt9
        expect('(')
        const args = [sum()]
        while (isOp(';')) {
          pos++
          args.push(sum())
        }
        expect(')')
        if (args.length !== n) throw new Error(`${t.v} skal have ${n} argument${n > 1 ? 'er' : ''}`)
        return FUNCTIONS[t.v](...args)
      }
      if (t.t === 'op' && t.v === '(') {
        const v = sum()
        expect(')')
        return v
      }
      if (t.t === 'op' && t.v === '-') return -power()
      if (t.t === 'op' && t.v === '+') return power()
      throw new Error(`Uventet "${(t as { v?: string }).v ?? 'tegn'}"`)
    }
    function postfix(): number {
      let v = primary()
      while (isOp('!')) {
        pos++
        v = factorial(v)
      }
      return v
    }
    function power(): number {
      const base = postfix()
      if (isOp('^')) {
        pos++
        return base ** unary()
      }
      return base
    }
    function unary(): number {
      if (isOp('-')) {
        pos++
        return -unary()
      }
      if (isOp('+')) {
        pos++
        return unary()
      }
      return power()
    }
    function product(): number {
      let v = unary()
      while (isOp('*') || isOp('/')) {
        const op = (toks[pos++] as { v: string }).v
        const r = unary()
        v = op === '*' ? v * r : v / r
      }
      return v
    }
    function sum(): number {
      let v = product()
      while (isOp('+') || isOp('-')) {
        const op = (toks[pos++] as { v: string }).v
        const r = product()
        v = op === '+' ? v + r : v - r
      }
      return v
    }
    const v = sum()
    if (pos !== toks.length) throw new Error('Regneudtrykket kunne ikke læses helt')
    return v
  }
}

export function evaluate(expression: string): number {
  const v = compile(expression)()
  if (!Number.isFinite(v)) throw new Error('Regneudtrykket giver ikke et endeligt tal')
  return v
}

function decimalsOf(n: number): number {
  const s = String(n)
  if (s.includes('e')) return 6
  const i = s.indexOf('.')
  return i < 0 ? 0 : s.length - i - 1
}

/** True when `computed` rounds to `stated` at the precision the stated value is written with. */
export function agrees(computed: number, stated: number): boolean {
  const d = Math.min(decimalsOf(stated), 6)
  const tol = 0.5 * 10 ** -d + 1e-9 * Math.max(1, Math.abs(stated))
  return Math.abs(computed - stated) <= tol
}

/** Danish number formatting: decimal comma, no thousands separator (as in school maths). */
export function formatDa(n: number): string {
  return String(n).replace('.', ',')
}

/** Does the answer text contain the number (Danish or English decimal, optional thousands separators)? */
export function answerMentions(answer: string, value: number): boolean {
  const norm = answer
    .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
    .replace(/[\s  ]/g, '')
    .replace(/(\d)\.(?=\d{3}(?!\d))/g, '$1')
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/[−–]/g, '-')
  const target = formatDa(value)
  const re = new RegExp(`(^|[^\\d,])${target.replace(/[-,.+]/g, (m) => `\\${m}`)}(?![\\d]|,\\d)`)
  if (re.test(norm)) return true
  // also accept a fraction written as a/b when value equals it
  for (const m of norm.matchAll(/(-?\d+)\/(\d+)/g)) {
    if (Number(m[2]) !== 0 && agrees(Number(m[1]) / Number(m[2]), value)) return true
  }
  return false
}
