# Sessione 2026-06-29 — upload video più veloce e senza blocchi (concorrenza delle parti)

Sintesi di quanto richiesto e implementato in chat (Stefano + agente). Dettaglio tecnico permanente
in [`specs/20-direct-r2-upload.md`](../../specs/20-direct-r2-upload.md#implementation-notes) e
[`implementation-progress.md`](../implementation-progress.md) (riga spec 20 della status matrix).

---

## Punto di partenza

> «Il caricamento dei video è lento e si blocca. Riesci a renderlo più veloce ed evitare che si
> blocchi?»

Ricognizione: nell'app non c'è **riproduzione** video (l'editor mostra keyframe come immagini),
quindi «caricamento video» = **upload** della sorgente verso Cloudflare R2. Il percorso è l'upload
diretto browser→R2 in multipart presigned (spec 20): il client chiede a `/api/uploads/create`, firma
le parti via `/api/uploads/sign`, fa il PUT diretto a R2 e chiude con `/api/uploads/complete`. I byte
non passano mai dal server web.

---

## Diagnosi

In `apps/web/src/routes/+page.svelte`, `uploadParts` caricava le parti **una alla volta, in
sequenza**, con un round-trip di firma **prima di ogni parte**:

- **Lento**: una sola parte in transito alla volta → un singolo socket non satura mai la banda in
  upload (throughput per-connessione limitato, soprattutto con RTT alto). Un video da 6 GB ≈ 94 parti
  da 64 MiB caricate in fila indiana.
- **Si blocca**: tra una parte e l'altra c'è una firma sincrona durante la quale **non transita
  nulla** → la barra di progresso sembra congelarsi a ogni confine di parte (~94 micro-pause).
  Inoltre un singolo errore di rete transitorio su una parte abortiva l'intero upload.

La firma per-parte non era casuale: il fix #85 l'aveva introdotta proprio perché firmare tutte le
parti in anticipo faceva scadere le URL presigned su upload lunghi (`Request has expired`). La
sequenzialità, però, restava il collo di bottiglia.

---

## Soluzione

Sostituito il loop sequenziale con un **pool di worker a concorrenza limitata**, mantenendo la firma
per-parte appena prima del PUT.

- **`UPLOAD_CONCURRENCY = 4`**: 4 parti in transito insieme → banda saturata; mentre una parte viene
  firmata, le altre trasferiscono (la latenza di firma è nascosta). 4 resta dentro i limiti di socket
  per-host dei browser senza sovraccaricare un uplink modesto.
- **Firma per-parte preservata**: ogni URL è firmata subito prima del proprio PUT, quindi il
  ragionamento del #85 regge (la TTL di firma deve solo sopravvivere al transfer di una parte, che in
  concorrenza condivide l'uplink con le sorelle).
- **Retry per-parte** (`PART_MAX_ATTEMPTS = 3`) sugli errori di rete transitori: un chunk perso non
  manda all'aria un upload da più GB.
- **Stop pulito sul fallimento**: se una parte fallisce definitivamente, un flag `aborted` ferma
  subito i worker dal reclamare nuove parti; l'errore propaga a `directSubmit`, che aborta l'intero
  multipart upload (beacon di abort già esistente) ed espone il messaggio.
- **Progresso corretto in concorrenza**: somma da una mappa byte-per-parte (`loadedByPart`), non più
  un singolo contatore — resta corretto con parti concorrenti e ritentate.

Cambiamento **solo client**: gli endpoint di firma e il contratto multipart sono invariati.
`completeMultipartUpload` ordina già le parti per `partNumber`, quindi l'ordine di completamento non
conta.

### Deliverable

- `apps/web/src/routes/+page.svelte` — `uploadParts` riscritta (worker pool + retry + progress
  per-parte); helper `signPart` estratto.

---

## Revisione esterna

Tutta la modifica di sessione è stata fatta revisionare da un agente esterno (review read-only del
diff `origin/main...HEAD`). Verdetto: **APPROVE-WITH-NITS**, nessun blocker. Confermata corretta la
parte portante: claim di ogni parte esattamente una volta (nessun doppione/salto), progress
concorrenza- e retry-safe, array `completed` denso a fine upload, retry idempotenti per il multipart
R2, propagazione errori fino all'abort. Nit applicati:

- Stop dei worker superstiti dopo un fallimento definitivo (flag `aborted`) — evita spreco di banda e
  progress che sale dopo l'errore.
- Commento sulla TTL per-parte precisato per il caso concorrente.

---

## Validazione

```bash
pnpm format      # pulito (file invariato dopo format)
pnpm lint        # @vitruvius/web: ok (incl. check i18n)
pnpm check       # @vitruvius/web (svelte-check): 0 errori / 0 warning, sotto noUncheckedIndexedAccess
pnpm build       # 8/8 task turbo
pnpm --filter @vitruvius/db exec vitest run src/storage.test.ts   # 17/17 (helper multipart R2)
```

La modifica è puramente client (componente Svelte): non ci sono test unitari su quel file; eseguita
la suite più vicina (helper multipart R2 lato `@vitruvius/db`).

---

## Documentazione aggiornata in sessione

- `specs/20-direct-r2-upload.md` — sezione **Implementation notes** (status + concorrenza delle
  parti).
- `docs/ai/implementation-progress.md` — riga **spec 20** aggiunta alla status matrix; riga **spec
  19** corretta a _merged (#66)_; `_Last updated_` aggiornata.
- `docs/ai/session-notes/2026-06-29-video-upload-concurrency.md` — questo documento.

---

## Nota / follow-up

- L'ottimizzazione vale sul percorso **R2 configurato** (upload diretto). Senza R2 si usa il fallback
  server-proxied invariato, ancora limitato da `BODY_SIZE_LIMIT` e dalla memoria del server — fuori
  scope di questa sessione.
- Spec 20 marca esplicitamente fuori scope la **ripresa delle parti tra reload di pagina**: il retry
  introdotto è **in-flight** (entro la stessa sessione di upload), quindi additivo, non in conflitto
  con quella decisione.
