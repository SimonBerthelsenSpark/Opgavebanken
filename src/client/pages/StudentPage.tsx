import { useEffect, useState } from 'react'
import { partLabel, type StudentSet } from '../../shared/domain'
import { FigureView, MathText } from '../components'
import { loadShared } from '../store'

/** The digital student version of a set: no login, no answers. Opened from a link or QR code. */
export function StudentPage({ token }: { token: string }) {
  const [set, setSet] = useState<StudentSet | null | undefined>(undefined)
  useEffect(() => {
    loadShared(token)
      .then(setSet)
      .catch(() => setSet(null))
  }, [token])

  if (set === undefined) return <main className="page frame">Henter opgaverne …</main>
  if (set === null)
    return (
      <main className="page frame narrow">
        <div className="panel empty">
          <p>Opgavesættet findes ikke længere. Spørg din lærer om et nyt link.</p>
        </div>
      </main>
    )
  return (
    <>
      <header className="topbar student-bar">
        <div className="frame topbar-inner">
          <span className="wordmark">
            <span className="marking">Opgave</span>banken
          </span>
          <button type="button" className="btn ghost sm no-print" onClick={() => window.print()}>
            Udskriv
          </button>
        </div>
      </header>
      <main className="page frame student">
        <h1>{set.title}</h1>
        <p className="muted">
          <span className="num">{set.tasks.length}</span> opgaver · <span className="num">{set.totalPoints}</span> point · ca.{' '}
          <span className="num">{set.minutes}</span> minutter. Skriv dine svar på papir eller i dit eget dokument.
        </p>
        <ol className="set-list">
          {set.tasks.map((t, i) => (
            <li key={i} className="panel set-item">
              <h2 className="student-task">
                Opgave {i + 1} · {t.title}
                <span className="muted small num"> ({t.parts.reduce((s, p) => s + p.points, 0)} point)</span>
              </h2>
              {t.intro && (
                <p>
                  <MathText text={t.intro} />
                </p>
              )}
              {t.figure && <FigureView figure={t.figure} maxWidth={520} maxHeight={320} />}
              <ol className="parts">
                {t.parts.map((p, j) => (
                  <li key={j} className="part">
                    <div className="part-head">
                      <span className="part-label">{partLabel(i + 1, j, t.parts.length)}</span>
                      <span className="part-q">
                        <MathText text={p.question} />
                      </span>
                      <span className="muted num">{p.points} p</span>
                    </div>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
        <p className="muted small">Lavet med Opgavebanken fra AImforA.</p>
      </main>
    </>
  )
}
