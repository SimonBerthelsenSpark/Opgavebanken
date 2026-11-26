import { useMemo, useRef, useState } from 'react'
import {
  type Fit,
  type GeneratedTask,
  GRADES,
  MAX_TASKS_PER_GENERATION,
  type PlanItem,
  TASKS_PER_CHUNK,
  taskPoints,
} from '../../shared/domain'
import { progressionContext } from '../../shared/progression'
import { checkTask } from '../../shared/validate'
import { ApiError, generateChunk, newRequestId, planTasks } from '../api'
import { navigate } from '../App'
import { IssueList, TaskEditor, TaskMeta, TaskView } from '../components'
import { KEYS, useSessionState, writeSession } from '../session'
import { saveNewTasks, useProgression, useTasks } from '../store'

interface Slot {
  item: PlanItem
  task: (GeneratedTask & { editedByTeacher?: boolean }) | null
  keep: boolean
  failed?: string
}

interface GenState {
  form: { grade: number; topic: string; count: number; difficulty: string }
  fit: Fit | null
  slots: Slot[]
  notices: string[]
}

const INITIAL: GenState = {
  form: { grade: 5, topic: '', count: 12, difficulty: 'Blandet' },
  fit: null,
  slots: [],
  notices: [],
}

export function GeneratePage({ uid }: { uid: string }) {
  const [state, setState] = useSessionState<GenState>(KEYS.generated, INITIAL)
  const { progression } = useProgression(uid)
  const { tasks: bank } = useTasks(uid)
  const [phase, setPhase] = useState<'idle' | 'planning' | 'confirm' | 'writing' | 'saving'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [pendingPlan, setPendingPlan] = useState<{ fit: Fit; items: PlanItem[] } | null>(null)
  const busy = useRef(false)
  const [countText, setCountText] = useState(() => String(state.form.count))
  const topics = useMemo(() => [...new Set((bank ?? []).map((t) => t.topic))], [bank])
  const { form } = state
  const setForm = (patch: Partial<GenState['form']>) => setState((s) => ({ ...s, form: { ...s.form, ...patch } }))
  const context = progressionContext(progression, form.grade)

  async function writeTasks(items: PlanItem[], indexes: number[], grade: number) {
    setPhase('writing')
    const chunks: number[][] = []
    for (let i = 0; i < indexes.length; i += TASKS_PER_CHUNK) chunks.push(indexes.slice(i, i + TASKS_PER_CHUNK))
    const base = newRequestId()
    await Promise.all(
      chunks.map(async (idx, c) => {
        try {
          const res = await generateChunk({
            grade,
            topic: form.topic,
            items: idx.map((i) => items[i]),
            siblings: items.filter((_, i) => !idx.includes(i)).map((it) => it.title),
            progression: context,
            requestId: `${base}-${c}`,
          })
          setState((s) => {
            const slots = s.slots.slice()
            idx.forEach((slotIndex, k) => {
              const task = res.tasks[k] ?? null
              slots[slotIndex] = { ...slots[slotIndex], task, keep: Boolean(task), failed: task ? undefined : 'Opgaven kunne ikke laves korrekt.' }
            })
            return { ...s, slots, notices: [...s.notices, ...res.notices] }
          })
        } catch (e) {
          const message = e instanceof ApiError ? e.message : 'Ukendt fejl.'
          setState((s) => {
            const slots = s.slots.slice()
            for (const slotIndex of idx) slots[slotIndex] = { ...slots[slotIndex], failed: message }
            return { ...s, slots }
          })
        }
      }),
    )
    setPhase('idle')
  }

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (busy.current) return // double click guard
    busy.current = true
    setError(null)
    setPhase('planning')
    try {
      const plan = await planTasks({ ...form, progression: context, requestId: newRequestId() })
      setState((s) => ({ ...s, fit: plan.fit, slots: [], notices: [] }))
      if (plan.fit.status !== 'passer') {
        setPendingPlan(plan)
        setPhase('confirm')
        return
      }
      await begin(plan.items, form.grade)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Noget gik galt. Prøv igen.')
      setPhase('idle')
    } finally {
      busy.current = false
    }
  }

  async function begin(items: PlanItem[], grade: number) {
    setPendingPlan(null)
    setState((s) => ({ ...s, slots: items.map((item) => ({ item, task: null, keep: false })) }))
    await writeTasks(items, items.map((_, i) => i), grade)
  }

  async function retryFailed() {
    if (busy.current) return
    busy.current = true
    try {
      const failed = state.slots.map((s, i) => (s.task ? -1 : i)).filter((i) => i >= 0)
      setState((s) => ({ ...s, slots: s.slots.map((sl) => ({ ...sl, failed: undefined })) }))
      await writeTasks(
        state.slots.map((s) => s.item),
        failed,
        form.grade,
      )
    } finally {
      busy.current = false
    }
  }

  const done = state.slots.filter((s) => s.task).length
  const kept = state.slots.filter((s) => s.task && s.keep)
  const failedCount = state.slots.filter((s) => s.failed && !s.task).length
  const working = phase === 'planning' || phase === 'writing' || phase === 'saving'

  async function save() {
    if (busy.current || !kept.length) return
    busy.current = true
    setPhase('saving')
    try {
      await saveNewTasks(
        uid,
        kept.map((s) => s.task as GeneratedTask),
      )
      writeSession('ob.flash', `${kept.length} ${kept.length === 1 ? 'opgave er' : 'opgaver er'} gemt i banken.`)
      setState(INITIAL)
      navigate('/')
    } catch {
      setError('Opgaverne kunne ikke gemmes. Tjek forbindelsen og prøv igen.')
      setPhase('idle')
    } finally {
      busy.current = false
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Generér opgaver</h1>
      </div>
      <form className="panel gen-form" onSubmit={start}>
        <label className="field">
          <span className="field-label">Klassetrin</span>
          <select value={form.grade} onChange={(e) => setForm({ grade: Number(e.target.value) })} disabled={working}>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}. klasse
              </option>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span className="field-label">Emne</span>
          <input
            value={form.topic}
            onChange={(e) => setForm({ topic: e.target.value })}
            placeholder="fx omkreds og areal"
            required
            minLength={2}
            maxLength={120}
            disabled={working}
          />
        </label>
        <label className="field">
          <span className="field-label">Antal</span>
          <input
            type="number"
            min={1}
            max={MAX_TASKS_PER_GENERATION}
            className="num short"
            value={countText}
            onChange={(e) => {
              setCountText(e.target.value)
              const v = Number(e.target.value)
              if (Number.isInteger(v) && v >= 1) setForm({ count: Math.min(MAX_TASKS_PER_GENERATION, v) })
            }}
            onBlur={() => setCountText(String(form.count))}
            disabled={working}
          />
        </label>
        <label className="field">
          <span className="field-label">Sværhedsgrad</span>
          <select value={form.difficulty} onChange={(e) => setForm({ difficulty: e.target.value })} disabled={working}>
            <option value="Blandet">Blanding (AI fordeler)</option>
            <option>Let</option>
            <option>Middel</option>
            <option>Svær</option>
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={working}>
          {phase === 'planning' ? 'Planlægger …' : phase === 'writing' ? `Skriver opgaver (${done}/${state.slots.length}) …` : 'Generér opgaver'}
        </button>
        <p className="hint full">
          Højst {MAX_TASKS_PER_GENERATION} opgaver ad gangen. Sværhedsgraden vurderes i forhold til klassetrinnet. Nye opgaver
          erstatter forhåndsvisningen herunder, så gem dem, du vil beholde, først.
        </p>
      </form>

      {error && (
        <p className="notice attention" role="alert">
          {error}
        </p>
      )}

      {phase === 'confirm' && pendingPlan && (
        <div className="notice highlight" role="alert">
          <p>
            <strong>
              Emnet ser ud til at ligge {pendingPlan.fit.status === 'for_svaert' ? 'over' : pendingPlan.fit.status === 'for_let' ? 'under' : 'uden for'} niveauet
              for {form.grade}. klasse.
            </strong>{' '}
            {pendingPlan.fit.explanation}
          </p>
          <div className="actions">
            {pendingPlan.fit.suggestedGrades.slice(0, 3).map((g) => (
              <button
                key={g}
                type="button"
                className="btn outline"
                onClick={() => {
                  setForm({ grade: g })
                  setPendingPlan(null)
                  setPhase('idle')
                }}
              >
                Skift til {g}. klasse
              </button>
            ))}
            <button
              type="button"
              className="btn outline"
              onClick={async () => {
                if (busy.current) return
                busy.current = true
                try {
                  await begin(pendingPlan.items, form.grade)
                } finally {
                  busy.current = false
                }
              }}
            >
              Fortsæt med {form.grade}. klasse
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setPendingPlan(null)
                setPhase('idle')
              }}
            >
              Ret emnet
            </button>
          </div>
        </div>
      )}

      {state.slots.length > 0 && (
        <section aria-label="Forhåndsvisning">
          <div className="page-head sub">
            <h2>
              Forhåndsvisning · {done} af {state.slots.length} opgaver
            </h2>
            <span className="bar-actions">
              <span className="muted">
                <span className="num">{kept.length}</span> valgt ·{' '}
                <span className="num">{kept.reduce((s, k) => s + taskPoints(k.task as GeneratedTask), 0)}</span> point
              </span>
              <button type="button" className="btn primary" disabled={!kept.length || working} onClick={save}>
                Gem {kept.length} i banken
              </button>
            </span>
          </div>
          {state.notices.map((n, i) => (
            <p key={i} className="notice highlight">
              {n}
            </p>
          ))}
          {failedCount > 0 && phase === 'idle' && (
            <p className="notice attention">
              {failedCount} {failedCount === 1 ? 'opgave' : 'opgaver'} mangler.{' '}
              <button type="button" className="link" onClick={retryFailed}>
                Prøv de manglende igen
              </button>
            </p>
          )}
          <ol className="gen-list">
            {state.slots.map((slot, i) => (
              <li key={i} className={`panel gen-item${slot.task && !slot.keep ? ' discarded' : ''}`}>
                {!slot.task ? (
                  <p className="muted">
                    <strong>{slot.item.title}</strong> – {slot.failed ?? 'skrives …'}
                  </p>
                ) : editing === i ? (
                  <TaskEditor
                    task={slot.task}
                    topics={topics}
                    onCancel={() => setEditing(null)}
                    onSave={(t) => {
                      const { issues, verified } = checkTask(t)
                      setState((s) => {
                        const slots = s.slots.slice()
                        slots[i] = { ...slots[i], task: { ...t, issues, verified, editedByTeacher: true } }
                        return { ...s, slots }
                      })
                      setEditing(null)
                    }}
                  />
                ) : (
                  <>
                    <div className="gen-head">
                      <label className="keep">
                        <input
                          type="checkbox"
                          checked={slot.keep}
                          onChange={() =>
                            setState((s) => {
                              const slots = s.slots.slice()
                              slots[i] = { ...slots[i], keep: !slots[i].keep }
                              return { ...s, slots }
                            })
                          }
                        />
                        <span className="sr-only">Behold</span>
                      </label>
                      <div>
                        <h3>
                          {i + 1}. {slot.task.title} {slot.task.editedByTeacher && <span className="badge quiet">Rettet af dig</span>}
                        </h3>
                        <TaskMeta task={slot.task} />
                      </div>
                      <span className="gen-actions">
                        <button type="button" className="btn outline sm" onClick={() => setEditing(i)}>
                          Rediger
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() =>
                            setState((s) => {
                              const slots = s.slots.slice()
                              slots[i] = { ...slots[i], keep: !slots[i].keep }
                              return { ...s, slots }
                            })
                          }
                        >
                          {slot.keep ? 'Kassér' : 'Fortryd'}
                        </button>
                      </span>
                    </div>
                    {slot.keep && (
                      <>
                        <IssueList issues={slot.task.issues} />
                        <TaskView task={slot.task} number={i + 1} showGuide verified={slot.task.verified} />
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}
