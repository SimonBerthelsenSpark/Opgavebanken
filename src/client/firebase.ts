import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache } from 'firebase/firestore'

const env = import.meta.env
const useEmulators = env.VITE_USE_EMULATORS === '1'

export const firebaseConfigured = Boolean(env.VITE_FIREBASE_PROJECT_ID && (env.VITE_FIREBASE_API_KEY || useEmulators))

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-opgavebanken',
  appId: env.VITE_FIREBASE_APP_ID || undefined,
})

export const auth = getAuth(app)
auth.languageCode = 'da'

export const db = initializeFirestore(app, useEmulators ? {} : { localCache: persistentLocalCache() })

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
