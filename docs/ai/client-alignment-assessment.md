# Client alignment assessment

**Date:** 2026-06-19  
**Method:** Structured design review (`/grill-me`) — decisions resolved one branch at a time.  
**Scope:** Compare the client's request (IKEA/LEGO-style assembly instructions from video and
optional inputs) against Vitruvius's current specs and architecture.

---

## Esito sintetico

### Richiesta cliente (in breve)

Software che generi **istruzioni di montaggio in stile IKEA/LEGO** a partire da:

- **Video di montaggio** (input obbligatorio)
- **Audio operatore** (opzionale — spiega cosa sta facendo)
- **Disegni SolidWorks / CAD** (opzionali)
- **BOM** (opzionale)

Output: illustrazioni schematiche con **poche scritte**, codici e descrizioni componenti per
passo (dalla BOM quando disponibile), **revisione obbligatoria** con modifica via prompt, poi
**PDF stampabile**.

### Verdetto

| Dimensione | Giudizio |
| --- | --- |
| Intento di prodotto | **Parzialmente allineato** — stessa direzione (video → manuale IKEA, bozza AI + revisione), profondità del deliverable diversa |
| Architettura monorepo (web / engine / `@vitruvius/core`) | **Allineata** — valida come fondazione; non serve ripartire da zero |
| Contratto dati (`@vitruvius/core`) | **Insufficiente** — richiede breaking change su `ManualStep` e modelli BOM/CAD/versioni |
| Pipeline AI attuale | **Insufficiente** — mancano agenti per illustrazioni, mapping BOM strutturato, compositing CAD+AI |
| Editor / UX | **Parzialmente allineato** — revisione guidata sì; prompt editing, disambiguazione BOM e layout visivo no |
| Prima consegna cliente (stack completo) | **Non realizzabile** sulle spec attuali senza estensione sostanziale |

**In una frase:** Vitruvius oggi è un generatore di **bozze testuali con keyframe dal video**;
il cliente vuole un generatore di **manuali illustrati industriali** (schematiche stampabili,
BOM/CAD, disambiguazione, prompt editing).

### Decisioni chiave (risolte in grill-me)

| # | Domanda | Scelta |
| --- | --- | --- |
| 1 | Formato output | Illustrazioni schematiche (AI o CAD); istruzioni grafiche con poche scritte; modifica via prompt prima del PDF |
| 2 | Senza CAD | Illustrazioni AI dal video, qualità stampabile **senza ritocco manuale sulle immagini** |
| 3 | Con CAD + video | **CAD** per geometria e numerazione; **AI** per layout (frecce, callout, composizione IKEA/LEGO) |
| 4 | Gate pre-PDF | **Revisione sempre obbligatoria** — nessun PDF senza approvazione esplicita |
| 5 | Scope prompt editing | **Tutto:** testo, illustrazioni, struttura passi (split/merge/riordino via editor + prompt) |
| 6 | Rigore BOM | Mismatch evidenziati in revisione; risoluzione obbligatoria prima dell'approvazione; codice + descrizione BOM per componente per step; UI di scelta se ambiguo |
| 7 | Confini dei passi | **Solo video** segmenta timeline; BOM arricchisce le parti per ogni segmento |
| 8 | Ruolo audio | **Supplementare** — aiuta mapping BOM e disambiguazione, non guida i confini dei passi |
| 9 | Solo video | Manuale **completo** con nomi generici ("vite", "staffa"), non bozza incompleta |
| 10 | BOM/CAD caricati dopo | **Arricchimento incrementale + versioning** (v1 solo video → v2 con BOM/CAD) |
| 11 | Prima consegna | **Stack completo** end-to-end (video + BOM + CAD + disambiguazione + compositing + versioning) |

### Cosa tenere da Vitruvius

- Monorepo e boundary web/engine via DB + `@vitruvius/core`
- Pipeline engine: media → segment → instruct → critic → learnings
- Posizionamento _bozza AI + revisione umana_ (allineato con revisione obbligatoria)
- `packages/media` (ffmpeg, audio, keyframe) come input per pipeline illustrativa
- Critic + `confidence` + `sourceNotes` come base per flag e disambiguazione
- Export HTML/PDF via Playwright nell'engine

### Cosa manca (priorità per consegna cliente)

1. Agente **Illustrator / Compositor** (schematiche AI + overlay su render CAD)
2. **Import BOM** con `PartRef` strutturato per step (non `string[]`)
3. **Import CAD** (SolidWorks o equivalente) e render viste per passo
4. **UI disambiguazione** — opzioni BOM plausibili quando il video non basta
5. **Prompt regeneration** in editor (oggi esplicitamente out of scope in spec 08)
6. **Versioning manuali** e arricchimento incrementale v1 → v2
7. **Export PDF** con layout IKEA/LEGO (illustrazioni schematiche, non keyframe grezzi)

---

## Esito dettagliato

### 1. Richiesta cliente — requisiti espliciti

Il cliente chiede un software che:

1. Parta dal **video di montaggio** come input universale.
2. Usi opzionalmente:
   - **Audio** dell'operatore che narra le azioni;
   - **Modelli CAD** (SolidWorks o equivalente);
   - **BOM** (distinta base).
3. Produca istruzioni **in stile IKEA/LEGO**:
   - Illustrazioni **schematiche** (non foto/frame grezzi dal video);
   - **Poche scritte** — la grafica porta il messaggio;
   - Per ogni passo: **codici e descrizioni** dei componenti coinvolti (dalla BOM quando presente).
4. Permetta **modifica facile** dell'output, **anche via prompt**, prima della stampa.
5. Generi un **PDF stampabile** dopo approvazione.

Requisito aggiuntivo emerso in grill-me: quando la BOM è disponibile, le etichette generiche
inferred dal video ("vite", "staffa") devono essere sostituite da **codice e descrizione
precisi** dalla BOM. Se più righe BOM sono plausibili per lo stesso oggetto visto nel video, il
sistema deve **mostrare il dubbio** in revisione e l'utente sceglie l'opzione corretta.

### 2. Cosa definisce Vitruvius oggi

Riferimenti: [`architecture.md`](architecture.md), [`ai-layer.md`](ai-layer.md), spec `01`–`11`.

#### Posizionamento prodotto

Vitruvius trasforma un **video di montaggio** in un **manuale step-by-step modificabile**
(IKEA-style), con revisione umana guidata. Non è un generatore fully automatico: ogni output AI
porta `confidence` e `sourceNotes`; un umano conferma o corregge prima dell'export.

Questo è **allineato** con la revisione obbligatoria richiesta dal cliente.

#### Pipeline attuale

```
upload video → engine: media (ffmpeg) → segment → instruct → critic → learnings
             → editor umano → export (HTML + PDF)
```

Agenti AI definiti: **Segmenter**, **Instructor**, **Critic**, **Learnings** (spec 05, 06, 10, 11).

#### Contratto dati (`ManualStep`)

Oggi ogni passo contiene:

- `keyframeUrl` — frame estratto dal video (immagine del passo)
- `instruction`, `title` — testo operativo
- `tools`, `parts`, `warnings`, `alternatives` — array di stringhe libere
- `confidence`, `sourceNotes`, `reviewStatus`

Non esiste:

- Riferimento strutturato a righe BOM
- URL illustrazione schematica (distinto dal keyframe sorgente)
- Modello di ambiguità / candidati parti
- Versioning del manuale

#### Export (spec 09)

- In scope: HTML + PDF con **keyframes originali**
- **Out of scope esplicito:** _"Schematic / illustrated rendering"_

#### Editor (spec 08)

- In scope: edit manuale, split/merge, correzione componenti/tools, scelta tra `alternatives`
- **Out of scope esplicito:** _"AI re-generation"_

#### Media (spec 04)

- Estrae keyframe, audio, scene, clip — ma l'interpretazione AI dell'audio è delegata agli agenti
  downstream via `sourceNotes`, non a un modello BOM strutturato.

#### BOM / CAD

- Nessuna spec, nessuna tabella DB, nessun tipo in `@vitruvius/core`.

### 3. Confronto punto per punto

| Requisito cliente | Vitruvius oggi | Gap |
| --- | --- | --- |
| Video di montaggio | Input principale (spec 03) | Nessuno |
| Audio operatore (opzionale) | Estratto (spec 04); usato come evidenza in `sourceNotes` | Implementazione stub; ruolo supplementare per BOM mapping da formalizzare |
| SolidWorks / CAD | Non previsto | **Import CAD, render viste, pipeline compositing** |
| BOM | Non previsto | **Import BOM, PartRef per step, validazione, disambiguazione** |
| Illustrazioni schematiche IKEA/LEGO | Keyframe video | **Agente illustratore + layout export** |
| Poche scritte, grafica al centro | Testo ricco per step (`instruction`, tools, warnings…) | **Ridisegnare modello testo** (`caption` breve vs `instruction` verbosa) |
| Qualità stampabile immagini senza ritocco manuale | Non definito; keyframe grezzi | **Quality bar + agente illustratore** |
| CAD + AI (geometria + layout) | Non previsto | **Spec compositing CAD base + AI overlay** |
| Codice + descrizione BOM per step | `parts: string[]` generici | **`PartRef` strutturato + UI disambiguazione** |
| Revisione obbligatoria pre-PDF | Allineato (editor + status manual) | Gate esplicito "approved" prima di export da rafforzare |
| Modifica via prompt | Out of scope (spec 08) | **Nuovo job type / agente regenerate** |
| Solo video = manuale completo | Parzialmente (bozza revisionabile) | Allineare messaging: output completo con nomi generici |
| BOM/CAD tardivi → arricchimento + versioning | Non previsto | **Versioning manuali + job enrich** |
| Stack completo alla prima consegna | MVP bootstrap (stub) | **Estensione sostanziale delle spec** |

### 4. Decisioni di design risolte (transcript grill-me)

#### Output visivo (domanda 1)

Il cliente non accetta keyframe grezzi come output finale. Vuole:

- Illustrazioni schematiche generate da **AI** (viste stilizzate, frecce, parti evidenziate) **oppure**
  prese da **modelli CAD** quando disponibili;
- Istruzioni basate sulla **grafica** con poche scritte;
- Output modificabile via **prompt** prima del PDF.

#### Senza CAD (domanda 2)

Quando i modelli CAD non ci sono, le illustrazioni devono essere **generate dall'AI a partire dal
video**, in **qualità stampabile**, **senza intervento umano sulle immagini** (nessun ritocco
pixel-per-pixel). L'utente può comunque rigenerare via prompt in revisione, ma il default deve
essere già stampabile.

#### Con CAD + video (domanda 3 — scelta C)

- **CAD** fornisce geometria corretta e base per numerazione parti;
- **AI** aggiunge linguaggio visivo IKEA/LEGO: frecce, evidenziazioni, callout, composizione di
  pagina.

#### Gate pre-PDF (domanda 4 — scelta B)

La pipeline **non** deve emettere PDF automaticamente al termine. L'utente deve **approvare
esplicitamente** la bozza in una schermata di revisione, anche se immagini e testi sono già a
livello stampa.

#### Prompt editing (domanda 5 — scelta D)

In revisione l'utente deve poter modificare via prompt:

- Testo breve (titoli, didascalie);
- Layout grafico (frecce, callout — geometria CAD invariata);
- Rigenerazione completa dell'illustrazione di un passo;
- Struttura del manuale (split/merge/riordino — via editor strutturato + prompt).

Implementazione consigliata: **due livelli** — modifiche rapide a basso costo (layout) e
rigenerazione profonda su richiesta (nuova vista, nuova composizione).

#### Rigore BOM (domanda 6 — scelta B + precisazioni)

- Ogni passo elenca **codice e descrizione** dei componenti coinvolti, presi dalla BOM;
- I mismatch BOM ↔ illustrazione sono **evidenziati in revisione** e devono essere risolti prima
  dell'approvazione;
- In caso di **ambiguità** (es. "vite" nel video, tre viti plausibili in BOM), la UI mostra le
  opzioni e l'utente sceglie — non un warning generico.

#### Segmentazione (domanda 7 — scelta A)

- **Solo il video** (timeline visiva) determina ordine e confini dei passi;
- La BOM **non** guida la sequenza di montaggio;
- La BOM **arricchisce** ogni segmento con identificativi parte precisi.

#### Audio (domanda 8 — scelta C)

- L'audio **non** definisce i confini dei passi (coerente con video-first);
- L'audio **aiuta** il mapping componenti → righe BOM e riduce ambiguità in revisione;
- Esempio: il narratore dice "fissiamo la staffa di supporto" → candidato BOM più probabile.

#### Input minimo (domanda 9 — scelta A)

Con **solo video**, il sistema produce un manuale **completo** (illustrazioni AI, testo essenziale,
revisione, PDF) con **nomi generici** delle parti. Non è una bozza incompleta o un placeholder che
invita a caricare BOM — è un percorso prodotto valido.

#### BOM/CAD tardivi (domanda 10 — scelta B + C)

Se l'utente carica BOM e/o CAD **dopo** aver generato un manuale solo video:

- **Arricchimento incrementale:** stessi passi e stessa timeline; remapping parti con codici BOM;
  illustrazioni rigenerate dove entra il CAD;
- **Versioning:** v1 (solo video) resta consultabile; v2 (arricchito) è una nuova versione.

#### Prima consegna (domanda 11 — scelta C)

La prima consegna al cliente deve includere lo **stack completo**:

video + BOM + CAD + disambiguazione + compositing CAD/AI + versioning.

_Nota:_ internamente conviene comunque sviluppare in vertical slice (video+illustrazioni → BOM →
CAD → versioning), ma il deliverable cliente non deve essere una versione "solo keyframe" intermedia.

### 5. Gap architetturali — analisi tecnica

#### 5.1 Contratto `@vitruvius/core` — breaking changes indicativi

Il modello attuale va esteso (indicativo, non implementato):

```typescript
type BomItem = {
  id: string;
  code: string;
  description: string;
  quantity?: number;
};

type PartRef = {
  bomItemId: string;
  code: string;
  description: string;
  confidence: number;
  candidates?: PartRef[]; // popolato quando ambiguo — UI disambiguazione in revisione
};

type ManualStep = {
  // ... campi esistenti da rivedere ...
  illustrationUrl: string; // output primario per stampa (schematica)
  keyframeUrl?: string; // evidenza sorgente, non output stampa
  parts: PartRef[]; // sostituisce parts: string[]
  caption: string; // testo breve; sostituisce instruction verbosa come campo principale
};

type InstructionManual = {
  // ... campi esistenti ...
  version: number;
  parentVersionId?: string; // per catena v1 → v2 arricchimento incrementale
  bom?: BomItem[];
  cadSourceRef?: string;
};
```

Questi cambiamenti impattano schema zod, DB, mapper, export template, e tutte le spec downstream.

#### 5.2 Nuovi agenti / package (proposta)

| Agente / modulo | Responsabilità |
| --- | --- |
| **Illustrator** | Genera schematiche AI da video/keyframe (percorso solo video) |
| **CAD Renderer** | Import modelli, render viste per passo |
| **Compositor** | Overlay AI su render CAD (frecce, callout, layout IKEA) |
| **BOM Mapper** | Associa segmenti video a righe BOM; produce `PartRef` + candidati ambigui |
| **Regenerator** | Risponde a prompt utente in revisione (testo, layout, illustrazione, struttura) |

Tutti dietro `packages/ai` (o `packages/cad`, `packages/bom` se il scope lo giustifica), engine-only,
output validato con zod.

#### 5.3 Nuove spec proposte

| Spec | Obiettivo |
| --- | --- |
| **12-bom-import** | Parsing BOM, persistenza, schema `BomItem` |
| **13-cad-import** | Ingest SolidWorks/equivalente, render viste |
| **14-ai-illustrate** | Schematiche AI + compositing CAD+AI |
| **15-disambiguation** | Modello candidati + UI scelta in revisione |
| **16-prompt-regenerate** | Job rigenerazione per prompt in editor |
| **17-manual-versioning** | Versioni manuali, arricchimento incrementale v1 → v2 |

#### 5.4 Spec esistenti da aggiornare

| Spec | Modifica |
| --- | --- |
| **01-core** | Nuovi tipi BOM, PartRef, versioning, illustrationUrl |
| **06-ai-instructions** | Testo minimo (`caption`); PartRef invece di stringhe |
| **08-web-editor** | Disambiguazione BOM, prompt editing, gate approvazione pre-export |
| **09-export** | Layout IKEA/LEGO con illustrazioni schematiche; **rimuovere** "schematic out of scope" |
| **10-ai-critic** | Validazione mismatch BOM, flag ambiguità |

#### 5.5 Pipeline dati target (con stack completo)

```
upload: video [+ audio integrato] [+ BOM] [+ CAD]
  → media: keyframe, audio, clip
  → segment (video-first)
  → bom-map (se BOM: PartRef + candidati; altrimenti nomi generici)
  → instruct (caption breve)
  → illustrate / compositor (AI schematiche o CAD+AI overlay)
  → critic (accuracy + BOM consistency + ambiguità)
  → learnings
  → editor: revisione obbligatoria, disambiguazione, prompt regenerate
  → approvazione esplicita
  → export PDF

Arricchimento v1 → v2 (BOM/CAD aggiunti dopo):
  → bom-map + re-illustrate su passi esistenti (stessa timeline)
  → nuova versione manual
```

### 6. Rischi e assunzioni

| Rischio | Mitigazione |
| --- | --- |
| **Qualità stampabile** illustrazioni AI senza ritocco manuale | Definire criteri misurabili (risoluzione, leggibilità callout, coerenza stile); fallback prompt regenerate in revisione |
| **Import CAD** SolidWorks — formati, licenze, automazione render | Validare early con file reali cliente; possibile servizio dedicato nell'engine container |
| **Disambiguazione BOM** — accuracy mapping video → BOM | Critic + audio supplementare + UI scelta obbligatoria per candidati multipli |
| **Stack completo alla prima consegna** — scope ampio | Sviluppo interno a vertical slice; contratto dati esteso fin da subito per evitare rewrite |
| **Breaking change** su `@vitruvius/core` | Marcare con `!` in PR e migration DB coordinata |

### 7. Raccomandazioni

1. **Aggiornare** [`architecture.md`](architecture.md) con la visione prodotto risolta in questo
   documento (illustrazioni schematiche, BOM/CAD, versioning).
2. **Scrivere** le spec 12–17 prima di implementare import CAD o agente illustratore.
3. **Estendere** `@vitruvius/core` con BOM, PartRef, versioning — breaking change pianificato.
4. **Rimuovere** da spec 09 l'esclusione del rendering schematico; **aggiungere** a spec 08 il
   prompt regeneration.
5. **Mantenere** quanto già allineato: boundary web/engine, Critic, learnings, revisione umana,
   credit discipline.

### 8. Riferimenti

- Architettura attuale: [`architecture.md`](architecture.md)
- AI layer: [`ai-layer.md`](ai-layer.md)
- Decisioni: [`decisions.md`](decisions.md)
- Spec implementative: [`specs/`](../../specs/)
