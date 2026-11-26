/**
 * Who sees the admin menu. Keep in sync with isAdmin() in firestore.rules.
 * Test modes (the e2e build and the auth emulator) also accept addresses ending in @admin.test.
 */
export const ADMIN_EMAILS = ['simonberthelsen@hotmail.com']

export function isAdminEmail(email: string | null | undefined, testMode = false): boolean {
  if (!email) return false
  const e = email.toLowerCase()
  return ADMIN_EMAILS.includes(e) || (testMode && e.endsWith('@admin.test'))
}

export interface UsageDay {
  day: string
  calls: number
  tasks: number
}

/** Per teacher (uid): AI calls and generated tasks per day, newest first. */
export type UsageStats = { days: string[]; dayLimit: number; hourLimit: number; users: Record<string, UsageDay[]> }
