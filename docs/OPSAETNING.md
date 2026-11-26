# Opsætning: GitHub, Firebase, OpenAI og Netlify

Rækkefølgen betyder noget: Firebase-værdierne skal bruges i Netlify, og Netlify-domænet skal godkendes i Firebase.
Hvert trin slutter med **Sådan ser du, at det virker**.

> OpenAI-nøglen skrives **kun** i Netlify (trin 4.2). Den skal aldrig i chatten, i `.env` i repoet, i koden eller på GitHub.

---

## 1. GitHub – repository

1. Åbn <https://github.com/organizations/sparkonaut/repositories/new> (eller <https://github.com/new> for din egen konto).
2. **Repository name:** `opgavebanken` · **Private** · sæt *ikke* flueben ved README, .gitignore eller license (repoet skal være tomt).
3. Klik **Create repository**.
4. Hvis Claude-appen på GitHub kun har adgang til udvalgte repositories: **sparkonaut → Settings → GitHub Apps → Claude → Configure → Repository access** → tilføj `opgavebanken` → **Save**.
5. Sig til i chatten, så pusher jeg koden.

**Sådan ser du, at det virker:** Repoet viser mapperne `src`, `netlify`, `docs`, og fanen **Actions** viser et grønt CI-løb (typecheck, tests, build, Firestore-regler og browsertest).

## 2. Firebase – login og database

1. Åbn <https://console.firebase.google.com> → **Create a project** → navn `opgavebanken` → slå Google Analytics fra → **Create project**.
   Notér **Project ID** (står under navnet, fx `opgavebanken-4f2a1`).
2. **Build → Authentication → Get started → Sign-in method**
   - **Email/Password** → slå den første kontakt til (ikke "Email link") → **Save**.
   - Valgfrit: **Google** → slå til → vælg support-e-mail → **Save**.
3. **Authentication → Settings → Authorized domains → Add domain**: tilføj dit Netlify-domæne, fx `opgavebanken.netlify.app` (kendes efter trin 4.4). `localhost` står der allerede.
4. **Build → Firestore Database → Create database** → **Location: `eur3 (europe-west)`** (data i EU) → **Start in production mode** → **Create**.
5. **Firestore → Rules**: slet indholdet, indsæt hele filen `firestore.rules` fra repoet → **Publish**.
   *Alternativt fra terminalen:* `npx firebase login` og derefter `npx firebase deploy --only firestore:rules --project <PROJECT_ID>`.
6. **Projektindstillinger (tandhjulet) → General → Your apps → Web `</>`** → navn `opgavebanken-web` → *ikke* Hosting → **Register app**.
   Kopiér fire værdier fra `firebaseConfig`: `apiKey`, `authDomain`, `projectId`, `appId`. De er offentlige (de ligger i browseren) og er ikke hemmeligheder.

**Sådan ser du, at det virker:** I **Firestore → Rules → Rules Playground** vælger du *get*, sti `/users/abc/tasks/x`, *Unauthenticated* → **Run** giver **Denied**. Vælger du *Authenticated* med UID `abc`, giver det **Allowed**.

## 3. OpenAI – nøgle og budget

1. Åbn <https://platform.openai.com> → **Projects → Create project** → `Opgavebanken`.
2. I projektet: **API keys → Create new secret key** → navn `netlify-opgavebanken` → **Create**. Lad vinduet stå åbent, og gå direkte til trin 4.2.
3. **Limits** (projektets indstillinger): sæt et månedligt budget, fx 20 USD, så en fejl aldrig kan blive dyr.

## 4. Netlify – hosting, serverfunktioner og automatisk deployment

1. Åbn <https://app.netlify.com> → **Add new project → Import an existing project → GitHub** → godkend → vælg `sparkonaut/opgavebanken`.
   Build-indstillingerne læses fra `netlify.toml` (`npm run build`, publish `dist`). Klik **Deploy**. Det første build fejler ikke, men login virker først efter næste trin.
2. **Project configuration → Environment variables → Add a variable** (én ad gangen):

   | Navn | Værdi | Hvor finder du den |
   |---|---|---|
   | `VITE_FIREBASE_API_KEY` | `apiKey` | Firebase trin 2.6 |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` | Firebase trin 2.6 |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` | Firebase trin 2.6 |
   | `VITE_FIREBASE_APP_ID` | `appId` | Firebase trin 2.6 |
   | `FIREBASE_PROJECT_ID` | samme som `projectId` | Firebase trin 2.1 |
   | `OPENAI_API_KEY` | nøglen | OpenAI trin 3.2 – sæt flueben ved **Contains secret values**, scope **Functions** |
   | `ALLOWED_EMAILS` | tom (eller en kommasepareret liste) | Tom = alle lærere med bekræftet e-mail kan generere. Udfyldt = kun disse |
| `AI_CALLS_PER_DAY_TOTAL` | `500` | Valgfri. Samlet loft over AI-kald pr. døgn for alle lærere |
   | `OPENAI_MODEL` | `gpt-5.6-terra` | Valgfri. Kan skiftes uden kodeændring |

3. **Deploys → Trigger deploy → Clear cache and deploy project**.
4. **Project configuration → General → Change project name** → `opgavebanken` → adressen bliver `https://opgavebanken.netlify.app`. Tilføj den under Firebase trin 2.3.

**Sådan ser du, at det virker:**
- Deploy-loggen viser *Functions bundled* med `plan` og `generate`.
- Åbn adressen, opret en konto, og se den i **Firebase → Authentication → Users**.
- Generér 3 opgaver. Under **Netlify → Logs → Functions → generate** ses kaldet uden fejl, og opgaverne ligger i **Firestore → Data → users → (dit UID) → tasks** efter "Gem".
- Login fejler med "Domænet er ikke godkendt": trin 2.3 mangler.

**Automatisk deployment:** Hvert push til `main` bygges og udgives automatisk. Pull requests får en deploy preview; login virker dér kun, hvis preview-domænet også tilføjes i Firebase (Firebase understøtter ikke jokertegn).

## 5. Lokal udvikling

```sh
npm ci
cp .env.example .env            # udfyld VITE_FIREBASE_* og FIREBASE_PROJECT_ID (ikke OpenAI-nøglen)
npx netlify login
npx netlify link                # vælg projektet opgavebanken
npx netlify dev                 # http://localhost:8888 – henter OPENAI_API_KEY fra Netlify
```

Gratis og uden internet-konti: Firebase-emulatorer + test-AI. Sæt i `.env`:
`VITE_FIREBASE_PROJECT_ID=demo-opgavebanken`, `FIREBASE_PROJECT_ID=demo-opgavebanken`, `VITE_USE_EMULATORS=1`, `AUTH_EMULATOR=1`, `MOCK_AI=1`, og kør `npm run dev:emulators` (kræver Java) i ét vindue og `npx netlify dev` i et andet.

| Kommando | Hvad den tester |
|---|---|
| `npm test` | Beregningstjek, figurtjek, validering, serverfunktioner, de tre PDF'er |
| `npm run test:rules` | Firestore-reglerne mod den officielle emulator (kræver Java) |
| `npm run e2e` | Hele lærerflowet i Chrome (se `.github/workflows/ci.yml` for opstart) |

## 6. Drift og sikkerhed

- **Fælles opgavebank:** Alle lærere med login kan se og bruge alle opgaver i `/tasks`. Lærere med bekræftet e-mail kan tilføje opgaver. Kun den lærer, der har gemt en opgave, kan rette eller slette den.
- **Private data:** Gemte sæt og progression ligger under `/users/{eget UID}/…` og kan kun ses af læreren selv. Gemte sæt kan ikke ændres bagefter (kun titlen).
- **AI-kald:** Kun fra serverfunktionerne. Login og bekræftet e-mail kontrolleres på serveren (Firebase ID-token verificeres mod Googles nøgler). Højst 20 opgaver pr. generering, 2 pr. kald, `AI_CALLS_PER_HOUR` (standard 60) pr. lærer og `AI_CALLS_PER_DAY_TOTAL` (standard 500) for alle tilsammen. Samme forespørgsel kan ikke sendes to gange.
- **Når `firestore.rules` ændres**, skal reglerne publiceres igen i Firebase (trin 2.5). Netlify gør det ikke.
- **Luk for nye konti:** Firebase → Authentication → Settings → **User actions** → slå *Enable create (sign-up)* fra, når de rigtige lærere er oprettet. Eller brug `ALLOWED_EMAILS`.

## 7. Admin

- Admin-menuen vises for e-mails i `ADMIN_EMAILS` i `src/shared/admin.ts` **og** i funktionen `isAdmin()` i `firestore.rules`. Ret begge steder, og publicér reglerne igen.
- Admin kræver bekræftet e-mail. Siden viser brugere (oprettet, seneste login, antal logins, opgaver, sæt, AI-forbrug de sidste 7 dage), de seneste 100 logins og opgavebankens fordeling på klassetrin og område. Admin kan slette enhver opgave i banken.
- Profiler og logins registreres fra første login efter opdateringen. Ældre brugere vises som "Ukendt", til de logger ind igen.
- AI-forbruget gemmes i Netlify Blobs (store `ai-guard`) og hentes via `/api/admin-stats`.
