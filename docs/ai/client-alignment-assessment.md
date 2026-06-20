# Client alignment assessment

**Date:** 2026-06-20 (revisione 2 — baseline documentata + consolidamento critico proposte 13+)  
**Method:** Structured design review (`/grill-me`) — decisions resolved one branch at a time.  
**Scope:** Confrontare la richiesta cliente (istruzioni IKEA/LEGO da video e input opzionali) con
**tutto ciò che Vitruvius definisce oggi nei documenti** — architettura, [`ai-layer.md`](ai-layer.md),
[`README.md`](../../README.md) e spec [`01`–`17`](../../specs/).

> **Nota metodologica.** Questo assessment valuta l'allineamento rispetto al **design documentato**
> del prodotto (spec, architettura, contratto). Non distingue tra codice già scritto e codice
> ancora da scrivere: se è in una spec o in `docs/ai`, conta come parte della definizione di
> Vitruvius. Per lo stato di avanzamento dell'implementazione vedere
> [`implementation-progress.md`](implementation-progress.md).

---

## Esito sintetico

### Richiesta cliente (in breve)

Software che generi **istruzioni di montaggio in stile IKEA/LEGO** a partire da:

- **Video di montaggio** (input obbligatorio)
- **Audio operatore** (opzionale — spiega cosa sta facendo)
- **Disegni SolidWorks / CAD** (opzionali)
- **BOM** (opzionale, anche come file distinto dalla distinta derivata da un modello CAD)

Output: illustrazioni schematiche con **poche scritte**, codici e descrizioni componenti per
passo (dalla BOM quando disponibile), **revisione obbligatoria** con modifica via prompt, poi
**PDF stampabile**.

### Verdetto

| Dimensione                                               | Giudizio                                                                                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intento di prodotto                                      | **Parzialmente allineato** — stessa direzione (video → manuale IKEA, bozza AI + revisione umana), deliverable visivo e BOM più ricco di quanto le spec coprono oggi                                     |
| Architettura monorepo (web / engine / `@vitruvius/core`) | **Allineata** — boundary web/engine via DB + contratto condiviso; lane CAD opzionale già prevista ([`architecture.md`](architecture.md), spec 12)                                                       |
| Pipeline documentata                                     | **Parzialmente allineata** — baseline 01–12 copre spina dorsale + priming CAD; mancano layer BOM ibrido, Illustrator, export schematico, job `regenerate`                                               |
| Contratto dati (`@vitruvius/core`)                       | **Parzialmente sufficiente** — bootstrap + estensioni spec 10–12; servono `PartRef`, `illustrationUrl`, `caption` (affiancato a `instruction`), versioning, `BomItem` con `partName`/`bomCode` distinti |
| Editor / UX                                              | **Parzialmente allineato** — revisione guidata sì (spec 08, pattern `alternatives`); mancano disambiguazione BOM, job `regenerate`, gate export derivato da `confirmed` + candidati risolti             |
| Export                                                   | **Non allineato** — spec 09 esclude esplicitamente il rendering schematico; output previsto = keyframe grezzi                                                                                           |
| Prima consegna cliente (stack completo grill-me)         | **Non coperto** oggi — richiede spec 13–16 + aggiornamenti 08/09; compositing CAD+AI per passo è **fase 2** (dipende da pose alignment, fuori scope spec 12)                                            |

**In una frase:** Vitruvius definisce una pipeline **video-first** con bozza AI, revisione umana,
Critic decoupled, learnings e **priming opzionale da modello digitale** (spec 12); il cliente
chiede in più un generatore di **manuali illustrati industriali** (schematiche stampabili,
BOM strutturata con disambiguazione, compositing CAD+AI, prompt editing, versioning).

### Decisioni chiave (risolte in grill-me)

| #   | Domanda               | Scelta                                                                                                                                                         |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Formato output        | Illustrazioni schematiche (AI o CAD); istruzioni grafiche con poche scritte; modifica via prompt prima del PDF                                                 |
| 2   | Senza CAD             | Illustrazioni AI dal video, qualità stampabile **senza ritocco manuale sulle immagini**                                                                        |
| 3   | Con CAD + video       | **CAD** per geometria e numerazione; **AI** per layout (frecce, callout, composizione IKEA/LEGO)                                                               |
| 4   | Gate pre-PDF          | **Revisione sempre obbligatoria** — nessun PDF senza approvazione esplicita                                                                                    |
| 5   | Scope prompt editing  | **Tutto:** testo, illustrazioni, struttura passi (split/merge/riordino via editor + prompt)                                                                    |
| 6   | Rigore BOM            | Mismatch evidenziati in revisione; risoluzione obbligatoria prima dell'approvazione; codice + descrizione BOM per componente per step; UI di scelta se ambiguo |
| 7   | Confini dei passi     | **Solo video** segmenta timeline; BOM arricchisce le parti per ogni segmento                                                                                   |
| 8   | Ruolo audio           | **Supplementare** — aiuta mapping BOM e disambiguazione, non guida i confini dei passi                                                                         |
| 9   | Solo video            | Manuale **completo** con nomi generici ("vite", "staffa"), non bozza incompleta                                                                                |
| 10  | BOM/CAD caricati dopo | **Arricchimento incrementale + versioning** (v1 solo video → v2 con BOM/CAD)                                                                                   |
| 11  | Prima consegna        | **Stack completo** end-to-end (video + BOM + CAD + disambiguazione + compositing + versioning)                                                                 |

### Cosa Vitruvius definisce già (allineato o parzialmente)

| Area                                   | Dove è documentato                                                            | Allineamento con il cliente                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Video come input universale            | spec 03, 04, 05                                                               | **Allineato** — video-first; la segmentazione è guidata dalla timeline visiva (spec 05)                              |
| Audio opzionale                        | spec 04 (estrazione), agenti downstream (`sourceNotes`)                       | **Parzialmente** — ruolo supplementare coerente con grill-me; mapping BOM strutturato non definito                   |
| Revisione umana obbligatoria           | posizionamento prodotto, spec 08                                              | **Allineato** — editor guidato con `confidence`, `sourceNotes`, split/merge; gate esplicito pre-export da rafforzare |
| Pipeline engine                        | spec 07, [`architecture.md`](architecture.md), [`README.md`](../../README.md) | **Parzialmente** — spina dorsale completa; mancano stage illustrativi e BOM-map                                      |
| Critic decoupled                       | spec 10, [`ai-layer.md`](ai-layer.md), decisione 9                            | **Allineato** per review testo — flag BOM via layer 13 + gate export, non Critic allargato                           |
| Meta-learning                          | spec 11, [`ai-layer.md`](ai-layer.md), decisione 10                           | **Allineato** come meccanismo; priming già previsto per Segmenter/Instructor                                         |
| Modello digitale / CAD opzionale       | **spec 12**, [`architecture.md`](architecture.md)                             | **Parzialmente** — vedi sezione dedicata sotto                                                                       |
| Export HTML/PDF                        | spec 09                                                                       | **Non allineato** sul deliverable visivo (keyframes, non schematiche)                                                |
| Credit discipline + provider pluggable | [`ai-layer.md`](ai-layer.md), decisione 8                                     | **Allineato** — vincolo trasversale rispettato nelle spec AI                                                         |

### Cosa manca ancora (non coperto da nessuna spec 01–12)

Proposte **consolidate** dopo revisione critica (evitano ridondanza con spec 08 `alternatives`, spec 10
Critic text-only, spec 12 priming):

1. **Layer BOM ibrido** (spec 13) — parser file BOM + reconcile con `DigitalModel`; match
   deterministico dove possibile; AI solo per ambigui → `PartRef[]` con `candidateBomItemIds`
2. Agente **Illustrator** (spec 14 tier 1) — schematiche AI stampabili dal video/keyframe
3. **Compositor-lite** (spec 14 tier 1) — viste canoniche spec 12 + callout/layout in export; **Compositor-full**
   (overlay geometrico per passo) = fase 2, richiede pose alignment (research, fuori spec 12)
4. **Export IKEA/LEGO** — estendere spec 09 con `illustrationUrl` + `caption` (non spec separata)
5. **Disambiguazione BOM** — estendere spec 08 (stesso pattern UI di `alternatives`), non spec autonoma
6. Job **`regenerate`** (spec 16) — scope `text` / `illustration` / `layout` / `structure`; richiama
   Instructor o Illustrator/Compositor, non un quinto agente “Regenerator”
7. **Versioning manuali** (spec 17) — catena v1 → v2 per arricchimento incrementale
8. **Contratto esteso** — `PartRef`, `illustrationUrl`, `caption` affiancato a `instruction`, versioning,
   `BomItem` con `partName` vs `bomCode` e `source`

---

## Esito dettagliato

### 1. Richiesta cliente — requisiti espliciti

Il cliente chiede un software che:

1. Parta dal **video di montaggio** come input universale.
2. Usi opzionalmente:
   - **Audio** dell'operatore che narra le azioni;
   - **Modelli CAD** (SolidWorks o equivalente);
   - **BOM** (distinta base — file o equivalente strutturato).
3. Produca istruzioni **in stile IKEA/LEGO**:
   - Illustrazioni **schematiche** (non foto/frame grezzi dal video);
   - **Poche scritte** — la grafica porta il messaggio;
   - Per ogni passo: **codici e descrizioni** dei componenti coinvolti (dalla BOM quando presente).
4. Permetta **modifica facile** dell'output, **anche via prompt**, prima della stampa.
5. Generi un **PDF stampabile** dopo approvazione.

Requisito aggiuntivo emerso in grill-me: quando la BOM è disponibile, le etichette generiche
inferite dal video ("vite", "staffa") devono essere sostituite da **codice e descrizione
precisi** dalla BOM. Se più righe BOM sono plausibili per lo stesso oggetto visto nel video, il
sistema deve **mostrare il dubbio** in revisione e l'utente sceglie l'opzione corretta.

### 2. Cosa definisce Vitruvius (documentazione di prodotto)

Riferimenti: [`architecture.md`](architecture.md), [`ai-layer.md`](ai-layer.md),
[`README.md`](../../README.md), spec [`01`–`17`](../../specs/).

#### Posizionamento prodotto

Vitruvius trasforma un **video di montaggio** in un **manuale step-by-step modificabile**
(IKEA-style), con revisione umana guidata. Non è un generatore fully automatico: ogni output AI
porta `confidence` e `sourceNotes`; un umano conferma o corregge prima dell'export.

Questo è **allineato** con la revisione obbligatoria richiesta dal cliente (grill-me, domanda 4).

#### Pipeline documentata

```
upload: video [+ modello digitale opzionale]
  → (spec 12) packages/cad: DigitalModel — BOM + assembly tree + viste canoniche  [opzionale]
  → (spec 04) packages/media: keyframe, audio, scene, clip
  → (spec 05) Segmenter: timeline video-first → ManualStep[] con bounds + sourceNotes
  → (spec 06) Instructor: title, instruction, tools, parts, warnings, alternatives
  → (spec 10) Critic: recalibra confidence + critique[] (non riscrive)
  → (spec 11) Learnings: distill + priming run futuri
  → (spec 07) engine salva manual → status ready
  → (spec 08) editor: revisione umana
  → (spec 09) export: HTML + PDF
```

Agenti AI documentati: **Segmenter** (05), **Instructor** (06), **Critic** (10), **Learnings**
(11). Lane deterministica aggiuntiva: **Digital model ingest** (12).

Il diagramma in [`README.md`](../../README.md) mostra la lane CAD come stage 0 che **prime** Segment
e Write — coerente con spec 12 e con la decisione grill-me “solo video segmenta” (domanda 7).

#### Contratto dati (`@vitruvius/core`)

**Spec 01 (bootstrap)** — ogni passo contiene:

- `keyframeUrl` — frame estratto dal video
- `instruction`, `title` — testo operativo
- `tools`, `parts`, `warnings`, `alternatives` — array di stringhe libere
- `confidence`, `sourceNotes`, `reviewStatus`

**Estensioni già previste nelle spec downstream (non ancora nel contratto bootstrap):**

| Estensione                                      | Spec che la introduce | Contenuto                                         |
| ----------------------------------------------- | --------------------- | ------------------------------------------------- |
| `critique: string[]`                            | 10-ai-critic          | Flag decoupled per step unsupported               |
| `Learning` + tabella DB                         | 11-learnings          | Meta-learning persistente                         |
| `DigitalModel`, `BomItem`, `digitalModelStatus` | 12-cad-ingest         | BOM + assembly tree da STEP/mesh; viste canoniche |

**Non previsto in nessuna spec 01–12:**

- `illustrationUrl` (output stampa schematico, distinto da `keyframeUrl`)
- `PartRef` strutturato con `candidateBomItemIds` (lista piatta, non nested)
- `caption` breve per export/UI — **affiancato** a `instruction` (Critic spec 10 resta su `instruction`↔`sourceNotes`)
- Versioning (`version`, `parentVersionId`) su `InstructionManual`
- Import BOM come file separato dal modello CAD; `BomItem` con `partName` vs `bomCode` distinti

#### Spec per area — riepilogo

| Spec                   | Obiettivo documentato                | Rapporto con il cliente                                                                                  |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **01-core**            | Contratto condiviso                  | Base valida; va esteso per deliverable illustrato e BOM strutturata                                      |
| **02-db**              | Postgres + jobs queue                | Allineato                                                                                                |
| **03-web-upload**      | Upload video + enqueue               | Allineato; upload modello opzionale menzionato in README, non dettagliato in spec 03                     |
| **04-media**           | ffmpeg: keyframe, audio, scene, clip | Allineato — input per pipeline illustrativa futura                                                       |
| **05-ai-segment**      | Segmentazione video-first            | **Allineato** con grill-me domanda 7                                                                     |
| **06-ai-instructions** | Testo operativo per step             | **Parzialmente** — testo ricco vs “poche scritte” in export (`caption`); `parts: string[]` → `PartRef[]` |
| **07-engine-worker**   | Orchestrazione pipeline              | Allineato; andrà esteso con spec 13–14 e job `regenerate`                                                |
| **08-web-editor**      | Revisione guidata                    | **Parzialmente** — estendere pattern `alternatives` a BOM; job regen; gate export                        |
| **09-export**          | HTML + PDF                           | **Non allineato** — keyframe grezzi; schematic out of scope → **da estendere in-place**                  |
| **10-ai-critic**       | Review accuracy decoupled            | **Allineato** per MVP testo — **non** estendere a BOM/illustrazioni (pass dedicati altrove)              |
| **11-learnings**       | Meta-learning                        | Allineato come meccanismo                                                                                |
| **12-cad-ingest**      | Ingest modello digitale              | **Parzialmente** — vedi sotto                                                                            |

#### Spec 12 — cosa copre e cosa no

[`specs/12-cad-ingest.md`](../../specs/12-cad-ingest.md) definisce una lane **deterministica,
engine-only, opzionale**:

- Input: STEP (`.stp`/`.step`) o mesh (`.obj`, `.stl`) — export da SolidWorks, Inventor, Fusion, ecc.
- Output: `DigitalModel` con `BomItem[]` (nome parte, quantità, source id), assembly tree, viste
  canoniche (ISO / per-part), `digitalModelStatus`
- Ruolo: **priming** di Segmenter e Instructor — nomi parte precisi senza spendere crediti AI
- Degradazione: senza modello, pipeline invariata su solo video

**Allineato con il cliente:**

- CAD opzionale che arricchisce accuratezza parti
- Video-first: il modello non segmenta la timeline
- BOM strutturata come artefatto (`BomItem[]`) — base per mapping futuro

**Non coperto da spec 12 (gap verso grill-me):**

- Import **BOM come file** separato (CSV, Excel, ERP) — spec 12 deriva la BOM dal modello CAD
- **Render per passo** / viste esplose allineate al video — esplicitamente out of scope in spec 12
- **Compositing CAD+AI** (frecce, callout IKEA) — non previsto
- **`PartRef` per step** con disambiguazione — il priming alimenta l'AI, non un contratto step↔BOM
- **Allineamento video↔geometria** — esplicitamente out of scope (“research item”)

In sintesi: spec 12 risolve **“conosci i nomi delle parti dal modello digitale”**, non **“produci
illustrazioni IKEA stampabili dal CAD”**.

#### Export (spec 09)

- In scope: HTML + PDF con **keyframes originali**
- **Out of scope esplicito:** _"Schematic / illustrated rendering"_

Conflitto diretto con grill-me domande 1–3 e 9.

#### Editor (spec 08)

- In scope: edit manuale, split/merge, correzione componenti/tools, scelta tra `alternatives`
- **Out of scope esplicito:** _"AI re-generation"_ (→ job `regenerate`, spec 16)
- **Da estendere:** scelta obbligatoria su `PartRef.candidateBomItemIds` (stesso pattern UX di
  `alternatives`); enqueue regenerate; condizioni export

Conflitto parziale con grill-me domanda 5 (regen) e domanda 6 (disambiguazione) — risolvibile
**in-place** in spec 08, senza spec 15 autonoma.

### 3. Confronto punto per punto

| Requisito cliente                             | Vitruvius (documentato)                                             | Gap residuo                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Video di montaggio                            | Input principale (spec 03); segmentazione video-first (spec 05)     | Nessuno                                                                          |
| Audio operatore (opzionale)                   | Estratto (spec 04); evidenza in `sourceNotes` (spec 05–06)          | Formalizzare in layer BOM 13 (evidenza supplementare per match ambigui)          |
| SolidWorks / CAD                              | spec 12: ingest STEP/mesh → `DigitalModel` + priming                | Compositor-full per passo = fase 2; tier 1 = viste canoniche + layout export     |
| BOM (file distinta)                           | spec 12: BOM **derivata dal modello CAD**, non file BOM autonomo    | Parser file + reconcile (spec 13) → `PartRef[]`                                  |
| Illustrazioni schematiche IKEA/LEGO           | spec 09: keyframe grezzi; schematic **out of scope**                | Illustrator (spec 14) + estensione spec 09                                       |
| Poche scritte, grafica al centro              | spec 06: `instruction` verbosa; export senza `caption`              | `caption` per export; `instruction` resta per revisione/Critic                   |
| Qualità stampabile senza ritocco manuale      | Non definito; keyframe = evidenza sorgente                          | Quality bar + Illustrator; cache hash per credit discipline                      |
| CAD + AI (geometria + layout)                 | spec 12: viste canoniche per priming                                | Tier 1: layout su viste statiche; tier 2: overlay per passo (research)           |
| Codice + descrizione BOM per step             | spec 01/06: `parts: string[]`; spec 12: `BomItem` a livello modello | Layer BOM 13 → `PartRef[]`; UI scelta in spec 08                                 |
| Revisione obbligatoria pre-PDF                | spec 08: revisione guidata; `STEP_REVIEW_STATUS.confirmed`          | Gate export: tutti passi `confirmed` + nessun `candidateBomItemIds` aperto       |
| Modifica via prompt                           | spec 08: **out of scope**                                           | Job `regenerate` (spec 16), non agente separato                                  |
| Solo video = manuale completo                 | Pipeline end-to-end documentata; export = keyframe                  | Illustrator + export schematico (spec 09)                                        |
| BOM/CAD tardivi → arricchimento + versioning  | Non documentato                                                     | spec 17: re-map + re-illustrate, stessa timeline                                 |
| Stack completo alla prima consegna (grill-me) | Baseline 01–12 + gap illustrativo/BOM                               | Fase 1: video+BOM+illustrazioni AI+disambiguazione; fase 2: compositing CAD/pass |

### 4. Decisioni di design risolte (transcript grill-me)

#### Output visivo (domanda 1)

Il cliente non accetta keyframe grezzi come output finale. Vuole:

- Illustrazioni schematiche generate da **AI** (viste stilizzate, frecce, parti evidenziate) **oppure**
  prese da **modelli CAD** quando disponibili;
- Istruzioni basate sulla **grafica** con poche scritte;
- Output modificabile via **prompt** prima del PDF.

**Stato documentazione:** spec 09 esclude le schematiche; spec 12 fornisce viste canoniche per
priming, non per stampa. Gap confermato.

#### Senza CAD (domanda 2)

Quando i modelli CAD non ci sono, le illustrazioni devono essere **generate dall'AI a partire dal
video**, in **qualità stampabile**, **senza intervento umano sulle immagini**. L'utente può
rigenerare via prompt in revisione, ma il default deve essere già stampabile.

**Stato documentazione:** nessun agente Illustrator in spec 01–12.

#### Con CAD + video (domanda 3 — scelta C)

- **CAD** fornisce geometria corretta e base per numerazione parti;
- **AI** aggiunge linguaggio visivo IKEA/LEGO: frecce, evidenziazioni, callout, composizione di
  pagina.

**Stato documentazione:** spec 12 copre priming (BOM, tree, viste canoniche). **Tier 1 (spec 14):**
Compositor-lite su viste statiche + layout export — realizzabile senza pose alignment. **Tier 2:**
overlay geometrico per passo — research item (fuori scope spec 12); obiettivo grill-me domanda 3/11
in fase 2.

#### Gate pre-PDF (domanda 4 — scelta B)

La pipeline **non** deve emettere PDF automaticamente al termine. L'utente deve **approvare
esplicitamente** la bozza in revisione.

**Stato documentazione:** revisione guidata sì (spec 08). Gate export derivabile da regole su
`reviewStatus: confirmed` su tutti i passi + assenza di `candidateBomItemIds` non risolti — spec 09
rifiuta export se non soddisfatto (senza nuovo enum `MANUAL_STATUS` obbligatorio).

#### Prompt editing (domanda 5 — scelta D)

In revisione l'utente deve poter modificare via prompt: testo breve, layout grafico, rigenerazione
illustrazione, struttura passi.

**Stato documentazione:** spec 08 esclude AI re-generation. Gap confermato.

#### Rigore BOM (domanda 6 — scelta B + precisazioni)

Codice + descrizione per componente; mismatch evidenziati; UI scelta se ambiguo.

**Stato documentazione:** spec 12 fornisce `BomItem[]` dal CAD; layer BOM (spec 13) produce
`PartRef[]`; UI scelta in spec 08 (pattern `alternatives`). Validazione mismatch BOM =
**deterministica** post-mapping + blocco export — **non** nel Critic (spec 10 resta text-only
instruction↔`sourceNotes`).

#### Segmentazione (domanda 7 — scelta A)

Solo video determina confini; BOM arricchisce parti per segmento.

**Stato documentazione:** **allineato** — spec 05 video-first; spec 12 prime ma non segmenta.

#### Audio (domanda 8 — scelta C)

Audio supplementare per mapping BOM e disambiguazione, non per confini passi.

**Stato documentazione:** **parzialmente allineato** — spec 04 estrae audio; uso downstream via
`sourceNotes`. Il mapping strutturato BOM resta da definire (spec 13+).

#### Input minimo (domanda 9 — scelta A)

Solo video → manuale **completo** con nomi generici, illustrazioni AI, revisione, PDF.

**Stato documentazione:** pipeline end-to-end sì; deliverable visivo e testo minimale no.

#### BOM/CAD tardivi (domanda 10 — scelta B + C)

Arricchimento incrementale + versioning v1 → v2.

**Stato documentazione:** non coperto. Spec 12 descrive degradazione graceful quando il modello
manca al primo upload, non re-enrichment su manuali esistenti.

#### Prima consegna (domanda 11 — scelta C)

Stack completo grill-me: video + BOM + CAD + disambiguazione + compositing + versioning.

**Stato documentazione:** richiede spec 13–16 + aggiornamenti contratto/08/09. **Nota di
fattibilità:** trattare come due fasi, non un unico blocco implementativo:

| Fase  | Deliverable                                                                                                    | Dipendenze                                         |
| ----- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **1** | Video + BOM file/CAD priming + `PartRef` + disambiguazione UI + Illustrator + PDF schematico + versioning base | spec 13, 14 tier 1, 16, 17, estensioni 08/09       |
| **2** | Compositor-full (overlay IKEA per passo su geometria CAD)                                                      | pose alignment video↔CAD (research; fuori spec 12) |

Comunicare al cliente che la domanda 11 resta obiettivo di prodotto, ma la fase 2 non è
intercambiabile con la fase 1 sullo stesso timeline di engineering.

### 5. Gap architetturali — analisi tecnica

#### 5.1 Contratto `@vitruvius/core` — estensioni necessarie

Il contratto bootstrap (spec 01) va esteso. Spec 10–12 introducono già alcune aggiunte
pianificate; il deliverable cliente richiede in più:

```typescript
// spec 12 (pianificato) — livello modello, non per-step
type BomItem = {
	id: string;
	partName: string; // da STEP / modello CAD (spec 12)
	bomCode?: string; // codice distinta cliente (spec 13, file BOM)
	description: string;
	quantity?: number;
	source: 'cad' | 'file' | 'inferred';
};

type DigitalModel = {
	bom: BomItem[];
	assemblyTree: /* ... */;
	canonicalViewRefs: string[];
	// + metadata, digitalModelStatus
};

// spec 13 + contratto step
type PartRef = {
	bomItemId: string | null; // null = etichetta generica non ancora mappata
	label: string; // es. "vite" se bomItemId null
	bomCode?: string;
	description?: string;
	confidence: number;
	candidateBomItemIds?: string[]; // risoluzione obbligatoria in editor (spec 08)
};

type ManualStep = {
	// campi bootstrap da estendere, non sostituire tutti
	illustrationUrl: string; // output primario stampa (schematica)
	keyframeUrl?: string; // evidenza sorgente, non output stampa
	parts: PartRef[]; // sostituisce parts: string[]
	instruction: string; // bozza operativa — input al Critic (spec 10)
	caption: string; // testo breve per export IKEA (derivato o scritto da Instructor)
	critique: string[]; // spec 10
};

type InstructionManual = {
	// campi bootstrap
	version: number;
	parentVersionId?: string;
	digitalModelStatus?: /* spec 12 */;
	bom?: BomItem[]; // merge BOM file + BOM da CAD (spec 13 reconcile)
	cadSourceRef?: string;
};
```

Impatti: schema zod, DB, mapper, export template, spec 06/08/09 downstream. Spec 10 resta su
`instruction` — non spostare validazione BOM nel Critic.

#### 5.2 Moduli e agenti — mappa consolidata

| Modulo              | Spec      | Responsabilità                                   | Note                                                                         |
| ------------------- | --------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Media**           | 04        | ffmpeg artifacts                                 | Documentato                                                                  |
| **CAD ingest**      | 12        | STEP/mesh → `DigitalModel`                       | Deterministico; `packages/cad`                                               |
| **BOM layer**       | 13        | Parser file BOM + reconcile + `PartRef[]`        | **Ibrido:** match deterministico + AI solo ambigui; non duplicare Instructor |
| **Segmenter**       | 05        | Timeline video-first                             | Documentato                                                                  |
| **Instructor**      | 06        | `instruction`, `caption`, tools, `PartRef` input | Consuma output spec 13                                                       |
| **Critic**          | 10        | `instruction` ↔ `sourceNotes`                    | **Invariato** — text-only; no BOM/illustrazioni                              |
| **Illustrator**     | 14 tier 1 | Schematiche AI da video/keyframe                 | `packages/ai`; cache hash                                                    |
| **Compositor-lite** | 14 tier 1 | Layout IKEA su viste canoniche spec 12           | Senza pose alignment                                                         |
| **Compositor-full** | 14 tier 2 | Overlay geometrico per passo                     | Richiede research alignment                                                  |
| **Learnings**       | 11        | Distill + priming                                | Documentato                                                                  |
| **Regenerate job**  | 16        | Prompt in revisione                              | `JOB_TYPE: regenerate`; richiama 06/14 per scope                             |

Parser BOM file: stile deterministico come spec 12 (`packages/cad` o modulo dedicato engine-only),
non un quinto agente generativo parallelo. Tutte le chiamate modello restano in `packages/ai`.

#### 5.3 Nuove spec da scrivere (consolidate: 4 spec, non 6)

La numerazione **12** resta [`12-cad-ingest`](../../specs/12-cad-ingest.md). Estensioni cliente:

| Spec                     | Obiettivo                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **13-bom-map**           | Import BOM file; merge/reconcile con `DigitalModel`; match deterministico → `PartRef[]`; AI solo ambigui; flag deterministici pre-export                |
| **14-ai-illustrate**     | **Tier 1:** Illustrator + Compositor-lite. **Tier 2:** Compositor-full (pose alignment). Credit discipline: batch, cache hash, stile template condiviso |
| **16-regenerate-job**    | `JOB_TYPE: regenerate` con scope `text` \| `illustration` \| `layout` \| `structure`; web enqueue, engine richiama agenti esistenti                     |
| **17-manual-versioning** | Versioni manuali; arricchimento v1 → v2 (stessa timeline)                                                                                               |

**Assorbito altrove (non spec autonome):**

| Ex proposta               | Dove                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- |
| ~~15-disambiguation~~     | spec **08** — UI scelta obbligatoria (pattern `alternatives`) su `candidateBomItemIds` |
| ~~18-export-illustrated~~ | spec **09** estesa — layout IKEA/LEGO con `illustrationUrl` + `caption`                |

#### 5.4 Spec esistenti da aggiornare

| Spec                   | Modifica                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **01-core**            | Tipi spec 10–12 + `PartRef`, `illustrationUrl`, `caption` + `instruction`, versioning, `BomItem.partName`/`bomCode` |
| **03-web-upload**      | Upload opzionale modello digitale + BOM file (spec 13)                                                              |
| **06-ai-instructions** | `caption` affiancato a `instruction`; consuma `PartRef[]`; priming `DigitalModel`                                   |
| **07-engine-worker**   | `cad → media → segment → bom-map → instruct → critic → illustrate → learnings`; job `regenerate`                    |
| **08-web-editor**      | Disambiguazione BOM; enqueue `regenerate`; gate export (regole su `confirmed` + candidati)                          |
| **09-export**          | Layout schematico IKEA; gate pre-export; **rimuovere** "schematic out of scope"                                     |
| **10-ai-critic**       | **Nessuna estensione BOM** — opzionale: regole deterministiche _prima_ del Critic usano `digitalModelStatus`        |
| **12-cad-ingest**      | Confine con spec 14: viste canoniche = priming + Compositor-lite; render per passo = tier 2                         |

#### 5.5 Pipeline target (fase 1 — deliverable cliente realistico)

Ordine allineato a spec 10 (Critic text-only **prima** dell'illustrazione) e credit discipline:

```
upload: video [+ audio] [+ BOM file] [+ modello CAD/mesh]
  → cad-ingest (12) + bom-file-parse (13) [opzionali, parallelo a media]
  → media (04): keyframe, audio, clip
  → segment (05): video-first, primed da DigitalModel + learnings
  → bom-map (13): PartRef[] — deterministico first, AI solo ambigui
  → instruct (06): instruction + caption + parts strutturati
  → critic (10): instruction ↔ sourceNotes ONLY (invariato)
  → illustrate (14 tier 1): Illustrator | Compositor-lite
  → [optional] illustration-qa: vision pass solo passi flaggati (fase 2+)
  → learnings (11)
  → editor (08): revisione, risolvi candidateBomItemIds, job regenerate (16)
  → export (09): PDF IKEA — solo se tutti confirmed ∧ nessun candidato aperto

Arricchimento v1 → v2 (17):
  → re-bom-map + re-illustrate (stessa timeline) → nuova versione manual
```

**Fase 2 (grill-me domanda 3/11 — compositing CAD per passo):** richiede pose alignment; non
bloccare fase 1. Spec 12 **non** si espande verso questo obiettivo.

#### 5.6 Riutilizzo di quanto già documentato

| Esistente                            | Evita ridondanza                                                |
| ------------------------------------ | --------------------------------------------------------------- |
| spec 08 `alternatives[]` + scelta UI | Stesso pattern per disambiguazione BOM                          |
| `STEP_REVIEW_STATUS.confirmed`       | Gate export senza nuovo `MANUAL_STATUS`                         |
| spec 12 + `digitalModelStatus`       | Flag BOM deterministici pre-Critic                              |
| spec 11 learnings                    | Convenzioni nome↔BOM cliente, meno ambiguità ripetuta           |
| spec 12 stile deterministico         | Parser BOM file nello stesso package/lane, non in `packages/ai` |

### 6. Rischi e assunzioni

| Rischio                                   | Mitigazione                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Qualità stampabile** illustrazioni AI   | Quality bar misurabile; cache hash; job `regenerate` scope `illustration` (spec 16)                    |
| **Confine spec 12 vs illustrato**         | 12 = priming; tier 1 in spec 14; tier 2 solo con pose alignment research                               |
| **Compositor-full vs grill-me domanda 3** | Comunicare fase 1 vs fase 2 al cliente; tier 1 = viste statiche + layout export                        |
| **Crediti image-gen per passo**           | Batch dove possibile; template stile condiviso; tier economico vs regen profonda (grill-me domanda 5)  |
| **Disambiguazione BOM**                   | Layer 13 + audio in `sourceNotes` + UI spec 08; blocco export deterministico                           |
| **Duplicazione Instructor vs BOM layer**  | Spec 13 = parser/reconcile/match; Instructor non ripete mapping ovvio con CAD presente                 |
| **Breaking change** `@vitruvius/core`     | Un bump coordinato (10–12 + 13–17); PR con `!`; migration DB                                           |
| **Stack completo grill-me domanda 11**    | Roadmap esplicita fase 1 → fase 2; non trattare compositing CAD/pass come stesso sprint di Illustrator |

### 7. Raccomandazioni

1. **Baseline spec 01–12** — estendere, non ripartire da zero (video-first, Critic, learnings, lane CAD).
2. **Spec 13, 14, 16, 17** — stub scritti; implementare in ordine phase 1; mantenere spec 12 sul
   scope priming.
3. **Contratto:** `partName`/`bomCode` distinti; `PartRef.candidateBomItemIds` flat; `caption` **affiancato** a
   `instruction`; un breaking change coordinato.
4. **Pipeline:** `instruct → critic (testo) → illustrate` — non spostare validazione BOM nel Critic.
5. **BOM layer 13:** deterministic-first; AI solo ambigui; parser file nello stile spec 12.
6. **Spec 14 a tier:** tier 1 per prima consegna realistica; tier 2 legato a research alignment.
7. **Gate export:** regole su `confirmed` + candidati risolti (spec 08/09), non nuovo stato manuale obbligatorio.
8. **`architecture.md` / README / ai-layer / decisions** — aggiornati (2026-06-20) con baseline vs target,
   roadmap phase 1/2, spec stubs 13–17.
9. **Comunicazione cliente:** domanda grill-me 11 = obiettivo prodotto; engineering = fase 1 poi fase 2.

### 8. Riferimenti

- Architettura: [`architecture.md`](architecture.md)
- AI layer: [`ai-layer.md`](ai-layer.md)
- Pipeline overview: [`README.md`](../../README.md)
- Decisioni: [`decisions.md`](decisions.md)
- Avanzamento implementazione (separato da questo doc): [`implementation-progress.md`](implementation-progress.md)
- Spec: [`specs/`](../../specs/) — baseline `01`–`12`; extensions `13`, `14`, `16`, `17` (stubs)
