import { Fragment, useEffect, useMemo, useState } from 'react'
import type { UsageStats } from '../../shared/admin'
import { AREAS } from '../../shared/domain'
import { LEVELS, levelKey } from '../../shared/levels'
import { adminStats, ApiError } from '../api'
import { TaskView } from '../components'
import { StarterTool } from '../StarterTool'
import { deleteTask, type Profile, resolveReport, useLogins, useProfiles, useReports, useTasks } from '../store'

const DAY = 86_400_000
const fmt = (ms?: number) =>
  ms ? new Date(ms).toLocaleString('da-DK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'
const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString('da-DK', { dateStyle: 'medium' }) : '–')
const providerName = (p: string) => (p === 'google.com' ? 'Google' : p === 'password' ? 'E-mail' : p)

export function AdminPage({ uid, admin = false }: { uid: string; admin?: boolean }) {
  const { profiles, error } = useProfiles()
  const logins = useLogins(100)
  const { tasks } = useTasks(uid)
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)
  const reports = useReports()
  const [showResolved, setShowResolved] = useState(false)
  const [openTask, setOpenTask] = useState<string | null>(null)
  const openCount = (reports ?? []).filter((r) => r.status === 'open').length
  const [tab, setTab] = useState<'users' | 'logins' | 'bank' | 'reports' | 'starter'>('users')

  useEffect(() => {
    adminStats()
      .then(setUsage)
      .catch((e) => setUsageError(e instanceof ApiError ? e.message : 'AI-forbruget kunne ikke hentes.'))
  }, [])

  const now = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const tasksByOwner = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tasks ?? []) m.set(t.ownerUid, (m.get(t.ownerUid) ?? 0) + 1)
    return m
  }, [tasks])

  const rows = useMemo(() => {
    const list: (Profile & { known: boolean })[] = (profiles ?? []).map((p) => ({ ...p, known: true }))
    // teachers who saved tasks before profiles existed
    for (const owner of tasksByOwner.keys())
      if (!list.some((p) => p.uid === owner))
        list.push({ uid: owner, email: null, name: null, provider: '', emailVerified: false, createdAt: 0, lastLoginAt: 0, loginCount: 0, known: false })
    return list.sort((a, b) => (b.lastLoginAt ?? 0) - (a.lastLoginAt ?? 0))
  }, [profiles, tasksByOwner])

  const use = (id: string, days: number) =>
    (usage?.users[id] ?? []).filter((u) => Date.parse(u.day) > now - days * DAY).reduce((s, u) => ({ calls: s.calls + u.calls, tasks: s.tasks + u.tasks }), { calls: 0, tasks: 0 })
  const callsToday = Object.values(usage?.users ?? {}).flat().filter((u) => u.day === today).reduce((s, u) => s + u.calls, 0)
  const active7 = rows.filter((r) => r.lastLoginAt > now - 7 * DAY).length
  const setTotal = rows.reduce((s, r) => s + Math.max(0, r.setCount ?? 0), 0)
  const loginsToday = (logins ?? []).filter((l) => l.at > now - DAY).length

  if (error)
    return (
      <p className="notice attention" role="alert">
        Adminoversigten kunne ikke hentes: {error}. Er de nyeste Firestore-regler publiceret?
      </p>
    )

  return (
    <>
      <div className="page-head">
        <h1>Admin</h1>
      </div>

      <section className="stats" aria-label="Overblik">
        <Stat label="Lærere" value={rows.length} note={`${active7} aktive de sidste 7 dage`} />
        <Stat label="Opgaver i banken" value={tasks?.length ?? '…'} />
        <Stat label="Gemte sæt" value={setTotal} />
        <Stat label="Logins seneste døgn" value={loginsToday} />
        <Stat label="Åbne fejlmeldinger" value={openCount} />
        <Stat
          label="AI-kald i dag"
          value={usage ? callsToday : '…'}
          note={usage ? `loft ${usage.dayLimit} pr. døgn · ${usage.hourLimit} pr. lærer i timen` : usageError ?? undefined}
        />
      </section>

      <div className="tabs-inline" role="tablist">
        {(
          [
            ['users', 'Brugere'],
            ['logins', 'Logins'],
            ['bank', 'Opgavebanken'],
            ['reports', `Fejlmeldinger${openCount ? ` (${openCount})` : ''}`],
            ...(admin ? ([['starter', 'Startopgaver']] as const) : []),
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="table-wrap">
          <table className="bank">
            <thead>
              <tr>
                <th>Bruger</th>
                <th>Login med</th>
                <th>E-mail bekræftet</th>
                <th>Oprettet</th>
                <th>Seneste login</th>
                <th className="r">Logins</th>
                <th className="r">Opgaver</th>
                <th className="r">Sæt</th>
                <th className="r">AI-kald 7 d.</th>
                <th className="r">Genereret 7 d.</th>
              </tr>
            </thead>
            <tbody>
              {profiles === null && (
                <tr>
                  <td colSpan={10} className="muted">
                    Henter …
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const u = use(r.uid, 7)
                return (
                  <tr key={r.uid}>
                    <td>
                      {r.known ? (
                        <>
                          {r.email ?? r.name ?? r.uid}
                          {r.uid === uid && <span className="badge quiet">Dig</span>}
                        </>
                      ) : (
                        <span className="muted" title={r.uid}>
                          Ukendt (ikke logget ind siden admin kom til)
                        </span>
                      )}
                    </td>
                    <td>{r.known ? providerName(r.provider) : '–'}</td>
                    <td>{r.known ? (r.emailVerified ? <span className="badge ok">✓ Ja</span> : <span className="badge quiet">Nej</span>) : '–'}</td>
                    <td>{fmtDate(r.createdAt)}</td>
                    <td>{fmt(r.lastLoginAt)}</td>
                    <td className="r num">{r.loginCount || '–'}</td>
                    <td className="r num">{tasksByOwner.get(r.uid) ?? 0}</td>
                    <td className="r num">{Math.max(0, r.setCount ?? 0)}</td>
                    <td className="r num">{usage ? u.calls : '…'}</td>
                    <td className="r num">{usage ? u.tasks : '…'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'logins' && (
        <div className="table-wrap">
          <table className="bank">
            <thead>
              <tr>
                <th>Tidspunkt</th>
                <th>Bruger</th>
                <th>Enhed</th>
              </tr>
            </thead>
            <tbody>
              {(logins ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="num">{fmt(l.at)}</td>
                  <td>{l.email ?? l.uid}</td>
                  <td>{l.device}</td>
                </tr>
              ))}
              {logins?.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">
                    Ingen logins registreret endnu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="muted small">De seneste 100 logins. Et login registreres én gang pr. browsersession.</p>
        </div>
      )}

      {tab === 'starter' && admin && <StarterTool uid={uid} tasks={tasks ?? []} />}

      {tab === 'reports' && (
        <>
          <label className="inline toolbar">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Vis også løste
          </label>
          <div className="table-wrap">
            <table className="bank">
              <thead>
                <tr>
                  <th>Meldt</th>
                  <th>Opgave</th>
                  <th>Fejl</th>
                  <th>Meldt af</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Handlinger</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(reports ?? [])
                  .filter((r) => showResolved || r.status === 'open')
                  .map((r) => {
                    const task = (tasks ?? []).find((t) => t.id === r.taskId)
                    const canResolve = admin || r.ownerUid === uid || r.reporterUid === uid
                    return (
                      <Fragment key={r.id}>
                        <tr>
                          <td className="num">{fmt(r.createdAt)}</td>
                          <td>
                            {task ? (
                              <button type="button" className="link title" onClick={() => setOpenTask(openTask === r.id ? null : r.id)}>
                                {r.taskTitle}
                              </button>
                            ) : (
                              <span className="muted">{r.taskTitle} (slettet)</span>
                            )}
                          </td>
                          <td>{r.message}</td>
                          <td>{r.reporterEmail ?? '–'}</td>
                          <td>{r.status === 'open' ? <span className="badge check">Åben</span> : <span className="badge ok">Løst</span>}</td>
                          <td className="r">
                            {r.status === 'open' && canResolve && (
                              <button type="button" className="btn outline xs" onClick={() => resolveReport(uid, r.id)}>
                                Markér som løst
                              </button>
                            )}
                            {admin && task && r.status === 'open' && (
                              <button
                                type="button"
                                className="btn ghost xs danger"
                                onClick={async () => {
                                  if (!confirm(`Slet "${task.title}" fra den fælles bank?`)) return
                                  await deleteTask(uid, task.id)
                                  await resolveReport(uid, r.id)
                                }}
                              >
                                Slet opgaven
                              </button>
                            )}
                          </td>
                        </tr>
                        {openTask === r.id && task && (
                          <tr className="detail">
                            <td colSpan={6}>
                              <TaskView task={task} showGuide verified={task.verified} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                {reports && !reports.some((r) => showResolved || r.status === 'open') && (
                  <tr>
                    <td colSpan={6} className="muted">
                      Ingen åbne fejlmeldinger.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted small">Opgavens ejer får besked i banken og kan rette opgaven. Ejeren, den der meldte fejlen, og admin kan markere den som løst.</p>
        </>
      )}

      {tab === 'bank' && (
        <div className="table-wrap">
          <table className="bank">
            <thead>
              <tr>
                <th>Klassetrin</th>
                {AREAS.map((a) => (
                  <th key={a} className="r">
                    {a}
                  </th>
                ))}
                <th className="r">I alt</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((l) => {
                const of = (tasks ?? []).filter((t) => levelKey(t) === l.key)
                return (
                  <tr key={l.key}>
                    <td>{l.label}</td>
                    {AREAS.map((a) => (
                      <td key={a} className="r num">
                        {of.filter((t) => t.area === a).length || '·'}
                      </td>
                    ))}
                    <td className="r num">
                      <strong>{of.length}</strong>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="muted small">Opgaver i den fælles bank fordelt på klassetrin og område. Bruges til at se, hvor banken er tynd.</p>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="panel stat">
      <span className="field-label">{label}</span>
      <strong className="num">{value}</strong>
      {note && <span className="hint">{note}</span>}
    </div>
  )
}
