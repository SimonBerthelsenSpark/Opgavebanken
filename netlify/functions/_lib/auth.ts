import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
)

export interface User {
  uid: string
  email: string | null
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message)
  }
}

/**
 * Verifies the Firebase ID token in the Authorization header against Google's public keys.
 * No service account is needed: the token's issuer and audience must match FIREBASE_PROJECT_ID.
 * AUTH_EMULATOR=1 (local development only, never set on Netlify) accepts the unsigned tokens
 * the Firebase Auth emulator issues.
 */
export async function requireUser(req: Request): Promise<User> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) throw new AuthError('Du skal være logget ind.')
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID
  if (!projectId) throw new AuthError('FIREBASE_PROJECT_ID mangler på serveren.', 500)

  let payload: Record<string, unknown>
  if (process.env.AUTH_EMULATOR === '1' && process.env.CONTEXT !== 'production') {
    payload = decodeJwt(token)
    if (payload.aud !== projectId) throw new AuthError('Ugyldigt login.')
  } else {
    try {
      ;({ payload } = await jwtVerify(token, JWKS, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ['RS256'],
      }))
    } catch {
      throw new AuthError('Dit login er udløbet. Log ind igen.')
    }
  }
  const uid = typeof payload.sub === 'string' ? payload.sub : ''
  if (!uid) throw new AuthError('Ugyldigt login.')
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null

  // Every teacher can generate, but only with a confirmed e-mail (Google accounts are confirmed).
  // The emulator's test accounts are unconfirmed, so local development skips this check.
  const emulator = process.env.AUTH_EMULATOR === '1' && process.env.CONTEXT !== 'production'
  if (!emulator && payload.email_verified !== true)
    throw new AuthError('Bekræft din e-mail via linket, vi har sendt dig, og log ind igen.', 403)

  // Optional allow-list (empty = every teacher with a confirmed e-mail).
  const allowed = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (allowed.length && (!email || !allowed.includes(email)))
    throw new AuthError('Din konto har ikke adgang til AI-generering endnu.', 403)
  return { uid, email }
}
