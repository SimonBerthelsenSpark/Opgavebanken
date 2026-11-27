import { useEffect, useMemo, useRef, useState } from 'react'
import { estMinutes, type SavedSet, type Task, taskPoints } from '../../shared/domain'
import { levelLabel } from '../../shared/levels'
import { navigate } from '../App'
import { GuideView, TaskMeta, TaskView } from '../components'
import { ApiError } from '../api'
import { generateVariants } from '../generation'
import { KEYS, type SetDraft, readSession, writeSession } from '../session'
import { loadSet, renameSet, saveNewTasks, saveSet, useProgression, useTasks } from '../store'

function suggestTitle(tasks: Task[]): string {
  const topics = [...new Set(tasks.map((t) => t.topic))].slice(0, 2).join(' og ')
  const levels = [...new Set(tasks.map((t) => levelLabel(t)))]
  return `${topics || 'Opgavesæt'} · ${levels.length <= 2 ? levels.join(' og ') : 'flere niveauer'}`
}

/** Preview of a set before it is approved: title, order and removal. Same view for manual and random sets. */
export function SetDraftPage({ uid }: { uid: string }) {
  const { tasks } = useTasks(uid)
  const [draft, setDraft] = useState<SetDraft>(() => readSession<SetDraft>(KEYS.draft, { title: '', taskIds: [], origin: 'manual' }))
  const [view, setView] = useState<View>('student')
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
      {draft.note && <p className="notice highlight">{draft.note}</p>}
      <Differentiate
        uid={uid}
        tasks={list}
        title={title}
        onDraft={(ids, label) =>
          setDraft({ title: `${title} – ${label}`, taskIds: ids, origin: 'variant', titleTouched: true, note: `Ny ${label} af sættet. Opgaverne er lavet med AI og gemt i banken. Den oprindelige udgave kan du lave igen fra banken.` })
        }
      />
      <section className="panel set-head">
        <label className="field grow">
          <span className="field-label">Titel på sættet</span>
          <input value={title} onChange={(e) => setDraft((x) => ({ ...x, title: e.target.value, titleTouched: true }))} maxLength={120} />
        </label>
        <p className="summary">
          <span className="num">{list.length}</span> opgaver · <span className="num">{total}</span> point i alt · ca.{' '}
          <span className="num">{list.reduce((m, t) => m + estMinutes(t), 0)}</span> minutter
        </p>
      </section>
      <div className="toolbar">
        <ViewToggle view={view} onChange={setView} />
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
            <TaskBody task={t} number={i + 1} view={view} />
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
  const [view, setView] = useState<View>('student')
  const [busy, setBusy] = useState<Kind | 'all' | null>(null)
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

  const downloadAll = async () => {
    if (busy) return
    for (const d of DOCS) {
      await download(d.kind, true)
      await new Promise((r) => setTimeout(r, 400)) // browsers handle several downloads better spaced out
    }
    setBusy(null)
  }

  const download = async (kind: Kind, partOfAll = false) => {
    if (busy && !partOfAll) return
    setBusy(partOfAll ? 'all' : kind)
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
      if (!partOfAll) setBusy(null)
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
      <section className="downloads" aria-label="Download PDF">
        <div className="downloads-head">
          <h2>Download som PDF</h2>
          <button type="button" className="btn primary" onClick={downloadAll} disabled={Boolean(busy)}>
            <DownloadIcon /> {busy === 'all' ? 'Henter …' : 'Download alle tre'}
          </button>
        </div>
        <div className="dl-grid">
          {DOCS.map((d) => (
            <button key={d.kind} type="button" className="dl-card" onClick={() => download(d.kind)} disabled={Boolean(busy)}>
              <span className="dl-title">{d.title}</span>
              <span className="dl-icon" aria-hidden="true">
                <FileIcon accent={d.accent} />
              </span>
              <span className="dl-desc">{d.desc}</span>
              <span className="dl-foot">
                <span className="muted small">PDF · A4</span>
                <span className="dl-action">
                  <DownloadIcon /> {busy === d.kind ? 'Danner …' : 'Download'}
                </span>
              </span>
            </button>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <label className="field title-edit">
          <span className="field-label">Titel på sættet (står øverst i alle tre PDF’er)</span>
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
        <ViewToggle view={view} onChange={setView} />
      </div>
      <ol className="set-list">
        {set.tasks.map((t, i) => (
          <li key={i} className="panel set-item">
            <h3>
              Opgave {i + 1}: {t.title} <span className="muted small num">({taskPoints(t)} point)</span>
            </h3>
            <TaskMeta task={t} />
            <TaskBody task={t} number={i + 1} view={view} />
          </li>
        ))}
      </ol>
    </>
  )
}

type View = 'student' | 'guide' | 'side'

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  return (
    <span className="segmented" role="group" aria-label="Visning">
      {(
        [
          ['student', 'Elevvisning'],
          ['guide', 'Med facit'],
          ['side', 'Side om side'],
        ] as const
      ).map(([v, label]) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </span>
  )
}

function TaskBody({ task, number, view }: { task: Task; number: number; view: View }) {
  if (view !== 'side') return <TaskView task={task} number={number} showGuide={view === 'guide'} verified={task.verified} />
  return (
    <div className="side-by-side">
      <div>
        <p className="field-label">Eleven ser</p>
        <TaskView task={task} number={number} showGuide={false} />
      </div>
      <div>
        <p className="field-label">Rettevejledning</p>
        <GuideView task={task} number={number} />
      </div>
    </div>
  )
}

/** An easier or harder version of the whole set (new variants, saved in the bank). */
function Differentiate({ uid, tasks, title, onDraft }: { uid: string; tasks: Task[]; title: string; onDraft: (ids: string[], label: string) => void }) {
  const { progression } = useProgression(uid)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (by: -1 | 1) => {
    if (busy) return
    setError(null)
    setBusy(`Laver ${by < 0 ? 'lettere' : 'sværere'} udgave (0/${tasks.length}) …`)
    try {
      const variants = await generateVariants(tasks, by, progression, (d, n) =>
        setBusy(`Laver ${by < 0 ? 'lettere' : 'sværere'} udgave (${d}/${n}) …`),
      )
      if (!variants.length) throw new Error()
      const ids = await saveNewTasks(uid, variants)
      onDraft(ids, by < 0 ? 'lettere udgave' : 'sværere udgave')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Udgaven kunne ikke laves. Prøv igen.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="actions differentiate">
      <span className="hint">Differentiering: lav samme sæt i en anden sværhedsgrad til elever, der har brug for det.</span>
      <button type="button" className="btn outline sm" disabled={Boolean(busy) || !tasks.length} onClick={() => run(-1)}>
        Lav lettere udgave
      </button>
      <button type="button" className="btn outline sm" disabled={Boolean(busy) || !tasks.length} onClick={() => run(1)}>
        Lav sværere udgave
      </button>
      {busy && <span className="hint">{busy}</span>}
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
      <span className="sr-only">{title}</span>
    </div>
  )
}

type Kind = 'elev' | 'laerer' | 'point'

const DOCS: { kind: Kind; title: string; desc: string; accent: string }[] = [
  { kind: 'elev', title: 'Elevens opgavesæt', desc: 'Opgaver, figurer og plads til besvarelse. Uden facit.', accent: '#1e2b3a' },
  { kind: 'laerer', title: 'Rettevejledning', desc: 'Facit, løsningsforslag og kriterier for delpoint.', accent: '#2e6b4e' },
  { kind: 'point', title: 'Pointtabel', desc: 'Én række pr. opgave med maks. point og felt til elevens point.', accent: '#eca53e' },
]

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v8M4.5 6.8 8 10.3l3.5-3.5M2.5 13.5h11" />
    </svg>
  )
}

function FileIcon({ accent }: { accent: string }) {
  return (
    <svg width="40" height="48" viewBox="0 0 40 48" aria-hidden="true">
      <path d="M4 2h22l10 10v32a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#fff" stroke="#c5cbd2" strokeWidth="1.5" />
      <path d="M26 2v8a2 2 0 0 0 2 2h8" fill="none" stroke="#c5cbd2" strokeWidth="1.5" />
      <rect x="2" y="30" width="26" height="11" rx="2" fill={accent} />
      <text x="15" y="38.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
        PDF
      </text>
      <path d="M8 14h14M8 19h18M8 24h12" stroke="#dde1e6" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
