import { onAuthStateChanged, sendEmailVerification, signOut, type User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth, firebaseConfigured } from './firebase'
import { migratePrivateTasks, recordLogin } from './store'
import { isAdminEmail } from '../shared/admin'
import { AdminPage } from './pages/AdminPage'
import { BankPage } from './pages/BankPage'
import { GeneratePage } from './pages/GeneratePage'
import { LoginPage } from './pages/LoginPage'
import { ProgressionPage } from './pages/ProgressionPage'
import { SetDraftPage, SavedSetPage } from './pages/SetPages'
import { SetsPage } from './pages/SetsPage'

export function navigate(path: string) {
  if (location.pathname !== path) history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

function usePath() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const on = () => setPath(location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  return path
}

const TABS = [
  { path: '/', label: 'Opgavebank' },
  { path: '/generer', label: 'Generér opgaver' },
  { path: '/saet', label: 'Gemte sæt' },
  { path: '/progression', label: 'Progression' },
]

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const path = usePath()
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u)
        // version 1 kept a private bank per teacher; move it into the shared bank once
        if (u) {
          migratePrivateTasks(u.uid).catch((e) => console.warn('Flytning af opgaver mislykkedes', e))
          recordLogin(u).catch((e) => console.warn('Login kunne ikke registreres', e))
        }
      }),
    [],
  )

  if (!firebaseConfigured)
    return (
      <main className="page narrow">
        <div className="notice attention">
          Firebase er ikke sat op endnu. Udfyld VITE_FIREBASE_*-værdierne (se docs/OPSAETNING.md).
        </div>
      </main>
    )
  if (user === undefined) return <main className="page">Indlæser …</main>
  if (!user) return <LoginPage />

  const uid = user.uid
  const admin = isAdminEmail(user.email, import.meta.env.MODE === 'e2e' || import.meta.env.VITE_USE_EMULATORS === '1')
  const tabs = admin ? [...TABS, { path: '/admin', label: 'Admin' }] : TABS
  let page: React.ReactNode
  let active = '/'
  if (path === '/generer') {
    page = <GeneratePage uid={uid} />
    active = '/generer'
  } else if (path === '/saet/ny') {
    page = <SetDraftPage uid={uid} />
  } else if (path.startsWith('/saet/')) {
    page = <SavedSetPage uid={uid} id={decodeURIComponent(path.slice(6))} />
    active = '/saet'
  } else if (path === '/saet') {
    page = <SetsPage uid={uid} />
    active = '/saet'
  } else if (path === '/progression') {
    page = <ProgressionPage uid={uid} />
    active = '/progression'
  } else if (path === '/admin' && admin) {
    page = <AdminPage uid={uid} />
    active = '/admin'
  } else page = <BankPage uid={uid} admin={admin} />

  return (
    <>
      <header className="topbar">
        <div className="frame topbar-inner">
          <a
            href="/"
            className="wordmark"
            onClick={(e) => {
              e.preventDefault()
              navigate('/')
            }}
          >
            <span className="marking">Opgave</span>banken <small>fra AImforA</small>
          </a>
          <nav className="tabs" aria-label="Hovedmenu">
            {tabs.map((t) => (
              <a
                key={t.path}
                href={t.path}
                aria-current={active === t.path ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(t.path)
                }}
              >
                {t.label}
              </a>
            ))}
          </nav>
          <div className="user">
            <span className="muted small">{user.email}</span>
            <button type="button" className="btn ghost sm" onClick={() => signOut(auth)}>
              Log ud
            </button>
          </div>
        </div>
      </header>
      <main className="page frame">
        {!user.emailVerified && user.providerData.some((p) => p.providerId === 'password') && <VerifyNotice user={user} />}
        {page}
      </main>
    </>
  )
}

function VerifyNotice({ user }: { user: User }) {
  const [sent, setSent] = useState(false)
  return (
    <p className="notice highlight" role="status">
      Bekræft din e-mail ({user.email}) via linket, vi har sendt. Derefter skal du logge ud og ind igen.{' '}
      {sent ? (
        'Linket er sendt igen.'
      ) : (
        <button type="button" className="link" onClick={() => sendEmailVerification(user).then(() => setSent(true))}>
          Send linket igen
        </button>
      )}
    </p>
  )
}
