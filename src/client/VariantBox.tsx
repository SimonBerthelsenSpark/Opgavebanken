import { useState } from 'react'
import type { GeneratedTask, Task } from '../shared/domain'
import { ApiError } from './api'
import { IssueList, TaskMeta, TaskView } from './components'
import { generateVariants } from './generation'
import { saveNewTasks, useProgression } from './store'

/** "Lav variant": a new task like this one (same, easier or harder), previewed before saving. */
export function VariantBox({ uid, task }: { uid: string; task: Task }) {
  const { progression } = useProgression(uid)
  const [by, setBy] = useState<-1 | 0 | 1>(0)
  const [state, setState] = useState<'idle' | 'working' | 'saved'>('idle')
  const [variant, setVariant] = useState<(GeneratedTask & { variantOf: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function make() {
    if (state === 'working') return
    setState('working')
    setError(null)
    setVariant(null)
    try {
      const [v] = await generateVariants([task], by, progression)
      if (!v) setError('Varianten kunne ikke laves. Prøv igen.')
      setVariant(v ?? null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Varianten kunne ikke laves. Prøv igen.')
    } finally {
      setState('idle')
    }
  }

  if (state === 'saved')
    return (
      <p className="notice ok" role="status">
        Varianten er gemt i banken.
      </p>
    )
  return (
    <div className="variant-box">
      <div className="actions">
        <span className="segmented" role="group" aria-label="Sværhed for variant">
          {(
            [
              [-1, 'Lettere'],
              [0, 'Samme sværhed'],
              [1, 'Sværere'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={by === v} onClick={() => setBy(v)}>
              {label}
            </button>
          ))}
        </span>
        <button type="button" className="btn outline sm" onClick={make} disabled={state === 'working'}>
          {state === 'working' ? 'Laver variant …' : 'Lav variant med AI'}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {variant && (
        <div className="variant-preview">
          <h3>{variant.title}</h3>
          <TaskMeta task={variant} />
          <IssueList issues={variant.issues} />
          <TaskView task={variant} showGuide verified={variant.verified} />
          <div className="actions">
            <button
              type="button"
              className="btn primary sm"
              onClick={async () => {
                await saveNewTasks(uid, [variant])
                setState('saved')
              }}
            >
              Gem varianten i banken
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setVariant(null)}>
              Kassér
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
