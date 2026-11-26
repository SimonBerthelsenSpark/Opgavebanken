/**
 * Tests firestore.rules against the official Firestore emulator (run via `npm run test:rules`,
 * which starts the emulator with firebase emulators:exec). Uses the emulator's REST API with
 * unsigned test tokens for two teachers.
 */
const PROJECT = 'demo-opgavebanken'
const BASE = `http://${process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'}/v1/projects/${PROJECT}/databases/(default)/documents`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const token = (uid) => `${b64({ alg: 'none' })}.${b64({ sub: uid, user_id: uid, aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: 0, exp: 9999999999, auth_time: 0, firebase: { sign_in_provider: 'password' } })}.`

const v = (x) => {
  if (x === null) return { nullValue: null }
  if (Array.isArray(x)) return { arrayValue: { values: x.map(v) } }
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x }
  if (typeof x === 'boolean') return { booleanValue: x }
  if (typeof x === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, y]) => [k, v(y)])) } }
  return { stringValue: String(x) }
}
const doc = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, y]) => [k, v(y)])) })

async function req(method, path, uid, body, query = '') {
  const res = await fetch(`${BASE}/${path}${query}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${token(uid)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.status
}

const task = {
  title: 'Rektangel',
  intro: '',
  parts: [{ question: 'q', answer: 'a', points: 1 }],
  grade: 5,
  area: 'Geometri og måling',
  topic: 'Areal',
  difficulty: 'Let',
}
const results = []
const expect = (name, status, ok) => {
  const pass = ok ? status === 200 : status === 403
  results.push(pass)
  console.log(`${pass ? '✔' : '✘'} ${name} (HTTP ${status})`)
}

expect('Lærer A opretter egen opgave', await req('PATCH', 'users/A/tasks/t1', 'A', doc(task)), true)
expect('Lærer A læser egen opgave', await req('GET', 'users/A/tasks/t1', 'A'), true)
expect('Lærer B kan ikke læse A’s opgave', await req('GET', 'users/A/tasks/t1', 'B'), false)
expect('Lærer B kan ikke ændre A’s opgave', await req('PATCH', 'users/A/tasks/t1', 'B', doc({ ...task, title: 'Hacket' })), false)
expect('Lærer B kan ikke slette A’s opgave', await req('DELETE', 'users/A/tasks/t1', 'B'), false)
expect('Uden login: ingen adgang', await req('GET', 'users/A/tasks/t1', null), false)
expect('Ugyldig opgave (klassetrin 12) afvises', await req('PATCH', 'users/A/tasks/t2', 'A', doc({ ...task, grade: 12 })), false)
expect('Ugyldigt område afvises', await req('PATCH', 'users/A/tasks/t3', 'A', doc({ ...task, area: 'Kemi' })), false)
const set = { title: 'Sæt', createdAt: 1, totalPoints: 1, tasks: [task] }
expect('Lærer A gemmer et sæt', await req('PATCH', 'users/A/sets/s1', 'A', doc(set)), true)
expect('Sættets titel kan ændres', await req('PATCH', 'users/A/sets/s1', 'A', doc({ title: 'Nyt navn' }), '?updateMask.fieldPaths=title'), true)
expect('Sættets opgaver kan ikke ændres bagefter', await req('PATCH', 'users/A/sets/s1', 'A', doc({ ...set, tasks: [{ ...task, title: 'Ændret' }] })), false)
expect('Lærer B kan ikke læse A’s sæt', await req('GET', 'users/A/sets/s1', 'B'), false)
expect('Lærer A gemmer progression', await req('PATCH', 'users/A/meta/progression', 'A', doc({ grades: {} })), true)
expect('Lærer B kan ikke læse A’s progression', await req('GET', 'users/A/meta/progression', 'B'), false)
expect('Dokumenter uden for /users er lukket', await req('PATCH', 'public/x', 'A', doc({ a: 1 })), false)

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} regeltjek bestået`)
process.exit(failed ? 1 : 0)
