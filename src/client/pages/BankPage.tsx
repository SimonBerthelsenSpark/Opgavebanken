import { useEffect, useMemo, useState } from 'react'
import { EMPTY_FILTERS, type Filters, filtersActive, matches, pickRandom } from '../../shared/bank'
import { AREAS, DIFFICULTIES, estMinutes, type Task, taskPoints } from '../../shared/domain'
import { LEVELS, levelLabel } from '../../shared/levels'
import { navigate } from '../App'
import { DifficultyBadge, IssueList, QualityBadges, TaskEditor, TaskView } from '../components'
import { QuickSet } from '../QuickSet'
import { VariantBox } from '../VariantBox'
import { KEYS, type SetDraft, readSession, useSessionState, writeSession } from '../session'
import { deleteTask, type Report, reportTask, resolveReport, updateTask, useReports, useTasks } from '../store'

export function BankPage({
  uid,
  email = null,
  admin = false,
  preferred,
}: { uid: string; email?: string | null; admin?: boolean; preferred?: string }) {
  const { tasks, error } = useTasks(uid)
  const reports = useReports()
  const openReports = useMemo(() => {
    const m = new Map<string, Report[]>()
    for (const r of reports ?? []) if (r.status === 'open') m.set(r.taskId, [...(m.get(r.taskId) ?? []), r])
    return m
  }, [reports])
  const [filters, setFilters] = useSessionState<Filters>(KEYS.filters, EMPTY_FILTERS)
  const [selected, setSelected] = useSessionState<string[]>(KEYS.selection, [])
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [randomText, setRandomText] = useState('4')
  const [shortfall, setShortfall] = useState<{ wanted: number; found: Task[] } | null>(null)
  const [flash, setFlash] = useState<string | null>(() => {
    const f = readSession<string | null>('ob.flash', null)
    writeSession('ob.flash', null)
    return f
  })

  const all = tasks ?? []
  const byId = useMemo(() => new Map(all.map((t) => [t.id, t])), [all])
  const [onlyMine, setOnlyMine] = useSessionState<boolean>('ob.onlyMine', false)
  const [sort, setSort] = useSessionState<'new' | 'used' | 'level'>('ob.sort', 'new')
  const visible = useMemo(() => {
    const list = all.filter((t) => matches(t, filters) && (!onlyMine || t.ownerUid === uid))
    if (sort === 'used') return [...list].sort((a, b) => (b.usedCount ?? 0) - (a.usedCount ?? 0) || b.createdAt - a.createdAt)
    if (sort === 'level') return [...list].sort((a, b) => a.grade - b.grade || (a.niveau ?? '').localeCompare(b.niveau ?? '') || a.topic.localeCompare(b.topic, 'da'))
    return list
  }, [all, filters, onlyMine, uid, sort])
  // the first time per session, the bank opens on the teacher's own level
  useEffect(() => {
    if (preferred && !sessionStorage.getItem('ob.levelApplied')) {
      sessionStorage.setItem('ob.levelApplied', '1')
      if (!filtersActive(filters)) setFilters({ ...EMPTY_FILTERS, grade: preferred })
    }
  }, [preferred])
  const topics = useMemo(() => [...new Set(all.map((t) => t.topic))].sort((a, b) => a.localeCompare(b, 'da')), [all])
  // selections survive filter changes; tasks deleted elsewhere drop out
  const chosen = selected.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t))
  const chosenPoints = chosen.reduce((s, t) => s + taskPoints(t), 0)
  const selectedSet = new Set(selected)

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selectedSet.has(t.id))
  const toggleAllVisible = () =>
    setSelected((s) =>
      allVisibleSelected
        ? s.filter((id) => !visible.some((t) => t.id === id))
        : [...s, ...visible.map((t) => t.id).filter((id) => !s.includes(id))],
    )

  const openDraft = (ids: string[], origin: SetDraft['origin'], title = '', note?: string) => {
    writeSession(KEYS.draft, { title, taskIds: ids, origin, note, titleTouched: Boolean(title) } satisfies SetDraft)
    navigate('/saet/ny')
  }

  const randomSet = () => {
    const n = Math.max(1, Math.min(60, Math.round(Number(randomText)) || 1))
    setRandomText(String(n))
    if (visible.length < n) {
      setShortfall({ wanted: n, found: visible })
      return
    }
    openDraft(
      pickRandom(visible, n).map((t) => t.id),
      'random',
    )
  }

  const f = (patch: Partial<Filters>) => setFilters((x) => ({ ...x, ...patch }))

  return (
    <>
      <div className="page-head">
        <h1>Opgavebank</h1>
        <button type="button" className="btn outline" onClick={() => navigate('/generer')}>
          + Generér nye opgaver
        </button>
      </div>
      {flash && (
        <p className="notice ok" role="status">
          {flash}
        </p>
      )}
      {error && <p className="notice attention">Kunne ikke hente opgaverne: {error}</p>}

      {tasks !== null && (
        <QuickSet
          uid={uid}
          tasks={all}
          reported={new Set(openReports.keys())}
          preferred={preferred}
          onDraft={(ids, origin, title, note) => openDraft(ids, origin, title, note)}
        />
      )}

      <section className="panel filters" aria-label="Filtre">
        <label className="field">
          <span className="field-label">Klassetrin</span>
          <select value={filters.grade} onChange={(e) => f({ grade: e.target.value })}>
            <option value="">Alle</option>
            {LEVELS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Område</span>
          <select value={filters.area} onChange={(e) => f({ area: e.target.value })}>
            <option value="">Alle</option>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Emne</span>
          <select value={filters.topic} onChange={(e) => f({ topic: e.target.value })}>
            <option value="">Alle</option>
            {topics.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Sværhedsgrad</span>
          <select value={filters.difficulty} onChange={(e) => f({ difficulty: e.target.value })}>
            <option value="">Alle</option>
            {DIFFICULTIES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span className="field-label">Søg</span>
          <input type="search" placeholder="Søg i titel, tekst og facit" value={filters.q} onChange={(e) => f({ q: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Sortér</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="new">Nyeste først</option>
            <option value="used">Mest brugt</option>
            <option value="level">Klassetrin og emne</option>
          </select>
        </label>
        <label className="inline mine">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Kun mine opgaver
        </label>
        <button
          type="button"
          className="btn outline"
          disabled={!filtersActive(filters) && !onlyMine}
          onClick={() => {
            setFilters(EMPTY_FILTERS)
            setOnlyMine(false)
          }}
        >
          Nulstil filtre
        </button>
      </section>

      <section className="selection-bar" aria-live="polite">
        <span>
          <strong className="num">{chosen.length}</strong> valgt · <strong className="num">{chosenPoints}</strong> point
          {chosen.length > 0 && (
            <button type="button" className="link" onClick={() => setSelected([])}>
              Ryd valg
            </button>
          )}
        </span>
        <span className="bar-actions">
          <label className="inline">
            Antal
            <input
              type="number"
              min={1}
              max={60}
              className="num short"
              value={randomText}
              onChange={(e) => setRandomText(e.target.value)}
              aria-label="Antal opgaver i tilfældigt sæt"
            />
          </label>
          <button type="button" className="btn outline" onClick={randomSet} disabled={!all.length}>
            Dan tilfældigt sæt
          </button>
          <button type="button" className="btn primary" disabled={!chosen.length} onClick={() => openDraft(chosen.map((t) => t.id), 'manual')}>
            Dan opgavesæt
          </button>
        </span>
      </section>

      {shortfall && (
        <div className="notice highlight" role="alert">
          <p>
            Du bad om <strong>{shortfall.wanted}</strong> opgaver, men kun <strong>{shortfall.found.length}</strong>{' '}
            {shortfall.found.length === 1 ? 'opgave matcher' : 'opgaver matcher'} dine filtre.
          </p>
          <div className="actions">
            {shortfall.found.length > 0 && (
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setShortfall(null)
                  openDraft(
                    pickRandom(shortfall.found, shortfall.found.length).map((t) => t.id),
                    'random',
                  )
                }}
              >
                Brug de {shortfall.found.length}
              </button>
            )}
            <button type="button" className="btn outline" onClick={() => setShortfall(null)}>
              Justér filtrene
            </button>
          </div>
        </div>
      )}

      {tasks === null ? (
        <p className="muted">Henter opgaver …</p>
      ) : all.length === 0 ? (
        <div className="panel empty">
          <p>Din opgavebank er tom.</p>
          <button type="button" className="btn primary" onClick={() => navigate('/generer')}>
            Generér dine første opgaver
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="bank">
            <caption className="sr-only">Gemte opgaver</caption>
            <thead>
              <tr>
                <th>
                  <input type="checkbox" aria-label="Vælg alle viste" checked={allVisibleSelected} onChange={toggleAllVisible} />
                </th>
                <th>Titel</th>
                <th>Klassetrin</th>
                <th>Område</th>
                <th>Emne</th>
                <th>Sværhedsgrad</th>
                <th className="r">Point</th>
                <th className="r">Tid</th>
                <th>
                  <span className="sr-only">Vis</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    Ingen opgaver matcher filtrene.
                  </td>
                </tr>
              )}
              {visible.map((t) => (
                <BankRow
                  key={t.id}
                  task={t}
                  checked={selectedSet.has(t.id)}
                  onToggle={() => toggle(t.id)}
                  open={open === t.id}
                  onOpen={() => setOpen(open === t.id ? null : t.id)}
                  editing={editing === t.id}
                  onEdit={() => setEditing(t.id)}
                  onCancel={() => setEditing(null)}
                  onSave={async (nt) => {
                    await updateTask(uid, nt)
                    setEditing(null)
                    setFlash('Opgaven er opdateret. Gemte sæt bruger stadig den version, de blev gemt med.')
                  }}
                  onDelete={async () => {
                    if (!confirm(`Slet "${t.title}" fra den fælles bank? Den forsvinder også for dine kolleger. Gemte sæt påvirkes ikke.`)) return
                    await deleteTask(uid, t.id)
                    setSelected((s) => s.filter((x) => x !== t.id))
                  }}
                  topics={topics}
                  mine={t.ownerUid === uid}
                  admin={admin}
                  reports={openReports.get(t.id) ?? []}
                  uid={uid}
                  onReport={(message) => reportTask({ uid, email }, t, message)}
                />
              ))}
            </tbody>
          </table>
          <p className="muted small">
            Viser {visible.length} af {all.length} opgaver.
          </p>
        </div>
      )}
    </>
  )
}

function BankRow(props: {
  task: Task
  checked: boolean
  onToggle: () => void
  open: boolean
  onOpen: () => void
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (t: Task) => Promise<void>
  onDelete: () => void
  topics: string[]
  mine: boolean
  admin: boolean
  reports: Report[]
  uid: string
  onReport: (message: string) => Promise<void>
}) {
  const { task: t } = props
  const flagged = t.issues?.some((i) => i.level === 'error')
  return (
    <>
      <tr className={props.checked ? 'sel' : undefined}>
        <td>
          <input type="checkbox" checked={props.checked} onChange={props.onToggle} aria-label={`Vælg ${t.title}`} />
        </td>
        <td>
          <button type="button" className="link title" onClick={props.onOpen} aria-expanded={props.open}>
            {t.title}
          </button>
          {flagged && <span className="badge check">Tjek</span>}
          {t.editedByTeacher && <span className="badge quiet">Rettet</span>}
          {!props.mine && <span className="badge quiet">Kollega</span>}
          <QualityBadges task={t} />
          {props.reports.length > 0 && (
            <span className="badge check" title={props.reports.map((r) => r.message).join('\n')}>
              Fejl meldt{props.reports.length > 1 ? ` (${props.reports.length})` : ''}
            </span>
          )}
        </td>
        <td>{levelLabel(t, true)}</td>
        <td>{t.area}</td>
        <td>{t.topic}</td>
        <td>
          <DifficultyBadge d={t.difficulty} />
        </td>
        <td className="r num">{taskPoints(t)}</td>
        <td className="r num">{estMinutes(t)} min</td>
        <td>
          <button type="button" className="btn ghost xs" onClick={props.onOpen} aria-label={props.open ? 'Fold sammen' : 'Fold ud'}>
            {props.open ? '▴' : '▾'}
          </button>
        </td>
      </tr>
      {props.open && (
        <tr className="detail">
          <td />
          <td colSpan={8}>
            {props.editing ? (
              <TaskEditor task={t} topics={props.topics} onCancel={props.onCancel} onSave={props.onSave} />
            ) : (
              <>
                <IssueList issues={t.issues ?? []} />
                <ReportList reports={props.reports} canResolve={props.mine || props.admin} uid={props.uid} />
                <TaskView task={t} showGuide verified={t.verified} />
                <VariantBox uid={props.uid} task={t} />
                <ReportForm onReport={props.onReport} />
                {props.mine ? (
                  <div className="actions">
                    <button type="button" className="btn outline sm" onClick={props.onEdit}>
                      Rediger
                    </button>
                    <button type="button" className="btn ghost sm danger" onClick={props.onDelete}>
                      Slet
                    </button>
                  </div>
                ) : (
                  <div className="actions">
                    <p className="hint">Opgaven er lavet af en kollega. Du kan bruge den i dine sæt, men kun kollegaen kan rette eller slette den.</p>
                    {props.admin && (
                      <button type="button" className="btn ghost sm danger" onClick={props.onDelete}>
                        Slet (admin)
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

/** Open error reports on a task; the owner (and admins) can mark them resolved. */
function ReportList({ reports, canResolve, uid }: { reports: Report[]; canResolve: boolean; uid: string }) {
  if (!reports.length) return null
  return (
    <div className="notice attention" role="status">
      <strong>Kolleger har meldt fejl i opgaven:</strong>
      <ul className="reports">
        {reports.map((r) => (
          <li key={r.id}>
            “{r.message}” <span className="small">– {r.reporterEmail ?? 'en kollega'}, {new Date(r.createdAt).toLocaleDateString('da-DK')}</span>
            {(canResolve || r.reporterUid === uid) && (
              <button type="button" className="link" onClick={() => resolveReport(uid, r.id)}>
                Markér som løst
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ReportForm({ onReport }: { onReport: (message: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  if (state === 'sent')
    return (
      <p className="notice ok" role="status">
        Tak. Fejlen er meldt, og opgavens ejer kan se den.
      </p>
    )
  if (!open)
    return (
      <div className="actions">
        <button type="button" className="btn ghost sm" onClick={() => setOpen(true)}>
          Meld fejl i opgaven
        </button>
      </div>
    )
  return (
    <form
      className="report-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!text.trim() || state === 'sending') return
        setState('sending')
        try {
          await onReport(text)
          setState('sent')
        } catch {
          setState('error')
        }
      }}
    >
      <label className="field">
        <span className="field-label">Hvad er forkert?</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="fx Facit i 1b skal være 24 cm², ikke 22 cm²"
          required
          aria-label="Beskriv fejlen"
        />
      </label>
      {state === 'error' && <p className="error">Fejlen kunne ikke meldes. Prøv igen.</p>}
      <div className="actions">
        <button type="submit" className="btn outline sm" disabled={state === 'sending' || !text.trim()}>
          Send fejlmelding
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)}>
          Annullér
        </button>
      </div>
    </form>
  )
}
