import { useState } from 'react'
import { LEVELS } from '../../shared/levels'
import { navigate } from '../App'
import { setPreferredLevel } from '../store'

/** First login (and "Mit niveau"): pick the level you mostly teach; the app starts there. */
export function WelcomePage({ uid, current }: { uid: string; current?: string }) {
  const [level, setLevel] = useState(current ?? '5')
  const [busy, setBusy] = useState(false)
  return (
    <div className="panel welcome">
      <h1>{current ? 'Mit niveau' : 'Velkommen til Opgavebanken'}</h1>
      {!current && (
        <>
          <p className="lead">Her finder, laver og printer du matematikopgaver – sammen med dine kolleger.</p>
          <ol>
            <li>
              <strong>Find opgaver</strong> i den fælles bank. Alle facit med tal er efterregnet, og kolleger melder fejl, hvis de finder nogen.
            </li>
            <li>
              <strong>Lav nye opgaver med AI</strong> om lige det emne, du har brug for – eller lav et helt sæt med ét klik.
            </li>
            <li>
              <strong>Print tre PDF’er</strong>: elevark, rettevejledning og pointtabel.
            </li>
          </ol>
        </>
      )}
      <label className="field">
        <span className="field-label">Hvilket klassetrin eller niveau underviser du mest?</span>
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Mit niveau">
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
        <span className="hint">Banken og “Generér opgaver” starter på dette niveau. Du kan altid vælge andre niveauer og ændre det her.</span>
      </label>
      <div className="actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await setPreferredLevel(uid, level).catch(() => undefined)
            sessionStorage.removeItem('ob.levelApplied')
            navigate('/')
          }}
        >
          {current ? 'Gem' : 'Kom i gang'}
        </button>
      </div>
    </div>
  )
}
