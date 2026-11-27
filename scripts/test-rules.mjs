/**
 * Tests firestore.rules against the official Firestore emulator (run via `npm run test:rules`,
 * which starts the emulator with firebase emulators:exec). Uses the emulator's REST API with
 * unsigned test tokens for two teachers.
 */
const PROJECT = 'demo-opgavebanken'
const BASE = `http://${process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'}/v1/projects/${PROJECT}/databases/(default)/documents`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const token = (uid) => `${b64({ alg: 'none' })}.${b64({ sub: uid, user_id: uid, email: uid === 'ADMIN' ? 'simonberthelsen@hotmail.com' : `${uid}@skole.dk`, email_verified: !uid.startsWith('U'), aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: 0, exp: 9999999999, auth_time: 0, firebase: { sign_in_provider: 'password' } })}.`

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
  const url = path.startsWith(':') ? `${BASE}${path}` : `${BASE}/${path}${query}`
  const res = await fetch(url, {
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

expect('Lærer A gemmer en opgave i den fælles bank', await req('PATCH', 'tasks/t1', 'A', doc({ ...task, ownerUid: 'A' })), true)
expect('Lærer B kan se A’s opgave', await req('GET', 'tasks/t1', 'B'), true)
expect('Lærer B kan ikke ændre A’s opgave', await req('PATCH', 'tasks/t1', 'B', doc({ ...task, ownerUid: 'A', title: 'Hacket' })), false)
expect('Lærer B kan ikke overtage A’s opgave', await req('PATCH', 'tasks/t1', 'B', doc({ ...task, ownerUid: 'B' })), false)
expect('Lærer B kan ikke slette A’s opgave', await req('DELETE', 'tasks/t1', 'B'), false)
expect('Lærer B tæller A’s opgave som brugt i et sæt', await req('PATCH', 'tasks/t1', 'B', doc({ usedCount: 1 }), '?updateMask.fieldPaths=usedCount'), true)
expect('Lærer B kan ikke sætte brugt-tallet frit', await req('PATCH', 'tasks/t1', 'B', doc({ usedCount: 99 }), '?updateMask.fieldPaths=usedCount'), false)
expect('Lærer A kan rette sin egen opgave', await req('PATCH', 'tasks/t1', 'A', doc({ ...task, ownerUid: 'A', title: 'Rettet' })), true)
expect('Lærer B kan ikke gemme en opgave i A’s navn', await req('PATCH', 'tasks/t9', 'B', doc({ ...task, ownerUid: 'A' })), false)
expect('Ubekræftet e-mail kan ikke tilføje opgaver', await req('PATCH', 'tasks/t8', 'Uny', doc({ ...task, ownerUid: 'Uny' })), false)
expect('Ubekræftet bruger kan se banken', await req('GET', 'tasks/t1', 'Uny'), true)
expect('Uden login: ingen adgang', await req('GET', 'tasks/t1', null), false)
expect('Gymnasieopgave (3.g, Matematik A) accepteres', await req('PATCH', 'tasks/t2', 'A', doc({ ...task, ownerUid: 'A', grade: 12, niveau: 'A', area: 'Funktioner og infinitesimalregning' })), true)
expect('Ugyldigt klassetrin (13) afvises', await req('PATCH', 'tasks/t4', 'A', doc({ ...task, ownerUid: 'A', grade: 13 })), false)
expect('Ugyldigt område afvises', await req('PATCH', 'tasks/t3', 'A', doc({ ...task, ownerUid: 'A', area: 'Kemi' })), false)
expect('Lærer A kan slette sin egen opgave', await req('DELETE', 'tasks/t1', 'A'), true)
expect('Gammel privat bank kan ikke få nye opgaver', await req('PATCH', 'users/A/tasks/x', 'A', doc(task)), false)
expect('Lærer A gemmer sin profil', await req('PATCH', 'profiles/A', 'A', doc({ uid: 'A', email: 'A@skole.dk', loginCount: 1 })), true)
expect('Profil med andens e-mail afvises', await req('PATCH', 'profiles/A', 'A', doc({ uid: 'A', email: 'chef@skole.dk' })), false)
expect('Lærer B kan se A’s profil (admin-overblik for alle)', await req('GET', 'profiles/A', 'B'), true)
expect('Uden login: ingen profiler', await req('GET', 'profiles/A', null), false)
expect('Lærer B kan ikke ændre A’s profil', await req('PATCH', 'profiles/A', 'B', doc({ uid: 'A', loginCount: 99 })), false)
expect('Admin kan læse A’s profil', await req('GET', 'profiles/A', 'ADMIN'), true)
expect('Lærer A registrerer eget login', await req('POST', 'logins', 'A', doc({ uid: 'A', email: 'A@skole.dk', at: 1, device: 'Chrome' })), true)
expect('Lærer B kan ikke registrere login for A', await req('POST', 'logins', 'B', doc({ uid: 'A', email: 'A@skole.dk', at: 1, device: 'Chrome' })), false)
expect('Lærere kan læse login-loggen', await req('POST', ':runQuery', 'A', { structuredQuery: { from: [{ collectionId: 'logins' }] } }), true)
expect('Admin kan læse login-loggen', await req('POST', ':runQuery', 'ADMIN', { structuredQuery: { from: [{ collectionId: 'logins' }] } }), true)
expect('Lærer A gemmer opgave t5', await req('PATCH', 'tasks/t5', 'A', doc({ ...task, ownerUid: 'A' })), true)
expect('Admin kan slette en lærers opgave', await req('DELETE', 'tasks/t5', 'ADMIN'), true)
const report = { taskId: 't1', taskTitle: 'Rektangel', ownerUid: 'A', reporterUid: 'B', reporterEmail: 'B@skole.dk', message: 'Facit er forkert', createdAt: 1, status: 'open' }
expect('Lærer B melder fejl i A’s opgave', await req('PATCH', 'reports/r1', 'B', doc(report)), true)
expect('Fejlmelding i en andens navn afvises', await req('PATCH', 'reports/r2', 'B', doc({ ...report, reporterUid: 'A' })), false)
expect('Tom fejlmelding afvises', await req('PATCH', 'reports/r3', 'B', doc({ ...report, message: '' })), false)
expect('Alle lærere kan se fejlmeldinger', await req('GET', 'reports/r1', 'C'), true)
expect('Lærer C kan ikke lukke andres fejlmelding', await req('PATCH', 'reports/r1', 'C', doc({ status: 'resolved', resolvedAt: 2, resolvedBy: 'C' }), '?updateMask.fieldPaths=status&updateMask.fieldPaths=resolvedAt&updateMask.fieldPaths=resolvedBy'), false)
expect('Ejeren kan ikke ændre selve meldingen', await req('PATCH', 'reports/r1', 'A', doc({ message: 'Ændret' }), '?updateMask.fieldPaths=message'), false)
expect('Opgavens ejer kan markere fejlen som løst', await req('PATCH', 'reports/r1', 'A', doc({ status: 'resolved', resolvedAt: 2, resolvedBy: 'A' }), '?updateMask.fieldPaths=status&updateMask.fieldPaths=resolvedAt&updateMask.fieldPaths=resolvedBy'), true)
expect('Kun admin kan slette fejlmeldinger', await req('DELETE', 'reports/r1', 'A'), false)
expect('Admin kan slette fejlmeldinger', await req('DELETE', 'reports/r1', 'ADMIN'), true)
expect('Lærer A deler et elevsæt', await req('PATCH', 'shared/tok123', 'A', doc({ ownerUid: 'A', title: 'Sæt', tasks: [{ title: 'x' }] })), true)
expect('Elever uden login kan åbne elevsættet', await req('GET', 'shared/tok123', null), true)
expect('Elevsæt kan ikke listes', await req('GET', 'shared', null), false)
expect('Lærer B kan ikke ændre A’s elevsæt', await req('PATCH', 'shared/tok123', 'B', doc({ ownerUid: 'B', title: 'Hacket', tasks: [] })), false)
expect('Lærer A kan stoppe delingen', await req('DELETE', 'shared/tok123', 'A'), true)
expect('Lærer A gemmer en samling', await req('PATCH', 'users/A/collections/favoritter', 'A', doc({ name: 'Favoritter', taskIds: ['t1'] })), true)
expect('Lærer B kan ikke se A’s samlinger', await req('GET', 'users/A/collections/favoritter', 'B'), false)
expect('Lærer A gemmer klassens point', await req('PATCH', 'users/A/results/s1', 'A', doc({ rows: [{ alias: 'Elev 1', scores: [1, null] }] })), true)
expect('Lærer B kan ikke se A’s klasses point', await req('GET', 'users/A/results/s1', 'B'), false)
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
