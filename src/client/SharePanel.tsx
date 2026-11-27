import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import type { SavedSet } from '../shared/domain'
import { shareSet, unshareSet } from './store'

export const studentUrl = (token: string) => `${location.origin}/elev/${token}`

export async function qrPng(url: string): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: 'M' })
  const bin = atob(dataUrl.split(',')[1])
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

/** "Del med eleverne": a public, answer-free link with a QR code for the board or the sheet. */
export function SharePanel({ uid, set, onChange }: { uid: string; set: SavedSet; onChange: (s: SavedSet) => void }) {
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [big, setBig] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const url = set.shareToken ? studentUrl(set.shareToken) : null

  useEffect(() => {
    if (!url) return setQr(null)
    QRCode.toDataURL(url, { margin: 1, width: 720, errorCorrectionLevel: 'M' }).then(setQr)
  }, [url])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch {
      setError('Det lykkedes ikke. Er de nyeste Firestore-regler publiceret?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-label="Del med eleverne">
      <h2>Del digitalt med eleverne</h2>
      {!url ? (
        <>
          <p className="hint">
            Eleverne åbner opgaverne på iPad eller computer via et link eller en QR-kode – uden login. Facit og rettevejledning
            følger aldrig med.
          </p>
          <button type="button" className="btn outline" disabled={busy} onClick={() => run(async () => onChange({ ...set, shareToken: await shareSet(uid, set) }))}>
            Lav elevlink og QR-kode
          </button>
        </>
      ) : (
        <div className="share">
          {qr && (
            <button type="button" className="link" onClick={() => setBig(true)} title="Vis stort på tavlen" style={{ margin: 0 }}>
              <img src={qr} alt="QR-kode til elevernes udgave" />
            </button>
          )}
          <div>
            <div className="share-link">
              <input readOnly value={url} aria-label="Elevlink" onFocus={(e) => e.target.select()} />
              <button
                type="button"
                className="btn outline sm"
                onClick={async () => {
                  await navigator.clipboard?.writeText(url).catch(() => undefined)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? 'Kopieret' : 'Kopiér link'}
              </button>
            </div>
            <div className="actions">
              <button type="button" className="btn outline sm" onClick={() => setBig(true)}>
                Vis QR-koden på tavlen
              </button>
              <a className="btn ghost sm" href={url} target="_blank" rel="noreferrer">
                Se elevernes udgave
              </a>
              <button
                type="button"
                className="btn ghost sm danger"
                disabled={busy}
                onClick={() =>
                  confirm('Stop delingen? Linket og QR-koden holder op med at virke.') &&
                  run(async () => {
                    await unshareSet(uid, set)
                    const { shareToken: _, ...rest } = set
                    onChange(rest)
                  })
                }
              >
                Stop deling
              </button>
            </div>
            <p className="hint">QR-koden kommer også øverst på elevarket, når du downloader det.</p>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {big && qr && url && (
        <div className="qr-overlay" role="dialog" aria-label="QR-kode" onClick={() => setBig(false)}>
          <div>
            <img src={qr} alt="QR-kode til elevernes udgave" />
            <p>{url.replace(/^https?:\/\//, '')}</p>
            <span className="hint">Klik for at lukke</span>
          </div>
        </div>
      )}
    </section>
  )
}
