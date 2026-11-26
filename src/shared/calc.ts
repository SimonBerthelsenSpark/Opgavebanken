/**
 * A small, safe arithmetic evaluator used to re-check the model's answers.
 * Supports numbers (comma or point decimals), + - * / : ^, parentheses, sqrt(), pi/π and implicit
 * multiplication like "2pi" or "3(4+1)". No identifiers other than these, no eval().
 */

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'fn'; v: 'sqrt' } | { t: 'pi' }

function tokenize(src: string): Tok[] {
  const s = src
    .replace(/[·×⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/:/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/√/g, 'sqrt')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
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
    if (s.startsWith('sqrt', i)) {
      out.push({ t: 'fn', v: 'sqrt' })
      i += 4
      continue
    }
    if (s.startsWith('pi', i)) {
      out.push({ t: 'pi' })
      i += 2
      continue
    }
    if ('+-*/^()'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
      continue
    }
    throw new Error(`Ukendt tegn i regneudtryk: "${c}"`)
  }
  // implicit multiplication: number/pi/")" followed by number/pi/"("/fn
  const res: Tok[] = []
  for (const tok of out) {
    const prev = res[res.length - 1]
    const prevEnds = prev && (prev.t === 'num' || prev.t === 'pi' || (prev.t === 'op' && prev.v === ')'))
    const curStarts = tok.t === 'num' || tok.t === 'pi' || tok.t === 'fn' || (tok.t === 'op' && tok.v === '(')
    if (prevEnds && curStarts) res.push({ t: 'op', v: '*' })
    res.push(tok)
  }
  return res
}

export function evaluate(expression: string): number {
  const toks = tokenize(expression)
  let pos = 0
  const peek = () => toks[pos]
  const isOp = (v: string) => {
    const t = peek()
    return t?.t === 'op' && t.v === v
  }

  function primary(): number {
    const t = toks[pos++]
    if (!t) throw new Error('Regneudtrykket slutter for tidligt')
    if (t.t === 'num') return t.v
    if (t.t === 'pi') return Math.PI
    if (t.t === 'fn') {
      const arg = primary()
      return Math.sqrt(arg)
    }
    if (t.t === 'op' && t.v === '(') {
      const v = sum()
      if (!isOp(')')) throw new Error('Mangler ")"')
      pos++
      return v
    }
    if (t.t === 'op' && t.v === '-') return -power()
    if (t.t === 'op' && t.v === '+') return power()
    throw new Error(`Uventet "${(t as { v?: string }).v ?? "tegn"}"`)
  }
  function power(): number {
    const base = primary()
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
  if (!Number.isFinite(v)) throw new Error('Regneudtrykket giver ikke et endeligt tal')
  return v
}

function decimalsOf(n: number): number {
  const s = String(n)
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
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
    .replace(/[\s  ]/g, '')
    .replace(/(\d)\.(?=\d{3}(?!\d))/g, '$1')
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/−/g, '-')
  const target = formatDa(value)
  const re = new RegExp(`(^|[^\\d,])${target.replace(/[-,]/g, (m) => `\\${m}`)}(?![\\d]|,\\d)`)
  if (re.test(norm)) return true
  // also accept a fraction written as a/b when value equals it
  for (const m of norm.matchAll(/(\d+)\/(\d+)/g)) {
    if (Number(m[2]) !== 0 && agrees(Number(m[1]) / Number(m[2]), value)) return true
  }
  return false
}
