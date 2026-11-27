import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type Fit,
  type GeneratedTask,
  MAX_TASKS_PER_GENERATION,
  type PlanItem,
  TASKS_PER_CHUNK,
  taskPoints,
} from '../../shared/domain'
import { allocate, coverage } from '../../shared/bank'
import { LEVELS, levelOf } from '../../shared/levels'
import { GRADE_TOPICS, progressionContext, topicRequest } from '../../shared/progression'
import { checkTask } from '../../shared/validate'
import { ApiError, generateChunk, newRequestId, planTasks } from '../api'
import { navigate } from '../App'
import { IssueList, TaskEditor, TaskMeta, TaskView } from '../components'
import { createGenStore } from '../genStore'
import { generateTasks } from '../generation'
import { writeSession } from '../session'
import { saveNewTasks, useProgression, useTasks } from '../store'

interface Slot {
  item: PlanItem
  task: (GeneratedTask & { editedByTeacher?: boolean }) | null
  keep: boolean
  failed?: string
}

interface GenState {
  form: { level: string; levelChosen?: boolean; grade?: number; topic: string; custom?: string; count: number; difficulty: string }
  fit: Fit | null
  slots: Slot[]
  notices: string[]
}

const INITIAL: GenState = {
  form: { level: '5', topic: 'mixed:all', custom: '', count: 12, difficulty: 'Blandet' },
  fit: null,
  slots: [],
  notices: [],
}

const useGen = createGenStore<GenState>(INITIAL)

export function GeneratePage({ uid, preferred }: { uid: string; preferred?: string }) {
  const { state, setState, running, setRunning } = useGen()
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
  // start on the teacher's own level until they pick another one here
  useEffect(() => {
    if (preferred && !form.levelChosen && !state.slots.length && form.level !== preferred) setForm({ level: preferred })
  }, [preferred])
  const setForm = (patch: Partial<GenState['form']>) => setState((s) => ({ ...s, form: { ...s.form, ...patch } }))
  // older sessions stored a grade number instead of a level key
  const levelKeyNow = form.level ?? String(form.grade ?? 5)
  const level = levelOf(levelKeyNow)
  const context = progressionContext(progression, level.key)
  const catalog = GRADE_TOPICS[level.key] ?? {}
  const inCatalog = (k: string, t: string) => Object.values(GRADE_TOPICS[k] ?? {}).some((ts) => (ts ?? []).includes(t))
  const requestTopic = form.topic === 'custom' ? (form.custom ?? '').trim() : topicRequest(form.topic, level.key)

  async function writeTasks(items: PlanItem[], indexes: number[], key: string, retry = true) {
    const { grade, niveau } = levelOf(key)
    setRunning(true)
    setPhase('idle')
    const chunks: number[][] = []
    // first attempt in pairs; a retry sends the missing tasks one at a time (shorter calls)
    const size = retry ? TASKS_PER_CHUNK : 1
    for (let i = 0; i < indexes.length; i += size) chunks.push(indexes.slice(i, i + size))
    const missing: number[] = []
    const base = newRequestId()
    await Promise.all(
      chunks.map(async (idx, c) => {
        try {
          const res = await generateChunk({
            grade,
            niveau,
            topic: requestTopic,
            items: idx.map((i) => items[i]),
            siblings: items.filter((_, i) => !idx.includes(i)).map((it) => it.title),
            progression: context,
            requestId: `${base}-${c}`,
          })
          idx.forEach((slotIndex, k) => {
            if (!res.tasks[k]) missing.push(slotIndex)
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
          missing.push(...idx)
          setState((s) => {
            const slots = s.slots.slice()
            for (const slotIndex of idx) slots[slotIndex] = { ...slots[slotIndex], failed: message }
            return { ...s, slots }
          })
        }
      }),
    )
    if (retry && missing.length) {
      await writeTasks(items, missing, key, false)
      return
    }
    setRunning(false)
  }

  async function start(e: React.FormEvent) {
    e.preventDefault()
    if (busy.current) return // double click guard
    busy.current = true
    setError(null)
    setPhase('planning')
    try {
      const plan = await planTasks({ grade: level.grade, niveau: level.niveau, topic: requestTopic, count: form.count, difficulty: form.difficulty, progression: context, requestId: newRequestId() })
      setState((s) => ({ ...s, fit: plan.fit, slots: [], notices: [] }))
      if (plan.fit.status !== 'passer') {
        setPendingPlan(plan)
        setPhase('confirm')
        return
      }
      await begin(plan.items, level.key)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Noget gik galt. Prøv igen.')
      setPhase('idle')
    } finally {
      busy.current = false
    }
  }

  async function begin(items: PlanItem[], key: string) {
    setPendingPlan(null)
    setState((s) => ({ ...s, slots: items.map((item) => ({ item, task: null, keep: false })) }))
    await writeTasks(items, items.map((_, i) => i), key)
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
        level.key,
      )
    } finally {
      busy.current = false
    }
  }

  const done = state.slots.filter((s) => s.task).length
  const kept = state.slots.filter((s) => s.task && s.keep)
  const failedCount = state.slots.filter((s) => !s.task).length
  const working = phase === 'planning' || running || phase === 'saving'

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
      // saved tasks leave the preview; the form keeps its choices
      setState((s) => ({ ...INITIAL, form: s.form }))
      navigate('/')
    } catch (e) {
      console.error(e)
      const code = (e as { code?: string }).code
      setError(
        code === 'permission-denied'
          ? 'Databasen afviste opgaverne (Firestore-reglerne). Tjek at reglerne er publiceret.'
          : `Opgaverne kunne ikke gemmes${code ? ` (${code})` : ''}. Prøv igen.`,
      )
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
          <select
            value={level.key}
            onChange={(e) => {
              const k = e.target.value
              // keep "Blandet" and custom topics; a catalogue topic that the new level lacks falls back to mixed
              const keep =
                form.topic === 'mixed:all' || form.topic === 'custom' || inCatalog(k, form.topic) || form.topic.slice(6) in (GRADE_TOPICS[k] ?? {})
              setForm({ level: k, levelChosen: true, topic: keep ? form.topic : 'mixed:all' })
            }}
            disabled={working}
            aria-label="Klassetrin"
          >
            <optgroup label="Folkeskolen">
              {LEVELS.filter((l) => l.school === 'folkeskole').map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Gymnasiet (stx)">
              {LEVELS.filter((l) => l.school === 'gymnasium').map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="field grow">
          <span className="field-label">Emne</span>
          <select value={form.topic} onChange={(e) => setForm({ topic: e.target.value })} disabled={working} aria-label="Emne">
            <option value="mixed:all">Blandet – hele pensum for {level.label}</option>
            {Object.entries(catalog).map(([area, list]) => (
              <optgroup key={area} label={area}>
                <option value={`mixed:${area}`}>Blandet – {area}</option>
                {(list ?? []).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="custom">Andet emne (skriv selv) …</option>
          </select>
        </label>
        {form.topic === 'custom' && (
          <label className="field grow">
            <span className="field-label">Dit emne</span>
            <input
              value={form.custom ?? ''}
              onChange={(e) => setForm({ custom: e.target.value })}
              placeholder="fx omkreds og areal"
              required
              minLength={2}
              maxLength={120}
              disabled={working}
            />
          </label>
        )}
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
          {phase === 'planning' ? 'Planlægger …' : running ? `Skriver opgaver (${done}/${state.slots.length}) …` : 'Generér opgaver'}
        </button>
        <p className="hint full">
          Højst {MAX_TASKS_PER_GENERATION} opgaver ad gangen. Sværhedsgraden vurderes i forhold til klassetrinnet. Nye opgaver
          erstatter forhåndsvisningen herunder, så gem dem, du vil beholde, først.
        </p>
      </form>

      <GapFiller
        bank={bank ?? []}
        current={level.key}
        disabled={working}
        onStart={() => {
          setPendingPlan(null)
          setPhase('idle')
          setError(null)
          setRunning(true)
          setState((s) => ({ ...s, fit: null, slots: [], notices: [] }))
        }}
        onTasks={(tasks) =>
          setState((s) => ({
            ...s,
            slots: [
              ...s.slots,
              ...tasks.map((t) => ({
                item: { title: t.title, angle: '', difficulty: t.difficulty, area: t.area, topic: t.topic, needsFigure: Boolean(t.figure) },
                task: t,
                keep: true,
              })),
            ],
          }))
        }
        onNotice={(n) => setState((s) => ({ ...s, notices: [...s.notices, n] }))}
        onDone={() => setRunning(false)}
        progression={progression}
      />

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
              for {level.label}.
            </strong>{' '}
            {pendingPlan.fit.explanation}
          </p>
          <div className="actions">
            {pendingPlan.fit.suggestedLevels.slice(0, 3).map((g) => (
              <button
                key={g}
                type="button"
                className="btn outline"
                onClick={() => {
                  setForm({ level: g })
                  setPendingPlan(null)
                  setPhase('idle')
                }}
              >
                Skift til {levelOf(g).label}
              </button>
            ))}
            <button
              type="button"
              className="btn outline"
              onClick={async () => {
                if (busy.current) return
                busy.current = true
                try {
                  await begin(pendingPlan.items, level.key)
                } finally {
                  busy.current = false
                }
              }}
            >
              Fortsæt med {level.label}
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
          {failedCount > 0 && !working && (
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
                    <strong>{slot.item.title}</strong> –{' '}
                    {slot.failed ?? (running ? 'skrives …' : 'blev afbrudt (siden blev skiftet eller genindlæst).')}
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

const UPPER = ['8', '9', '10C', '10B', '11B', '10A', '11A', '12A']

/**
 * "Lav det der mangler": finds the catalogue topics with the fewest tasks in the shared bank and
 * generates new tasks for exactly those, spread over the levels in scope. The result lands in the
 * normal preview, where the teacher checks and saves it.
 */
function GapFiller(props: {
  bank: GeneratedTask[] | { grade: number; niveau?: string | null; topic: string }[]
  current: string
  disabled: boolean
  progression: import('../../shared/progression').Progression
  onStart: () => void
  onTasks: (t: GeneratedTask[]) => void
  onNotice: (n: string) => void
  onDone: () => void
}) {
  const [scope, setScope] = useState<'upper' | 'current'>('upper')
  const [total, setTotal] = useState(20)
  const [status, setStatus] = useState<string | null>(null)
  const levels = scope === 'upper' ? UPPER : [props.current]
  const gaps = useMemo(() => coverage(props.bank as never, levels, GRADE_TOPICS), [props.bank, scope, props.current])
  const plan = useMemo(() => allocate(gaps, total), [gaps, total])
  const empty = gaps.filter((g) => g.count === 0).length

  async function run() {
    if (props.disabled) return
    props.onStart()
    let made = 0
    let i = 0
    try {
      // at most 20 tasks per generation: split a level's topics into batches
      const batches: [string, { topic: string; n: number }[]][] = []
      for (const [lv, topics] of plan) {
        let cur: { topic: string; n: number }[] = []
        for (const t of topics) {
          if (cur.reduce((s, x) => s + x.n, 0) + t.n > MAX_TASKS_PER_GENERATION) {
            batches.push([lv, cur])
            cur = []
          }
          cur.push(t)
        }
        if (cur.length) batches.push([lv, cur])
      }
      for (const [lv, topics] of batches) {
        i++
        const label = levelOf(lv).label
        setStatus(`Fylder huller: ${label} (${i}/${batches.length}) …`)
        const n = topics.reduce((sum, x) => sum + x.n, 0)
        const topicText = `Udfyld huller i opgavebanken med netop disse emner (antal opgaver i parentes): ${topics.map((x) => `${x.topic} (${x.n})`).join(', ')}. Brug præcis disse emnenavne som "topic".`
        try {
          const tasks = await generateTasks({ levelKey: lv, topic: topicText, count: n, difficulty: 'Blandet', progression: props.progression })
          made += tasks.length
          props.onTasks(tasks)
          if (tasks.length < n) props.onNotice(`${label}: ${n - tasks.length} af ${n} opgaver kunne ikke laves.`)
        } catch (e) {
          props.onNotice(`${label}: ${e instanceof ApiError ? e.message : 'fejlede'}`)
        }
      }
    } finally {
      setStatus(made ? `${made} nye opgaver er klar i forhåndsvisningen herunder. Gennemse dem, og gem dem i banken.` : null)
      props.onDone()
    }
  }

  return (
    <section className="panel gap-filler" aria-label="Lav det der mangler">
      <div className="downloads-head">
        <h2>Lav det der mangler</h2>
        <button type="button" className="btn primary" onClick={run} disabled={props.disabled || plan.size === 0}>
          Lav {Math.min(total, [...plan.values()].flat().reduce((s, x) => s + x.n, 0))} opgaver, der mangler
        </button>
      </div>
      <p className="hint">
        Finder de emner i pensum, hvor den fælles bank har færrest opgaver, og laver nye til netop dem (højst 2 pr. emne ad gangen).
        {empty > 0 && ` Lige nu har ${empty} emner ingen opgaver.`}
      </p>
      <div className="actions">
        <span className="segmented" role="group" aria-label="Omfang">
          <button type="button" aria-pressed={scope === 'upper'} onClick={() => setScope('upper')}>
            8. klasse og opad
          </button>
          <button type="button" aria-pressed={scope === 'current'} onClick={() => setScope('current')}>
            Kun {levelOf(props.current).label}
          </button>
        </span>
        <label className="inline">
          Antal
          <select value={total} onChange={(e) => setTotal(Number(e.target.value))} aria-label="Antal opgaver, der mangler">
            {[10, 20, 30, 40].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details>
        <summary>Se hvad der bliver lavet</summary>
        <ul className="gap-plan">
          {[...plan.entries()].map(([lv, topics]) => (
            <li key={lv}>
              <strong>{levelOf(lv).label}:</strong> {topics.map((x) => `${x.topic} (${x.n})`).join(', ')}
            </li>
          ))}
        </ul>
      </details>
      {status && (
        <p className="notice highlight" role="status">
          {status}
        </p>
      )}
    </section>
  )
}
