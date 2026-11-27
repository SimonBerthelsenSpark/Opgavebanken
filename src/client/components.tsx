import { Fragment, type ReactNode, useState } from 'react'
import {
  AREAS,
  type Criterion,
  DIFFICULTIES,
  type Figure,
  type Issue,
  type Part,
  type TaskContent,
  figureSchema,
  normalizeTopic,
  partLabel,
  taskPoints,
} from '../shared/domain'
import { layoutFigure } from '../shared/figure'
import { LEVELS, levelKey, levelLabel, levelOf } from '../shared/levels'
import { tokenizeMath } from '../shared/mathtext'
import { checkTask } from '../shared/validate'

/** Text with stacked fractions, units and line breaks. */
export function MathText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className} style={{ whiteSpace: 'pre-wrap' }}>
      {tokenizeMath(text).map((tok, i) =>
        tok.t === 'text' ? (
          <Fragment key={i}>{tok.s}</Fragment>
        ) : (
          <span key={i} className="frac" role="math" aria-label={`${tok.num} over ${tok.den}`}>
            <span className="frac-num">{tok.num}</span>
            <span className="frac-den">{tok.den}</span>
          </span>
        ),
      )}
    </span>
  )
}

export function FigureView({ figure, maxWidth = 360, maxHeight = 240 }: { figure: Figure; maxWidth?: number; maxHeight?: number }) {
  const l = layoutFigure(figure, maxWidth, maxHeight, 13)
  return (
    <figure className="figure">
      <svg width={l.width} height={l.height} viewBox={`0 0 ${l.width} ${l.height}`} role="img" aria-label="Figur til opgaven">
        {l.prims.map((p, i) => {
          if (p.k === 'gridline') return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="#c5cbd2" strokeWidth={0.7} />
          if (p.k === 'poly')
            return (
              <polyline
                key={i}
                points={[...p.pts, ...(p.closed ? [p.pts[0]] : [])].map((q) => q.join(',')).join(' ')}
                fill="none"
                stroke="#1e2b3a"
                strokeWidth={p.weight}
                strokeDasharray={p.dashed ? '5 4' : undefined}
                strokeLinejoin="round"
              />
            )
          if (p.k === 'circle')
            return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="none" stroke="#1e2b3a" strokeWidth={1.4} strokeDasharray={p.dashed ? '5 4' : undefined} />
          if (p.k === 'dot') return <circle key={i} cx={p.cx} cy={p.cy} r={2} fill="#1e2b3a" />
          return (
            <text key={i} x={p.x} y={p.y} textAnchor={p.anchor} fontSize={l.fontSize} fill="#1e2b3a">
              {p.s}
            </text>
          )
        })}
      </svg>
      {figure.caption && <figcaption>{figure.caption}</figcaption>}
    </figure>
  )
}

export function DifficultyBadge({ d }: { d: string }) {
  return <span className={`badge diff-${d === 'Svær' ? 'hard' : d === 'Middel' ? 'mid' : 'easy'}`}>{d}</span>
}

export function IssueList({ issues }: { issues: Issue[] }) {
  const errors = issues.filter((i) => i.level === 'error')
  if (!errors.length) return null
  return (
    <div className="notice attention" role="status">
      <strong>Kontrollen fandt noget, du bør se på:</strong>
      <ul>
        {errors.map((e, i) => (
          <li key={i}>
            {e.part !== undefined && <>Delspørgsmål {String.fromCharCode(97 + e.part)}: </>}
            {e.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The full task: student text, figure and (optionally) the marking guide. */
export function TaskView({
  task,
  number,
  showGuide,
  verified,
}: {
  task: TaskContent
  number?: number
  showGuide: boolean
  verified?: boolean[]
}) {
  const n = number ?? 1
  return (
    <div className="task-view">
      {task.intro && (
        <p>
          <MathText text={task.intro} />
        </p>
      )}
      {task.figure && <FigureView figure={task.figure} />}
      <ol className="parts">
        {task.parts.map((p, i) => (
          <li key={i} className="part">
            <div className="part-head">
              <span className="part-label">{partLabel(n, i, task.parts.length)}</span>
              <span className="part-q">
                <MathText text={p.question} />
              </span>
              <span className="muted num">{p.points} p</span>
            </div>
            {showGuide && (
              <dl className="guide">
                <dt>Facit</dt>
                <dd>
                  <MathText text={p.answer} />{' '}
                  {verified?.[i] ? (
                    <span className="badge ok">✓ Efterregnet</span>
                  ) : p.check.expression ? (
                    <span className="badge quiet">Ikke bekræftet</span>
                  ) : null}
                </dd>
                <dt>Løsningsforslag</dt>
                <dd>
                  <MathText text={p.solution} />
                </dd>
                <dt>Point</dt>
                <dd>
                  <ul className="criteria">
                    {p.criteria.map((c, j) => (
                      <li key={j}>
                        <span className="num">{c.points} p:</span> <MathText text={c.description} />
                      </li>
                    ))}
                  </ul>
                </dd>
              </dl>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

export function TaskMeta({ task }: { task: TaskContent }) {
  return (
    <span className="meta">
      {levelLabel(task)} · {task.area} · {task.topic} · <DifficultyBadge d={task.difficulty} /> ·{' '}
      <span className="num">{taskPoints(task)} point</span>
    </span>
  )
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

/** Edit text, answers, category and points. Checks run live with the same rules as the server. */
export function TaskEditor<T extends TaskContent>({
  task,
  onSave,
  onCancel,
  topics,
}: {
  task: T
  onSave: (t: T) => void
  onCancel: () => void
  topics: string[]
}) {
  const [draft, setDraft] = useState<T>(() => structuredClone(task))
  const [figureText, setFigureText] = useState(() => (task.figure ? JSON.stringify(task.figure, null, 1) : ''))
  const [figureError, setFigureError] = useState<string | null>(null)
  const set = (patch: Partial<TaskContent>) => setDraft((d) => ({ ...d, ...patch }))
  const setPart = (i: number, patch: Partial<Part>) =>
    setDraft((d) => ({ ...d, parts: d.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) }))
  const setCrit = (i: number, k: number, patch: Partial<Criterion>) =>
    setPart(i, { criteria: draft.parts[i].criteria.map((c, j) => (j === k ? { ...c, ...patch } : c)) })
  const live = checkTask(draft)

  const applyFigure = (text: string) => {
    setFigureText(text)
    if (!text.trim()) {
      set({ figure: null })
      setFigureError(null)
      return
    }
    try {
      const fig = figureSchema.parse(JSON.parse(text))
      set({ figure: fig })
      setFigureError(null)
    } catch {
      setFigureError('Figuren er ikke gyldig JSON i det forventede format. Den gamle figur bevares.')
    }
  }

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault()
        if (figureError) return
        onSave({ ...draft, topic: normalizeTopic(draft.topic) })
      }}
    >
      <Field label="Titel">
        <input value={draft.title} onChange={(e) => set({ title: e.target.value })} required maxLength={120} />
      </Field>
      <div className="row4">
        <Field label="Klassetrin">
          <select
            value={levelKey(draft)}
            onChange={(e) => {
              const l = levelOf(e.target.value)
              set({ grade: l.grade, niveau: l.niveau })
            }}
          >
            {LEVELS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Område">
          <select value={draft.area} onChange={(e) => set({ area: e.target.value as TaskContent['area'] })}>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </Field>
        <Field label="Emne">
          <input list="topic-list" value={draft.topic} onChange={(e) => set({ topic: e.target.value })} required maxLength={60} />
          <datalist id="topic-list">
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Sværhedsgrad">
          <select value={draft.difficulty} onChange={(e) => set({ difficulty: e.target.value as TaskContent['difficulty'] })}>
            {DIFFICULTIES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Opgavetekst" hint="Brøker skrives \frac{3}{4}, kvadratenheder cm^2.">
        <textarea rows={3} value={draft.intro} onChange={(e) => set({ intro: e.target.value })} />
      </Field>

      {draft.parts.map((p, i) => (
        <fieldset key={i} className="part-edit">
          <legend>
            Delspørgsmål {draft.parts.length > 1 ? String.fromCharCode(97 + i) : ''}
            {draft.parts.length > 1 && (
              <button
                type="button"
                className="btn ghost xs"
                onClick={() => set({ parts: draft.parts.filter((_, j) => j !== i) })}
              >
                Fjern
              </button>
            )}
          </legend>
          <Field label="Spørgsmål">
            <textarea rows={2} value={p.question} onChange={(e) => setPart(i, { question: e.target.value })} required />
          </Field>
          <Field label="Facit">
            <input value={p.answer} onChange={(e) => setPart(i, { answer: e.target.value })} required aria-label={`Facit ${i + 1}`} />
          </Field>
          <Field label="Løsningsforslag">
            <textarea rows={2} value={p.solution} onChange={(e) => setPart(i, { solution: e.target.value })} required />
          </Field>
          <div className="crit-edit">
            <span className="field-label">
              Pointkriterier · i alt <span className="num">{p.points}</span> point
            </span>
            {p.criteria.map((c, k) => (
              <div key={k} className="crit-row">
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="num short"
                  value={c.points}
                  aria-label="Point"
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(10, Number(e.target.value) || 1))
                    const criteria = p.criteria.map((cc, j) => (j === k ? { ...cc, points: v } : cc))
                    setPart(i, { criteria, points: criteria.reduce((s, cc) => s + cc.points, 0) })
                  }}
                />
                <input value={c.description} onChange={(e) => setCrit(i, k, { description: e.target.value })} aria-label="Kriterium" />
                {p.criteria.length > 1 && (
                  <button
                    type="button"
                    className="btn ghost xs"
                    aria-label="Fjern kriterium"
                    onClick={() => {
                      const criteria = p.criteria.filter((_, j) => j !== k)
                      setPart(i, { criteria, points: criteria.reduce((s, cc) => s + cc.points, 0) })
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn ghost xs"
              onClick={() => setPart(i, { criteria: [...p.criteria, { points: 1, description: '' }], points: p.points + 1 })}
            >
              + Kriterium
            </button>
          </div>
          <details>
            <summary>Kontrolberegning</summary>
            <div className="row3">
              <Field label="Regneudtryk" hint="Fx 8*5. Tomt = ikke et taluddrag.">
                <input value={p.check.expression} onChange={(e) => setPart(i, { check: { ...p.check, expression: e.target.value } })} />
              </Field>
              <Field label="Facit-værdi">
                <input
                  value={p.check.value ?? ''}
                  inputMode="decimal"
                  onChange={(e) => {
                    const v = e.target.value.replace(',', '.')
                    setPart(i, { check: { ...p.check, value: v === '' || Number.isNaN(Number(v)) ? null : Number(v) } })
                  }}
                />
              </Field>
              <Field label="Enhed">
                <input value={p.check.unit} onChange={(e) => setPart(i, { check: { ...p.check, unit: e.target.value } })} />
              </Field>
            </div>
          </details>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn outline sm"
        onClick={() =>
          set({
            parts: [
              ...draft.parts,
              {
                question: '',
                answer: '',
                solution: '',
                points: 1,
                criteria: [{ points: 1, description: 'Korrekt svar' }],
                check: { expression: '', value: null, unit: '' },
              },
            ],
          })
        }
      >
        + Delspørgsmål
      </button>
      <details>
        <summary>Figur (avanceret)</summary>
        <Field label="Figurdata" hint="Tomt felt fjerner figuren.">
          <textarea rows={6} className="mono" value={figureText} onChange={(e) => applyFigure(e.target.value)} />
        </Field>
        {figureError && <p className="error" role="alert">{figureError}</p>}
      </details>
      <IssueList issues={live.issues} />
      <div className="actions">
        <button type="submit" className="btn primary">
          Gem ændringer
        </button>
        <button type="button" className="btn outline" onClick={onCancel}>
          Annullér
        </button>
      </div>
    </form>
  )
}
