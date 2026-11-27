import { useState } from 'react'
import { type Filters, matches, pickForDuration } from '../shared/bank'
import { type Difficulty, estMinutes, type Task } from '../shared/domain'
import { levelOf } from '../shared/levels'
import { topicRequest } from '../shared/progression'
import { ApiError } from './api'
import { generateTasks } from './generation'
import type { SetDraft } from './session'
import { saveNewTasks, useProgression } from './store'

const DURATIONS = [20, 30, 45, 60, 90]

/**
 * "Lav sæt med ét klik": picks good tasks for a duration from the bank, using the bank's own filters
 * (level, area, topic, difficulty), and generates only what is missing. Opens the usual set preview.
 */
export function QuickSet({
  uid,
  tasks,
  reported,
  filters,
  onDraft,
}: {
  uid: string
  tasks: Task[]
  reported: Set<string>
  filters: Filters
  onDraft: (ids: string[], origin: SetDraft['origin'], title: string, note: string) => void
}) {
  const { progression } = useProgression(uid)
  const [minutes, setMinutes] = useState(45)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // the set follows the bank's filters: level is required, topic/area narrow it
  const level = filters.grade
  const lv = level ? levelOf(level) : null
  const topic = filters.topic ? filters.topic : filters.area ? `mixed:${filters.area}` : 'mixed:all'

  async function build() {
    if (busy || !lv) return
    setBusy(true)
    setError(null)
    try {
      const candidates = tasks.filter((t) => matches(t, filters) && !reported.has(t.id))
      const { picked, minutes: have } = pickForDuration(candidates, minutes)
      let ids = picked.map((t) => t.id)
      let made = 0
      const missing = minutes - have
      if (missing > 5) {
        const avg = lv.grade >= 10 ? 10 : lv.grade >= 7 ? 7 : 5
        const count = Math.min(8, Math.max(1, Math.round(missing / avg)))
        setStatus(`Banken har ${picked.length} passende opgaver. Laver ${count} nye med AI …`)
        const generated = await generateTasks({
          levelKey: lv.key,
          topic: topicRequest(topic, lv.key),
          count,
          difficulty: (filters.difficulty || 'Blandet') as Difficulty | 'Blandet',
          progression,
          onProgress: (d, n) => setStatus(`Laver nye opgaver med AI (${d}/${n}) …`),
        })
        let left = missing
        const use = generated.filter((g) => {
          if (left <= 2) return false
          left -= estMinutes(g)
          return true
        })
        if (use.length) {
          ids = [...ids, ...(await saveNewTasks(uid, use))]
          made = use.length
        }
      }
      if (!ids.length) {
        setError('Der kunne ikke findes eller laves opgaver. Prøv andre filtre.')
        return
      }
      const topicName = filters.topic || filters.area || 'Blandede emner'
      onDraft(
        ids,
        'quick',
        `${topicName} · ${lv.label} · ${minutes} min`,
        made
          ? `Sammensat automatisk ud fra dine filtre: ${ids.length - made} opgaver fra banken og ${made} nye, som er lavet med AI og gemt i banken.`
          : `Sammensat automatisk ud fra dine filtre: ${ids.length} opgaver fra banken. Der var ikke brug for nye.`,
      )
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sættet kunne ikke laves. Prøv igen.')
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  return (
    <>
      <label className="inline">
        Varighed
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={busy} aria-label="Varighed">
          {DURATIONS.map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn outline"
        onClick={build}
        disabled={busy || !lv}
        title={lv ? 'Vælger opgaver ud fra dine filtre og laver kun det, der mangler, med AI' : 'Vælg et klassetrin i filtret først'}
      >
        {busy ? 'Laver sættet …' : 'Lav sæt med ét klik'}
      </button>
      {(status || error || !lv) && (
        <span className={`bar-note ${error ? 'error' : 'hint'}`} role={error ? 'alert' : undefined}>
          {error ?? status ?? 'Vælg et klassetrin i filtret for at lave et sæt med ét klik.'}
        </span>
      )}
    </>
  )
}
