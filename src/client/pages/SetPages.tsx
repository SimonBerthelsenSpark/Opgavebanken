import { useEffect, useMemo, useRef, useState } from 'react'
import { type SavedSet, type Task, taskPoints } from '../../shared/domain'
import { levelLabel } from '../../shared/levels'
import { navigate } from '../App'
import { TaskMeta, TaskView } from '../components'
import { KEYS, type SetDraft, readSession, writeSession } from '../session'
import { loadSet, renameSet, saveSet, useTasks } from '../store'

function suggestTitle(tasks: Task[]): string {
  const topics = [...new Set(tasks.map((t) => t.topic))].slice(0, 2).join(' og ')
  const levels = [...new Set(tasks.map((t) => levelLabel(t)))]
  return `${topics || 'Opgavesæt'} · ${levels.length <= 2 ? levels.join(' og ') : 'flere niveauer'}`
}

/** Preview of a set before it is approved: title, order and removal. Same view for manual and random sets. */
export function SetDraftPage({ uid }: { uid: string }) {
  const { tasks } = useTasks(uid)
  const [draft, setDraft] = useState<SetDraft>(() => readSession<SetDraft>(KEYS.draft, { title: '', taskIds: [], origin: 'manual' }))
  const [showGuide, setShowGuide] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useRef(false)

  useEffect(() => writeSession(KEYS.draft, draft), [draft])
  const byId = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks])
  const list = draft.taskIds.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t))
  const total = list.reduce((s, t) => s + taskPoints(t), 0)
  // suggest a title once the tasks are loaded; after that the field is the teacher's
  useEffect(() => {
    if (!draft.title && list.length && !draft.titleTouched) setDraft((x) => ({ ...x, title: suggestTitle(list) }))
  }, [list.length])
  const title = draft.title

  const move = (i: number, d: -1 | 1) =>
    setDraft((x) => {
      const ids = x.taskIds.slice()
      const j = i + d
      if (j < 0 || j >= ids.length) return x
      ;[ids[i], ids[j]] = [ids[j], ids[i]]
      return { ...x, taskIds: ids }
    })
  const remove = (id: string) => setDraft((x) => ({ ...x, taskIds: x.taskIds.filter((y) => y !== id) }))

  async function approve() {
    if (busy.current || !list.length) return
    busy.current = true
    setSaving(true)
    try {
      const id = await saveSet(uid, title.trim() || 'Opgavesæt', list)
      writeSession(KEYS.draft, null)
      navigate(`/saet/${id}`)
    } catch {
      setError('Sættet kunne ikke gemmes. Prøv igen.')
      setSaving(false)
    } finally {
      busy.current = false
    }
  }

  if (tasks === null) return <p className="muted">Henter opgaver …</p>
  if (!draft.taskIds.length || !list.length)
    return (
      <div className="panel empty">
        <p>Der er ingen opgaver i sættet.</p>
        <button type="button" className="btn primary" onClick={() => navigate('/')}>
          Til opgavebanken
        </button>
      </div>
    )

  return (
    <>
      <div className="page-head">
        <h1>Nyt opgavesæt</h1>
        <button type="button" className="btn ghost" onClick={() => navigate('/')}>
          ← Tilbage til banken
        </button>
      </div>
      {draft.origin === 'random' && <p className="notice highlight">Opgaverne er trukket tilfældigt blandt dem, der matchede dine filtre.</p>}
      <section className="panel set-head">
        <label className="field grow">
          <span className="field-label">Titel på sættet</span>
          <input value={title} onChange={(e) => setDraft((x) => ({ ...x, title: e.target.value, titleTouched: true }))} maxLength={120} />
        </label>
        <p className="summary">
          <span className="num">{list.length}</span> opgaver · <span className="num">{total}</span> point i alt
        </p>
      </section>
      <div className="toolbar">
        <label className="inline">
          <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} /> Vis facit og rettevejledning
        </label>
      </div>
      <ol className="set-list">
        {list.map((t, i) => (
          <li key={t.id} className="panel set-item">
            <div className="set-item-head">
              <h3>
                Opgave {i + 1}: {t.title} <span className="muted small num">({taskPoints(t)} point)</span>
              </h3>
              <span className="order-actions">
                <button type="button" className="btn outline xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Flyt ${t.title} op`}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn outline xs"
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={`Flyt ${t.title} ned`}
                >
                  ↓
                </button>
                <button type="button" className="btn ghost xs" onClick={() => remove(t.id)} aria-label={`Fjern ${t.title} fra sættet`}>
                  Fjern
                </button>
              </span>
            </div>
            <TaskMeta task={t} />
            <TaskView task={t} number={i + 1} showGuide={showGuide} verified={t.verified} />
          </li>
        ))}
      </ol>
      {error && (
        <p className="notice attention" role="alert">
          {error}
        </p>
      )}
      <div className="actions sticky-actions">
        <button type="button" className="btn primary" onClick={approve} disabled={saving}>
          {saving ? 'Gemmer …' : 'Godkend og gem sæt'}
        </button>
        <span className="muted small">Sættet gemmes som et øjebliksbillede. Senere ændringer i banken ændrer ikke sættet.</span>
      </div>
    </>
  )
}

export function SavedSetPage({ uid, id }: { uid: string; id: string }) {
  const [set, setSet] = useState<SavedSet | null | undefined>(undefined)
  const [showGuide, setShowGuide] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  useEffect(() => {
    loadSet(uid, id).then((s) => {
      setSet(s)
      if (s) setTitle(s.title)
    })
  }, [uid, id])

  if (set === undefined) return <p className="muted">Henter sæt …</p>
  if (set === null) return <p className="notice attention">Sættet findes ikke.</p>

  const download = async (kind: 'elev' | 'laerer' | 'point') => {
    if (busy) return
    setBusy(kind)
    setError(null)
    try {
      const s = { ...set, title: title.trim() || set.title }
      const { buildPointTablePdf, buildStudentPdf, buildTeacherPdf, downloadPdf } = await import('../pdf')
      const bytes = kind === 'elev' ? await buildStudentPdf(s) : kind === 'laerer' ? await buildTeacherPdf(s) : await buildPointTablePdf(s)
      const prefix = kind === 'elev' ? 'Elevark' : kind === 'laerer' ? 'Rettevejledning' : 'Pointtabel'
      downloadPdf(bytes, `${prefix} - ${s.title}.pdf`)
    } catch (e) {
      console.error(e)
      setError('PDF’en kunne ikke dannes.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{set.title}</h1>
        <button type="button" className="btn ghost" onClick={() => navigate('/saet')}>
          ← Alle gemte sæt
        </button>
      </div>
      <p className="notice ok" role="status">
        Sættet er gemt {new Date(set.createdAt).toLocaleString('da-DK', { dateStyle: 'long', timeStyle: 'short' })} med{' '}
        <span className="num">{set.tasks.length}</span> opgaver og <span className="num">{set.totalPoints}</span> point. Det ændrer sig
        ikke, selvom opgaverne senere rettes i banken.
      </p>
      <section className="panel downloads" aria-label="Hent PDF">
        <h2>Hent PDF (A4)</h2>
        <div className="actions">
          <button type="button" className="btn primary" onClick={() => download('elev')} disabled={Boolean(busy)}>
            {busy === 'elev' ? 'Danner …' : '1. Elevens opgavesæt'}
          </button>
          <button type="button" className="btn outline" onClick={() => download('laerer')} disabled={Boolean(busy)}>
            {busy === 'laerer' ? 'Danner …' : '2. Rettevejledning'}
          </button>
          <button type="button" className="btn outline" onClick={() => download('point')} disabled={Boolean(busy)}>
            {busy === 'point' ? 'Danner …' : '3. Pointtabel'}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label className="field">
          <span className="field-label">Titel</span>
          <span className="inline">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
            <button
              type="button"
              className="btn outline sm"
              disabled={!title.trim() || title === set.title}
              onClick={async () => {
                await renameSet(uid, set.id, title.trim())
                setSet({ ...set, title: title.trim() })
              }}
            >
              Gem titel
            </button>
          </span>
        </label>
      </section>
      <div className="toolbar">
        <label className="inline">
          <input type="checkbox" checked={showGuide} onChange={(e) => setShowGuide(e.target.checked)} /> Vis facit og rettevejledning
        </label>
      </div>
      <ol className="set-list">
        {set.tasks.map((t, i) => (
          <li key={i} className="panel set-item">
            <h3>
              Opgave {i + 1}: {t.title} <span className="muted small num">({taskPoints(t)} point)</span>
            </h3>
            <TaskMeta task={t} />
            <TaskView task={t} number={i + 1} showGuide={showGuide} verified={t.verified} />
          </li>
        ))}
      </ol>
    </>
  )
}
