import { useEffect, useMemo, useRef, useState } from 'react'
import { pointRows, type SavedSet, type Task } from '../shared/domain'
import { ApiError } from './api'
import { generateVariants } from './generation'
import { type ResultRow, saveNewTasks, saveResults, useProgression, useResults } from './store'

const pct = (n: number) => `${Math.round(n * 100)} %`

/**
 * "Klassens point": the teacher types each student's points per sub-question (students by number or
 * initials, never full names). Shows which questions the class found hard and can turn exactly
 * those into a practice set with new variants.
 */
export function ResultsPanel({
  uid,
  set,
  onPractice,
}: {
  uid: string
  set: SavedSet
  onPractice: (ids: string[], title: string) => void
}) {
  const stored = useResults(uid, set.id)
  const { progression } = useProgression(uid)
  const cols = useMemo(() => pointRows(set), [set])
  const [rows, setRows] = useState<ResultRow[] | null>(null)
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(true)
  const [practice, setPractice] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (stored && rows === null) {
      setRows(stored.length ? stored : Array.from({ length: 5 }, (_, i) => ({ alias: `Elev ${i + 1}`, scores: cols.map(() => null) })))
      if (stored.length) setOpen(true)
    }
  }, [stored])

  const update = (next: ResultRow[]) => {
    setRows(next)
    setSaved(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveResults(uid, set.id, next).then(() => setSaved(true)), 700)
  }

  // which task each column belongs to
  const taskOfCol = useMemo(() => set.tasks.flatMap((t) => t.parts.map(() => t)), [set])
  const filled = (rows ?? []).filter((r) => r.scores.some((v) => v !== null))
  const avg = cols.map((c, j) => {
    const vals = filled.map((r) => r.scores[j]).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((s, v) => s + v, 0) / (vals.length * c.max) : null
  })
  const hard = cols.map((c, j) => ({ c, j, a: avg[j] })).filter((x) => x.a !== null && (x.a as number) < 0.6)
  const totalMax = cols.reduce((s, c) => s + c.max, 0)

  async function makePractice() {
    if (practice) return
    const tasks = [...new Set(hard.map((h) => taskOfCol[h.j]))] as Task[]
    setPractice(`Laver ${tasks.length} nye varianter …`)
    try {
      const variants = await generateVariants(tasks, 0, progression)
      if (!variants.length) throw new Error()
      const ids = await saveNewTasks(uid, variants)
      onPractice(ids, `Øvesæt efter ${set.title}`)
    } catch (e) {
      setPractice(e instanceof ApiError ? e.message : 'Øvesættet kunne ikke laves.')
      return
    }
    setPractice(null)
  }

  const csv = () => {
    const head = ['Elev', ...cols.map((c) => `${c.label} (${c.max})`), `I alt (${totalMax})`]
    const lines = (rows ?? []).map((r) => [r.alias, ...r.scores.map((v) => (v ?? '').toString()), String(r.scores.reduce<number>((s, v) => s + (v ?? 0), 0))])
    const text = [head, ...lines].map((l) => l.map((x) => `"${x.replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }))
    a.download = `Point - ${set.title}.csv`.replace(/[\\/:*?"<>|·–]/g, '-')
    a.click()
  }

  return (
    <section className="panel results" aria-label="Klassens point">
      <div className="downloads-head">
        <h2>Klassens point</h2>
        <button type="button" className="btn outline sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Skjul' : 'Indtast point'}
        </button>
      </div>
      {!open ? (
        <p className="hint">Tast elevernes point ind efter rettelsen, og se med det samme, hvilke opgaver klassen havde svært ved.</p>
      ) : rows === null ? (
        <p className="muted">Henter …</p>
      ) : (
        <>
          <p className="hint">Brug elevnumre eller initialer – ikke fulde navne. Point gemmes automatisk {saved ? '✓' : '…'}</p>
          <div className="table-wrap">
            <table className="bank results-table">
              <thead>
                <tr>
                  <th>Elev</th>
                  {cols.map((c) => (
                    <th key={c.label} className="r" title={c.title}>
                      {c.label}
                      <br />
                      <span className="muted small">/{c.max}</span>
                    </th>
                  ))}
                  <th className="r">I alt</th>
                  <th>
                    <span className="sr-only">Fjern</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const sum = r.scores.reduce<number>((s, v) => s + (v ?? 0), 0)
                  return (
                    <tr key={i}>
                      <td>
                        <input
                          className="alias"
                          value={r.alias}
                          aria-label={`Elev ${i + 1}`}
                          maxLength={30}
                          onChange={(e) => update(rows.map((x, k) => (k === i ? { ...x, alias: e.target.value } : x)))}
                        />
                      </td>
                      {cols.map((c, j) => (
                        <td key={c.label} className="r">
                          <input
                            className={`score num${r.scores[j] !== null && (r.scores[j] as number) > c.max ? ' over' : ''}`}
                            inputMode="numeric"
                            aria-label={`${r.alias} ${c.label}`}
                            value={r.scores[j] ?? ''}
                            onChange={(e) => {
                              const v = e.target.value.replace(',', '.').trim()
                              const n = v === '' ? null : Number(v)
                              if (n !== null && (Number.isNaN(n) || n < 0)) return
                              update(rows.map((x, k) => (k === i ? { ...x, scores: x.scores.map((s, m) => (m === j ? n : s)) } : x)))
                            }}
                          />
                        </td>
                      ))}
                      <td className="r num">
                        <strong>{sum}</strong>
                      </td>
                      <td>
                        <button type="button" className="btn ghost xs" aria-label={`Fjern ${r.alias}`} onClick={() => update(rows.filter((_, k) => k !== i))}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th>Klassen</th>
                  {avg.map((a, j) => (
                    <td key={j} className={`r num${a !== null && a < 0.6 ? ' weak' : ''}`}>
                      {a === null ? '–' : pct(a)}
                    </td>
                  ))}
                  <td className="r num">
                    {filled.length ? pct(filled.reduce((s, r) => s + r.scores.reduce<number>((t, v) => t + (v ?? 0), 0), 0) / (filled.length * totalMax)) : '–'}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="actions">
            <button type="button" className="btn outline sm" onClick={() => update([...rows, { alias: `Elev ${rows.length + 1}`, scores: cols.map(() => null) }])}>
              + Tilføj elev
            </button>
            <button type="button" className="btn ghost sm" onClick={csv}>
              Hent som regneark (CSV)
            </button>
          </div>
          {hard.length > 0 && (
            <div className="notice highlight">
              <p>
                <strong>Klassen havde svært ved:</strong> {hard.map((h) => `${h.c.label} (${pct(h.a as number)})`).join(', ')}.
              </p>
              <button type="button" className="btn primary sm" disabled={Boolean(practice)} onClick={makePractice}>
                {practice ?? 'Lav øvesæt med nye varianter af de svære opgaver'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
