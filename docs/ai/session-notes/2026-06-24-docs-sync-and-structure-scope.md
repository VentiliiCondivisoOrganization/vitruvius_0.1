# Sessione 2026-06-24 — sync documentazione di stato + scope `structure` del regenerate

Sintesi di quanto discusso e implementato in chat (Stefano + agente). Per il dettaglio tecnico
permanente usare [`implementation-progress.md`](../implementation-progress.md),
[`specs/16-regenerate-job.md`](../../specs/16-regenerate-job.md) e i test
`apps/engine/src/regenerate.test.ts`.

---

## Punto di partenza

Stefano chiede **su cosa lavorare**. Ricognizione del repo: baseline 01–12 e fase 1 (13, 14 tier 1,
16, 17) implementate; ma la **documentazione di stato era indietro rispetto al codice** — l'auth
(spec 15, #45) risultava "drafted", la localizzazione (#48) non era citata da nessun doc, e il PDF
schematico era segnato come "pending" pur essendo già nel renderer.

---

## Decisioni di sessione

### Principio guida (richiesto da Stefano)

> Aggiornare **tutta** la documentazione di stato allineandola al codice reale. Dove c'è discrepanza
> tra quanto **deciso** (spec/decisioni) e quanto **sviluppato**, **non sovrascrivere la decisione**
> ma **evidenziare la discrepanza**.

Realizzato introducendo in `implementation-progress.md` un header "How to read this file" e una
sezione dedicata **"Decided vs developed — open discrepancies"**. Le spec e `decisions.md` restano
il registro dell'intento; il progress doc è il registro della realtà.

### Discrepanze identificate

| #   | Discrepanza                         | Natura                                                         | Esito                                                             |
| --- | ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Regenerate scope `structure`        | Deciso (spec 16), non sviluppato (l'engine lanciava un errore) | **Chiusa** in questa sessione                                     |
| 2   | Localizzazione UI en/it/es/fr (#48) | Sviluppata, non decisa (nessuno spec/ADR)                      | Aperta — da retro-documentare                                     |
| 3   | Export: fallback su keyframe        | Divergenza minore da spec 09                                   | Aperta — decidere se accettare o spostare i keyframe in appendice |
| —   | Docstring stale in `html.ts`        | Commento codice non aggiornato                                 | Annotata per cleanup                                              |

---

## Chiusura discrepanza #1 — scope `structure`

### Scelta di design

Lo scope `structure` esegue un **split/merge deterministico** dei passi selezionati, con la stessa
semantica dell'editor (spec 08), seguito da una **ri-esecuzione dell'Instructor** sui passi toccati
(prompt come `guidance`). Convenzione: **1 target → split** al midpoint; **≥2 target contigui →
merge**. Riusa gli agenti esistenti — niente "Regenerator", **niente re-download del video, niente
crediti di segmentazione**. La **ri-segmentazione AI** dal video resta l'opt-in opzionale che lo
spec 16 esplicitamente rinvia ("re-segment only when explicitly requested") — non costruita.

### Deliverable

- `apps/engine/src/regenerate.ts` → `restructureSteps` (split/merge + re-instruct + rinumerazione
  `order`, demozione a `edited`); routing dedicato in `handleRegenerateJob` perché lo scope cambia
  la **cardinalità** dei passi (il merge 1:1 degli altri scope non basta).
- `apps/web`: l'editor ora **offre** lo scope `structure` (prima era filtrato via) + label i18n.
- **Stack di test engine** (prima suite vitest di `apps/engine`): `apps/engine/vitest.config.ts`,
  script `test`, devDep `vitest`; `regenerate.test.ts` copre split / merge / merge non-contiguo
  rifiutato, con `@vitruvius/db` mockato e l'Instructor euristico offline.
- **CI**: job `test-engine` aggiunto a `.github/workflows/checks.yml` e inserito nel gate
  `checks-pass`.

### Validazione

```bash
pnpm typecheck   # 14/14
pnpm lint        # 8/8
pnpm build       # 8/8
pnpm --filter @vitruvius/engine test   # 3/3
```

---

## Documentazione aggiornata in sessione

- `docs/ai/implementation-progress.md` — riscritta: stato reale + sezione discrepanze + slice
  `structure` + copertura test.
- `README.md` — tabella roadmap (auth, localizzazione, structure) + nodo 10 export.
- `docs/ai/architecture.md` — frase di stato (15, localizzazione, schematic, structure).
- `docs/ai/README.md` — spec map.
- `docs/ai/team-organization.md` — backlog near-term.
- `docs/ai/ai-layer.md` — riga `regenerate` (structure wired + tested).
- `specs/16-regenerate-job.md` — nota **Status: implemented**.

---

## Commit della sessione (branch `claude/blissful-wright-2efdyg`)

| Commit    | Contenuto                                                        |
| --------- | ---------------------------------------------------------------- |
| `5a31ca9` | `docs(ai)`: sync dei progress doc allo stato reale + discrepanze |
| `6446a91` | `feat(engine,web)`: wire dello scope `structure` (split/merge)   |
| `e8c8ba8` | `test(engine)`: copertura split/merge + job CI `test-engine`     |

---

## Prossimi passi suggeriti

1. **Discrepanza #2** — retro-documentare la localizzazione: uno spec (es. `18-i18n.md`) o un ADR in
   `decisions.md` per lo stack Paraglide + locale supportate.
2. **Discrepanza #3** — decidere su spec 09: accettare il fallback keyframe inline oppure spostare i
   keyframe in appendice come da testo dello spec.
3. Cleanup del docstring stale in `packages/export/src/html.ts` alla prossima modifica del file.
