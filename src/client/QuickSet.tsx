import { useState } from 'react'
import { pickForDuration } from '../shared/bank'
import { type Difficulty, estMinutes, type Task } from '../shared/domain'
import { LEVELS, levelKey, levelOf } from '../shared/levels'
import { GRADE_TOPICS, topicRequest } from '../shared/progression'
import { ApiError } from './api'
import { generateTasks } from './generation'
import type { SetDraft } from './session'
import { saveNewTasks, useProgression } from './store'

const DURATIONS = [20, 30, 45, 60, 90]

/**
 * "Lav et sæt med ét klik": picks good tasks from the shared bank for a level, topic and duration,
 * and generates only what is missing. Opens the usual set preview.
 */
export function QuickSet({
  uid,
  tasks,
  reported,
  preferred,
  onDraft,
}: {
  uid: string
  tasks: Task[]
  reported: Set<string>
  preferred?: string
  onDraft: (ids: string[], origin: SetDraft['origin'], title: string, note: string) => void
}) {
  const { progression } = useProgression(uid)
  const [level, setLevel] = useState(preferred ?? '5')
  const [topic, setTopic] = useState('mixed:all')
  const [minutes, setMinutes] = useState(45)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const catalog = GRADE_TOPICS[level] ?? {}
  const lv = levelOf(level)

  const fits = (t: Task) => {
    if (levelKey(t) !== level || reported.has(t.id)) return false
    if (topic === 'mixed:all') return true
    if (topic.startsWith('mixed:')) return t.area === topic.slice(6)
    return t.topic.toLocaleLowerCase('da') === topic.toLocaleLowerCase('da')
  }

  async function build() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const { picked, minutes: have } = pickForDuration(tasks.filter(fits), minutes)
      let ids = picked.map((t) => t.id)
      let made = 0
      const missing = minutes - have
      if (missing > 5) {
        const avg = lv.grade >= 10 ? 10 : lv.grade >= 7 ? 7 : 5
        const count = Math.min(8, Math.max(1, Math.round(missing / avg)))
        setStatus(`Banken har ${picked.length} passende opgaver. Laver ${count} nye med AI …`)
        const generated = await generateTasks({
          levelKey: level,
          topic: topicRequest(topic, level),
          count,
          difficulty: 'Blandet' as Difficulty | 'Blandet',
          progression,
          onProgress: (d, n) => setStatus(`Laver nye opgaver med AI (${d}/${n}) …`),
        })
        // keep only what fits the remaining time
        let left = missing
        const use = generated.filter((g) => {
          const m = estMinutes(g)
          if (left <= 2) return false
          left -= m
          return true
        })
        if (use.length) {
          const newIds = await saveNewTasks(uid, use)
          ids = [...ids, ...newIds]
          made = use.length
        }
      }
      if (!ids.length) {
        setError('Der kunne ikke findes eller laves opgaver. Prøv et andet emne.')
        return
      }
      const topicName = topic === 'mixed:all' ? 'Blandede emner' : topic.startsWith('mixed:') ? topic.slice(6) : topic
      onDraft(
        ids,
        'quick',
        `${topicName} · ${lv.label} · ${minutes} min`,
        made
          ? `Sammensat automatisk: ${ids.length - made} opgaver fra banken og ${made} nye, som er lavet med AI og gemt i banken.`
          : `Sammensat automatisk af ${ids.length} opgaver fra banken. Der var ikke brug for nye.`,
      )
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sættet kunne ikke laves. Prøv igen.')
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  return (
    <section className="panel quick" aria-label="Lav et sæt med ét klik">
      <h2>Lav et sæt med ét klik</h2>
      <label className="field">
        <span className="field-label">Niveau</span>
        <select
          value={level}
          aria-label="Niveau for hurtigt sæt"
          onChange={(e) => {
            setLevel(e.target.value)
            setTopic('mixed:all')
          }}
          disabled={busy}
        >
          {LEVELS.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field grow">
        <span className="field-label">Emne</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} disabled={busy} aria-label="Emne for hurtigt sæt">
          <option value="mixed:all">Blandet – hele pensum</option>
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
        </select>
      </label>
      <label className="field">
        <span className="field-label">Varighed</span>
        <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} disabled={busy} aria-label="Varighed">
          {DURATIONS.map((m) => (
            <option key={m} value={m}>
              {m} minutter
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn primary" onClick={build} disabled={busy}>
        {busy ? 'Laver sættet …' : 'Lav sættet'}
      </button>
      {status && <p className="hint full">{status}</p>}
      {error && (
        <p className="error full" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
