import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth'
import { useState } from 'react'
import { auth } from '../firebase'

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Forkert e-mail eller adgangskode.',
  'auth/invalid-email': 'E-mailadressen er ikke gyldig.',
  'auth/email-already-in-use': 'Der findes allerede en konto med den e-mail. Log ind i stedet.',
  'auth/weak-password': 'Adgangskoden skal være mindst 6 tegn.',
  'auth/too-many-requests': 'For mange forsøg. Vent lidt og prøv igen.',
  'auth/unauthorized-domain': 'Domænet er ikke godkendt i Firebase (Authentication → Settings → Authorized domains).',
  'auth/operation-not-allowed': 'Login-metoden er ikke slået til i Firebase.',
  'auth/popup-closed-by-user': 'Login-vinduet blev lukket.',
}
const msg = (e: unknown) => MESSAGES[(e as { code?: string }).code ?? ''] ?? 'Login mislykkedes. Prøv igen.'

export function LoginPage() {
  const [mode, setMode] = useState<'login' | 'create'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      await fn()
    } catch (e) {
      setError(msg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="card login-card">
        <p className="wordmark big">
          <span className="marking">Opgave</span>banken
        </p>
        <p className="muted">Generér matematikopgaver med AI, gem dem i din egen opgavebank og dan printklare opgavesæt.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(() =>
              mode === 'login'
                ? signInWithEmailAndPassword(auth, email.trim(), password)
                : createUserWithEmailAndPassword(auth, email.trim(), password).then((c) =>
                    sendEmailVerification(c.user).catch(() => undefined),
                  ),
            )
          }}
        >
          <label className="field">
            <span className="field-label">E-mail</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span className="field-label">Adgangskode</span>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {info && <p className="notice ok">{info}</p>}
          <button type="submit" className="btn primary wide" disabled={busy}>
            {mode === 'login' ? 'Log ind' : 'Opret konto'}
          </button>
        </form>
        <button type="button" className="btn outline wide" disabled={busy} onClick={() => run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>
          Fortsæt med Google
        </button>
        <div className="login-links">
          <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'create' : 'login')}>
            {mode === 'login' ? 'Opret en ny konto' : 'Jeg har allerede en konto'}
          </button>
          {mode === 'login' && (
            <button
              type="button"
              className="link"
              onClick={() =>
                email
                  ? run(async () => {
                      await sendPasswordResetEmail(auth, email.trim())
                      setInfo('Vi har sendt et link til at nulstille adgangskoden.')
                    })
                  : setError('Skriv din e-mail først.')
              }
            >
              Glemt adgangskode?
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
