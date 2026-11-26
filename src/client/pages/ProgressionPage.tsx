import { useEffect, useState } from 'react'
import { AREAS, GRADES } from '../../shared/domain'
import { OFFICIAL_GOALS, type Progression, SOURCES, stageFor } from '../../shared/progression'
import { resetProgression, saveProgression, useProgression } from '../store'

export function ProgressionPage({ uid }: { uid: string }) {
  const { progression, custom } = useProgression(uid)
  const [grade, setGrade] = useState(5)
  const [draft, setDraft] = useState<Progression>(progression)
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => setDraft(progression), [progression])
  const stage = stageFor(grade)
  const dirty = JSON.stringify(draft) !== JSON.stringify(progression)

  return (
    <>
      <div className="page-head">
        <h1>Faglig progression</h1>
      </div>
      <p className="lead">
        Progressionen bruges, når AI vurderer, om et emne passer til klassetrinnet, og når opgaverne skrives. Siden skelner mellem
        de <strong>officielle mål</strong>, som gælder for et helt trinforløb, og <strong>appens vejledende placering</strong> på det
        enkelte klassetrin, som du selv kan rette.
      </p>
      <div className="tabs-inline" role="tablist" aria-label="Klassetrin">
        {GRADES.map((g) => (
          <button key={g} type="button" role="tab" aria-selected={g === grade} className={g === grade ? 'on' : ''} onClick={() => setGrade(g)}>
            {g}. kl.
          </button>
        ))}
      </div>

      <div className="two-col">
        <section className="panel">
          <h2>Appens vejledende placering · {grade}. klasse</h2>
          <p className="hint">Din egen beskrivelse af, hvad der typisk arbejdes med på netop dette klassetrin. {custom ? 'Du har rettet progressionen.' : 'Standardforslag.'}</p>
          {AREAS.map((area) => (
            <label key={area} className="field">
              <span className="field-label">{area}</span>
              <textarea
                rows={3}
                value={draft[String(grade)]?.[area] ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [String(grade)]: { ...d[String(grade)], [area]: e.target.value } }))
                }
              />
            </label>
          ))}
          <div className="actions">
            <button
              type="button"
              className="btn primary"
              disabled={!dirty}
              onClick={async () => {
                await saveProgression(uid, draft)
                setStatus('Progressionen er gemt.')
              }}
            >
              Gem progression
            </button>
            <button
              type="button"
              className="btn outline"
              disabled={!custom}
              onClick={async () => {
                if (!confirm('Gendan standardprogressionen for alle klassetrin?')) return
                await resetProgression(uid)
                setStatus('Standardprogressionen er gendannet.')
              }}
            >
              Gendan standard
            </button>
          </div>
          {status && (
            <p className="notice ok" role="status">
              {status}
            </p>
          )}
        </section>

        <section className="panel">
          <h2>Officielle mål · trinforløbet {stage.name}</h2>
          <p className="hint">
            Gælder for hele trinforløbet, ikke for det enkelte klassetrin. Kort gengivet efter fagplan-udkastet (juni 2026). Kan ikke
            redigeres.
          </p>
          {AREAS.map((area) => (
            <div key={area} className="goal">
              <h3>{area}</h3>
              <ul>
                {stage.goals[area].map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          ))}
          <h3>Kilder</h3>
          <ul className="sources">
            {SOURCES.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <br />
                <span className="hint">{s.note}</span>
              </li>
            ))}
          </ul>
          <p className="hint">Trinforløb: {OFFICIAL_GOALS.map((s) => s.name).join(', ')}.</p>
        </section>
      </div>
    </>
  )
}
