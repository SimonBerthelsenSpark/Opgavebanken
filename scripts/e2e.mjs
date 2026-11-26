/**
 * Browser test of the full teacher flow, run against the local stack:
 *   Auth emulator + scripts/local-api.ts (MOCK_AI=1) + `vite --mode e2e`.
 * Usage: BASE_URL=http://localhost:5173 CHROME=/usr/bin/google-chrome node scripts/e2e.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const OUT = resolve('test-output/e2e')
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--window-size=1300,1000'],
  defaultViewport: { width: 1300, height: 1000 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message))
const api = []
page.on('request', (r) => {
  if (r.url().includes('/api/')) {
    api.push(r.url().replace(/.*\/api\//, ''))
    if (process.env.DEBUG) console.log('API', Date.now() % 100000, r.url(), r.postData()?.slice(-60))
  }
})
const downloads = { names: {}, done: [] }
const bcdp = await browser.target().createCDPSession()
await bcdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: OUT, eventsEnabled: true })
bcdp.on('Browser.downloadWillBegin', (e) => {
  downloads.names[e.guid] = e.suggestedFilename
})
bcdp.on('Browser.downloadProgress', (e) => {
  if (e.state === 'completed') downloads.done.push(e.guid)
})

const clickText = async (text, sel = 'button') => {
  const handle = await page.waitForFunction(
    (t, s) => [...document.querySelectorAll(s)].find((b) => b.textContent.trim().startsWith(t) && !b.disabled),
    { timeout: 20000 },
    text,
    sel,
  )
  await handle.asElement().click()
}
const bodyText = () => page.evaluate(() => document.body.innerText)
const waitText = (t, timeout = 30000) => page.waitForFunction((x) => document.body.innerText.includes(x), { timeout }, t)
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
const setSelect = (label, value) =>
  page.evaluate(
    (l, v) => {
      const f = [...document.querySelectorAll('label.field')].find((x) => x.querySelector('.field-label')?.textContent === l)
      const s = f.querySelector('select')
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(s, v)
      s.dispatchEvent(new Event('change', { bubbles: true }))
    },
    label,
    value,
  )
const setInput = async (selector, value) => {
  await page.focus(selector)
  await page.keyboard.down('Control')
  await page.keyboard.press('a')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.type(selector, value)
}
async function downloadAll(prefix) {
  const named = {}
  for (const label of ['1. Elevens opgavesæt', '2. Rettevejledning', '3. Pointtabel']) {
    const start = downloads.done.length
    await clickText(label)
    for (let i = 0; i < 40 && downloads.done.length === start; i++) await sleep(250)
    if (process.env.DEBUG) console.log('DL', label, JSON.stringify(downloads))
    const guid = downloads.done[downloads.done.length - 1]
    const name = downloads.names[guid] ?? ''
    const kind = name.startsWith('Elevark') ? 'elev' : name.startsWith('Rettevejledning') ? 'laerer' : name.startsWith('Pointtabel') ? 'point' : 'ukendt'
    const to = `${OUT}/${prefix}-${kind}.pdf`
    renameSync(`${OUT}/${guid}`, to)
    named[kind] = execFileSync('pdftotext', ['-layout', to, '-']).toString()
    named[`${kind}Name`] = name
  }
  return named
}
// in-app navigation (the e2e data layer lives in memory, so no full reloads)
const go = async (path) => {
  await page.evaluate((p) => {
    history.pushState(null, '', p)
    dispatchEvent(new PopStateEvent('popstate'))
  }, path)
  await sleep(300)
}
const labelsIn = (txt) => [...txt.matchAll(/^\s*(\d+[a-f]?)\s{2,}/gm)].map((m) => m[1])

try {
  // ---- login
  await page.goto(BASE, { waitUntil: 'networkidle0' })
  await clickText('Opret en ny konto')
  await page.type('input[type=email]', `laerer${Date.now()}@skole.dk`)
  await page.type('input[type=password]', 'hemmelig123')
  await clickText('Opret konto')
  await waitText('Din opgavebank er tom')
  check('Lærer opretter konto og lander på opgavebanken', true)

  // ---- generate 12 tasks about area for 5th grade (double click)
  await clickText('Generér dine første opgaver')
  await page.waitForSelector('form.gen-form')
  await setSelect('Klassetrin', '5')
  await setSelect('Emne', 'custom')
  await page.waitForSelector('input[placeholder="fx omkreds og areal"]')
  await setInput('input[placeholder="fx omkreds og areal"]', 'omkreds og areal')
  await setInput('form.gen-form input[type=number]', '12')
  // a fast double click: two clicks in the same moment
  await page.$eval('form.gen-form button[type=submit]', (b) => {
    b.click()
    b.click()
  })
  await waitText('Forhåndsvisning · 12 af 12 opgaver', 60000)
  const plans = api.filter((a) => a.startsWith('plan')).length
  const gens = api.filter((a) => a.startsWith('generate')).length
  check('Dobbeltklik giver kun ét plan-kald', plans === 1, `plan=${plans}, generate=${gens} (bidder á 2)`)
  const genInfo = await page.evaluate(() => ({
    items: document.querySelectorAll('.gen-item').length,
    titles: [...document.querySelectorAll('.gen-item h3')].map((h) => h.textContent),
    verified: document.querySelectorAll('.badge.ok').length,
    flagged: document.querySelectorAll('.gen-item .notice.attention').length,
  }))
  check('12 forskellige opgaver i forhåndsvisningen', genInfo.items === 12 && new Set(genInfo.titles).size === 12)
  check('Facit efterregnet med kode', genInfo.verified > 0 && genInfo.flagged === 0, `${genInfo.verified} delspørgsmål efterregnet, ${genInfo.flagged} markeret`)
  await shot('01-forhaandsvisning')

  // ---- correct one answer (task 1, part a)
  await page.evaluate(() => [...document.querySelectorAll('.gen-item')][0].querySelector('button.btn.outline').click())
  await page.waitForSelector('form.editor')
  const oldAnswer = await page.$eval('input[aria-label="Facit 1"]', (i) => i.value)
  const corrected = `${oldAnswer} – RETTET AF LÆRER`
  await setInput('input[aria-label="Facit 1"]', corrected)
  await clickText('Gem ændringer')
  await waitText('Rettet af dig')
  check('Læreren retter ét facit i forhåndsvisningen', (await bodyText()).includes('RETTET AF LÆRER'))
  const firstTitle = genInfo.titles[0].replace(/^1\. /, '').trim()

  // ---- save to bank
  await clickText('Gem 12 i banken')
  await waitText('12 opgaver er gemt i banken')
  const rows = await page.$$eval('table.bank tbody tr', (r) => r.length)
  check('12 opgaver gemt i banken', rows === 12)
  await go('/generer')
  check('Gemte opgaver forsvinder fra “Generér opgaver”', !(await bodyText()).includes('Forhåndsvisning'))
  await go('/')

  // ---- filter and select 5 across filters
  await setSelect('Emne', 'Areal')
  await sleep(200)
  const arealRows = await page.$$eval('table.bank tbody tr', (r) => r.length)
  const pickRows = async (n, mustInclude) =>
    page.evaluate(
      (n, must) => {
        const rows = [...document.querySelectorAll('table.bank tbody tr')]
        const ordered = must ? [...rows.filter((r) => r.textContent.includes(must)), ...rows.filter((r) => !r.textContent.includes(must))] : rows
        ordered.slice(0, n).forEach((r) => r.querySelector('input[type=checkbox]').click())
      },
      n,
      mustInclude,
    )
  await pickRows(3, firstTitle)
  await setSelect('Emne', 'Omkreds')
  await sleep(200)
  await pickRows(2)
  await setSelect('Emne', '')
  const bar = await page.$eval('.selection-bar', (e) => e.innerText)
  check('Valg bevares på tværs af filtre', /^5 valgt/.test(bar), `${bar.split('\n')[0]} (Areal-filter viste ${arealRows})`)
  await shot('02-bank-valgt')

  // ---- set preview: title, reorder
  await clickText('Dan opgavesæt')
  await waitText('Nyt opgavesæt')
  const before = await page.$$eval('.set-item h3', (h) => h.map((x) => x.textContent))
  await page.evaluate(() => document.querySelectorAll('.set-item')[1].querySelector('button[aria-label^="Flyt"]').click())
  await sleep(200)
  const after = await page.$$eval('.set-item h3', (h) => h.map((x) => x.textContent))
  const strip = (s) => s.replace(/^Opgave \d+: /, '').replace(/\s*\(\d+ point\)$/, '')
  check('Rækkefølgen kan ændres', strip(after[0]) === strip(before[1]) && strip(after[1]) === strip(before[0]))
  await setInput('.set-head input', 'Areal og omkreds - test')
  const order = after.map(strip)
  await shot('03-saet-forhaandsvisning')
  await clickText('Godkend og gem sæt')
  await waitText('Hent PDF (A4)')
  const setUrl = page.url()
  const pdf = await downloadAll('manuel')
  check('Tre PDF’er hentet', Boolean(pdf.elev && pdf.laerer && pdf.point))
  await shot('04-gemt-saet')

  // ---- cross-checks on the PDFs
  check('Elevarket er uden facit', !pdf.elev.includes('RETTET AF LÆRER') && !/Facit|Løsningsforslag|delpoint/i.test(pdf.elev))
  check('Rettet facit står i rettevejledningen', pdf.laerer.includes('RETTET AF LÆRER'))
  const orderIn = (txt) => order.map((t) => txt.indexOf(t.slice(0, 25)))
  const asc = (a) => a.every((v, i) => v >= 0 && (i === 0 || v > a[i - 1]))
  check('Rækkefølgen følger forhåndsvisningen i alle tre PDF’er', asc(orderIn(pdf.elev)) && asc(orderIn(pdf.laerer)) && asc(orderIn(pdf.point)))
  const lp = labelsIn(pdf.point).filter((l) => l !== '')
  const le = labelsIn(pdf.elev)
  const ll = labelsIn(pdf.laerer)
  check('Nummerering stemmer på tværs', JSON.stringify(lp) === JSON.stringify(le) && JSON.stringify(le) === JSON.stringify(ll), lp.join(' '))
  const elevPts = [...pdf.elev.matchAll(/\((\d+) p\)/g)].reduce((s, m) => s + Number(m[1]), 0)
  const guidePts = [...pdf.laerer.matchAll(/^\s*\d+[a-f]?\s.*?\s(\d+) ?p\s*$/gm)].reduce((s, m) => s + Number(m[1]), 0)
  const total = Number(/I alt\s+(\d+)/.exec(pdf.point)?.[1])
  const headerTotal = Number(/i alt (\d+) point/.exec(pdf.elev)?.[1])
  check('Point stemmer på tværs', elevPts === total && guidePts === total && headerTotal === total, `elev=${elevPts}, vejledning=${guidePts}, tabel=${total}`)

  // ---- snapshot: edit the task in the bank afterwards
  await go('/')
  await page.evaluate((t) => [...document.querySelectorAll('table.bank button.link.title')].find((b) => b.textContent === t).click(), firstTitle)
  await clickText('Rediger')
  await page.waitForSelector('input[aria-label="Facit 1"]')
  await setInput('input[aria-label="Facit 1"]', 'NY VERSION EFTER GEM')
  await clickText('Gem ændringer')
  await waitText('Opgaven er opdateret')
  await go(new URL(setUrl).pathname)
  await waitText('Hent PDF (A4)')
  const again = await downloadAll('genaabnet')
  check('Gemt sæt er et øjebliksbillede', again.laerer.includes('RETTET AF LÆRER') && !again.laerer.includes('NY VERSION'))

  // ---- random set of 4 (no AI call)
  await go('/')
  await setSelect('Emne', '')
  const apiBefore = api.length
  await setInput('input[aria-label="Antal opgaver i tilfældigt sæt"]', '4')
  await clickText('Dan tilfældigt sæt')
  await waitText('Nyt opgavesæt')
  const rnd = await page.$$eval('.set-item h3', (h) => h.map((x) => x.textContent.replace(/^Opgave \d+: /, '')))
  check('Tilfældigt sæt med 4 forskellige opgaver uden AI-kald', rnd.length === 4 && new Set(rnd).size === 4 && api.length === apiBefore)
  await clickText('Godkend og gem sæt')
  await waitText('Hent PDF (A4)')
  const r = await downloadAll('tilfaeldigt')
  check('Tilfældigt sæt bruger samme PDF-eksport', labelsIn(r.point).length >= 4 && !/Facit/.test(r.elev))

  // ---- too few matches
  await go('/')
  await setSelect('Emne', 'Omkreds')
  await sleep(200)
  const omkreds = await page.$$eval('table.bank tbody tr', (x) => x.length)
  await setInput('input[aria-label="Antal opgaver i tilfældigt sæt"]', '10')
  await clickText('Dan tilfældigt sæt')
  await waitText('Du bad om')
  const msg = await page.$eval('.notice.highlight[role=alert]', (e) => e.innerText)
  await shot('05-for-faa')
  check('For få matcher: appen siger det', msg.includes(`kun ${omkreds}`), msg.split('\n')[0])
  await clickText('Justér filtrene')
  check('“Justér filtrene” lukker beskeden', !(await bodyText()).includes('Du bad om'))
  await clickText('Dan tilfældigt sæt')
  await clickText(`Brug de ${omkreds}`)
  await waitText('Nyt opgavesæt')
  const n = await page.$$eval('.set-item', (x) => x.length)
  check(`“Brug de ${omkreds}” danner sæt med ${omkreds} opgaver`, n === omkreds)

  // ---- topic outside the grade level
  await go('/generer')
  await setSelect('Klassetrin', '3')
  const options = await page.$$eval('select[aria-label="Emne"] option', (o) => o.map((x) => x.textContent))
  check('Emnelisten følger klassetrinnet og har "Blandet"', options.includes('Areal') && !options.includes('Pythagoras') && options[0].startsWith('Blandet'), options.slice(0, 4).join(', ') + ' …')
  await setSelect('Emne', 'custom')
  await page.waitForSelector('input[placeholder="fx omkreds og areal"]')
  await setInput('input[placeholder="fx omkreds og areal"]', 'Pythagoras')
  await setInput('form.gen-form input[type=number]', '3')
  await page.click('form.gen-form button[type=submit]')
  await waitText('over niveauet')
  await shot('06-niveau')
  check('Emne uden for niveau forklares og kan justeres', (await bodyText()).includes('Skift til 8. klasse'))

  // ---- leave the page while tasks are being written, come back later
  await go('/generer')
  await setSelect('Klassetrin', '5')
  await setSelect('Emne', 'custom')
  await page.waitForSelector('input[placeholder="fx omkreds og areal"]')
  await setInput('input[placeholder="fx omkreds og areal"]', 'areal')
  await setInput('form.gen-form input[type=number]', '4')
  await page.click('form.gen-form button[type=submit]')
  await sleep(300)
  await go('/')
  await sleep(6000)
  await go('/generer')
  await waitText('Forhåndsvisning · 4 af 4 opgaver', 15000)
  const stuck = (await bodyText()).includes('skrives …')
  check('Generering fortsætter, når man skifter side, og intet hænger i “skrives …”', !stuck)
} catch (e) {
  check('Uventet fejl', false, e.message)
  await shot('fejl')
} finally {
  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} tjek bestået`)
  process.exit(failed.length ? 1 : 0)
}
