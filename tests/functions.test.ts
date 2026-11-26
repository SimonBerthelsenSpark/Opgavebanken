import { beforeAll, describe, expect, it } from 'vitest'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const token = (aud: string, sub = 'teacher-1') => `${b64({ alg: 'none' })}.${b64({ aud, sub, email: 'a@skole.dk' })}.`

let generate: (req: Request) => Promise<Response>
beforeAll(async () => {
  Object.assign(process.env, { MOCK_AI: '1', AUTH_EMULATOR: '1', FIREBASE_PROJECT_ID: 'demo-test', MOCK_AI_INJECT_ERROR: '1' })
  generate = (await import('../netlify/functions/generate.mts')).default
})

const items = [
  { title: 'Rektangel', angle: 'Beregn areal', difficulty: 'Let', area: 'Geometri og måling', topic: 'Areal', needsFigure: true },
  { title: 'Tæppe', angle: 'Hverdag', difficulty: 'Svær', area: 'Geometri og måling', topic: 'Areal', needsFigure: false },
]
const call = (body: object, auth = token('demo-test')) =>
  generate(
    new Request('http://x/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` },
      body: JSON.stringify(body),
    }),
  )

describe('generate function', () => {
  it('finds a wrong answer, sends it back once and returns the repaired task', async () => {
    const res = await call({ grade: 5, topic: 'areal', items, requestId: 'repair-test-1' })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.repaired).toBe(true)
    expect(data.tasks).toHaveLength(2)
    expect(data.tasks.flatMap((t: { issues: { level: string }[] }) => t.issues.filter((i) => i.level === 'error'))).toEqual([])
  })
  it('rejects a repeated request id (double click)', async () => {
    const res = await call({ grade: 5, topic: 'areal', items, requestId: 'repair-test-1' })
    expect(res.status).toBe(409)
  })
  it('rejects a token for another Firebase project', async () => {
    const res = await call({ grade: 5, topic: 'areal', items, requestId: 'other-proj-1' }, token('evil-project'))
    expect(res.status).toBe(401)
  })
  it('rejects requests without login before reading the body', async () => {
    const res = await generate(new Request('http://x/api/generate', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
  })
  it('caps the number of tasks per call', async () => {
    const res = await call({ grade: 5, topic: 'areal', items: [...items, ...items], requestId: 'too-many-1' })
    expect(res.status).toBe(400)
  })
})
