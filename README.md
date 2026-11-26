# Opgavebanken

En søsterside til [AImforA](https://aimfora.com), hvor en lærer genererer matematikopgaver (1.–9. klasse) med AI, gemmer dem i en privat opgavebank og danner printklare opgavesæt med tre A4-PDF'er: elevark, rettevejledning og pointtabel.

**Opsætning trin for trin:** [docs/OPSAETNING.md](docs/OPSAETNING.md)

## Arkitektur

| Del | Teknologi |
|---|---|
| Frontend | Vite + React + TypeScript, AImforA's designsystem ("The Marking Desk") |
| Login | Firebase Authentication (e-mail/adgangskode, Google) |
| Data | Cloud Firestore, `users/{uid}/tasks`, `users/{uid}/sets` (øjebliksbilleder), `users/{uid}/meta/progression` |
| AI | OpenAI Responses API med Structured Outputs (strict JSON Schema), kun fra Netlify Functions |
| PDF | pdf-lib + Liberation Sans i browseren (æøå, ², √, π, stablede brøker, vektorfigurer) |
| Hosting | Netlify (statisk site + `/api/plan` og `/api/generate`) |

### Generering

1. **`/api/plan`** vurderer, om emnet passer til klassetrinnet (ud fra lærerens redigerbare progression og de officielle mål for trinforløbet), og lægger N forskellige opgaveidéer med forskellige spørgsmålstyper og løsningsmetoder.
2. **`/api/generate`** skriver idéerne som opgaver, 3 ad gangen og parallelt, så hvert kald holder sig inden for Netlifys tidsgrænse.
3. Serveren validerer alt med Zod og egne tjek: antal, obligatoriske felter, point = summen af delpoint, regneudtryk efterregnes med en sikker parser og sammenholdes med facit og enhed, figurens mål efterregnes fra koordinaterne, og en tekst, der nævner en figur, skal have en. Fejl sendes én gang tilbage til modellen; det, der stadig fejler, vises som "Tjek" i forhåndsvisningen.

### Mapper

```
src/shared/       domæne, validering, beregner, figurer, PDF – bruges af både browser og server
src/client/       React-app (sider, komponenter, Firestore)
netlify/functions plan.mts, generate.mts og _lib (auth, OpenAI, prompts, skemaer, test-AI)
firestore.rules   adgang kun til egne data; sæt kan ikke ændres
tests/            vitest: logik, serverfunktioner, PDF'er
scripts/          e2e.mjs (Chrome), test-rules.mjs, local-api.ts
```

Kode og kommentarer er på engelsk, al brugerflade og alle materialer på dansk.
