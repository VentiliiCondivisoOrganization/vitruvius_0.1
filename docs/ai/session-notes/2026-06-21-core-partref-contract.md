# Sessione 2026-06-21 — contratto PartRef e avvio fase 1

Sintesi di quanto discusso e implementato in chat (Stefano + agente Cursor).
Per il dettaglio tecnico permanente usare [`implementation-progress.md`](../implementation-progress.md),
[`specs/01-core.md`](../../specs/01-core.md) e la migration `0006_part_refs.sql`.

---

## Punto di partenza

Dopo il merge del PR #31 (roadmap cliente + spec 13–17), Stefano chiede **su cosa lavorare**.
Stato reale su `main`: baseline **spec 01–12 implementata** (pipeline video → editor → PDF con keyframe).
Fase 1 cliente (BOM, illustrazioni schematiche, regenerate, versioning) **documentata ma non codificata**.

---

## Decisioni di sessione

### Priorità

1. Allineare `implementation-progress.md` allo stato reale del repo.
2. Aprire lo **slice contratto** (spec 01) come prerequisito di **spec 13-bom-map** — non implementare ancora il parser BOM nello stesso PR.

### Conflitto `BomItem` (assessment §5.1 vs spec 12)

| Fonte | Shape |
| ----- | ----- |
| Spec 12 (implementata) | `BomItem { name, quantity, sourceId }` dentro `DigitalModel` |
| Assessment §5.1 (sketch) | `BomItem { partName, bomCode, source }` unificato anche per `InstructionManual.bom` |

**Scelta applicata:** due tipi distinti — **`BomItem`** resta per CAD (spec 12); nuovo **`ManualBomItem`** per la distinta a livello manuale (spec 13 reconcile). Evita breaking change su `packages/cad` già mergiato.

*(Se in futuro si preferisce unificare/rinominare, va fatto in PR dedicato con `!` sul contratto core.)*

---

## Deliverable — PR `feat/core-partref-contract`

### `@vitruvius/core` (breaking change)

- `PartRef` + helper (`partRefFromLabel`, `formatPartRef`, `partRefHasOpenCandidates`, …)
- `ManualStep.parts: PartRef[]` al posto di `string[]`
- `ManualStep.caption`, `ManualStep.illustrationUrl` (vuoti finché spec 06/14 non li popolano)
- `InstructionManual.bom: ManualBomItem[]`
- `MANUAL_BOM_SOURCE` enum in `status.ts`
- Zod: `partRefSchema`, `manualBomItemSchema`

### `@vitruvius/db` — migration `0006_part_refs.sql`

- `steps.part_refs` JSONB (migra label da `parts TEXT[]`)
- `steps.caption`, `steps.illustration_url`
- `manuals.bom` JSONB
- `save_manual` aggiornato

### Downstream

- **AI:** merge instruct converte label provider → `PartRef[]`; prompt critic/learnings usano `partRefLabels`
- **Export:** HTML usa `formatPartRef` per la lista componenti
- **Web:** editor edita `part.label`; upload inizializza `bom: []`
- **Spec 01:** documentato split `BomItem` / `ManualBomItem`

### Esplicitamente fuori scope

- Spec 13 (parser BOM, reconcile, mapping AI ambigui)
- Spec 14 (`illustrationUrl` popolato)
- Spec 16 (`JOB_TYPE: regenerate`)
- Spec 17 (versioning `parentVersionId`)
- Gate export / disambiguazione UI (spec 08/09)

---

## Validazione

```bash
pnpm typecheck   # pass
pnpm lint        # pass
pnpm --filter @vitruvius/ai test      # 40 pass
pnpm --filter @vitruvius/export test  # 5 pass
```

**Locale:** dopo merge applicare `pnpm db:reset` (o migration 0006) su Supabase.

---

## Prossimi passi suggeriti

1. Merge PR contratto core.
2. Branch `feat/bom-map` — spec 13: parser CSV/Excel, reconcile con `DigitalModel`, `PartRef[]` per passo.
3. In parallelo o dopo: spec 14 tier 1 (Illustrator) una volta stabilizzato il contratto in produzione.
