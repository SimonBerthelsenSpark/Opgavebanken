import { useState } from 'react'
import type { Task } from '../shared/domain'
import { LEVELS, levelKey } from '../shared/levels'
import { topicRequest } from '../shared/progression'
import { ApiError } from './api'
import { generateTasks } from './generation'
import { saveNewTasks, useProgression } from './store'

/**
 * Admin: fill the shared bank with curated "AImforA" starter tasks, so a new teacher never meets an
 * empty bank. Each run plans a mixed set across the level's syllabus; review the tasks afterwards in
 * the bank (they carry the AImforA badge) and delete any you don't like.
 */
export function StarterTool({ uid, tasks }: { uid: string; tasks: Task[] }) {
  const { progression } = useProgression(uid)
  const [running, setRunning] = useState<string | null>(null)
  const [status, setStatus] = useState<Record<string, string>>({})
  const [count, setCount] = useState(10)

  async function run(key: string) {
    if (running) return
    setRunning(key)
    setStatus((s) => ({ ...s, [key]: 'Planlægger …' }))
    try {
      const made = await generateTasks({
        levelKey: key,
        topic: topicRequest('mixed:all', key),
        count,
        difficulty: 'Blandet',
        progression,
        onProgress: (d, n) => setStatus((s) => ({ ...s, [key]: `Skriver opgaver (${d}/${n}) …` })),
      })
      await saveNewTasks(
        uid,
        made.map((t) => ({ ...t, source: 'starter' as const })),
      )
      setStatus((s) => ({ ...s, [key]: `${made.length} opgaver gemt.` }))
    } catch (e) {
      setStatus((s) => ({ ...s, [key]: e instanceof ApiError ? e.message : 'Fejlede. Prøv igen.' }))
    } finally {
      setRunning(null)
    }
  }

  return (
    <>
      <p className="lead">
        Startopgaver får mærket <span className="badge starter">AImforA</span> og ligger i den fælles bank, så nye lærere altid møder
        en bank med indhold. Gennemgå dem bagefter i banken (filtrér på niveauet), og slet dem, der ikke er gode nok.
      </p>
      <label className="inline toolbar">
        Antal pr. kørsel
        <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Antal startopgaver">
          {[5, 10, 15, 20].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="table-wrap">
        <table className="bank">
          <thead>
            <tr>
              <th>Niveau</th>
              <th className="r">Startopgaver</th>
              <th className="r">Alle opgaver</th>
              <th>
                <span className="sr-only">Handling</span>
              </th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {LEVELS.map((l) => {
              const of = tasks.filter((t) => levelKey(t) === l.key)
              return (
                <tr key={l.key}>
                  <td>{l.label}</td>
                  <td className="r num">{of.filter((t) => t.source === 'starter').length}</td>
                  <td className="r num">{of.length}</td>
                  <td>
                    <button type="button" className="btn outline xs" disabled={Boolean(running)} onClick={() => run(l.key)}>
                      Lav {count} startopgaver
                    </button>
                  </td>
                  <td className="small">{status[l.key] ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Én kørsel bruger ca. {Math.ceil(count / 2) + 1} AI-kald. Admin er fritaget for timeloftet, men døgnloftet gælder.</p>
    </>
  )
}
