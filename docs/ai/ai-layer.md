# The AI layer

How Vitruvius uses AI agents, how it keeps that usage cheap, how it checks its own
accuracy, and how it learns over time. This is the conceptual home for everything that lives
behind [`packages/ai`](../../packages/ai). The work units are in [`specs/`](../../specs); the
resolved trade-offs are in [`decisions.md`](./decisions.md) (8–12).

Vitruvius's positioning is _AI-generated draft + guided human revision_ — not a fully automatic
generator. Everything below serves that: spend the fewest credits to produce a draft that is honest
about its own confidence, and get better at it over time.

The [client alignment assessment](./client-alignment-assessment.md) adds **Illustrator** and
**Compositor** agents (spec 14) for schematic deliverables — tier 1 (Illustrator + Compositor-lite)
is now in `packages/ai`. **BOM mapping** (spec 13) is mostly deterministic — not a fifth generative
agent. The **Critic** scope does not expand to BOM or images.

## The agent roster

### Shipped or in progress (baseline 05, 06, 10, 11; phase 1 specs 13, 14 tier 1, 16)

| Agent                | Spec                                    | Responsibility                                                                                                                                                            |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Segmenter**        | [05](../../specs/05-ai-segment.md)      | Split the video into ordered steps with time bounds, `confidence`, `sourceNotes`. Video-first only.                                                                       |
| **Instructor**       | [06](../../specs/06-ai-instructions.md) | Fill operative fields per step (`instruction`, `caption`, tools, `PartRef`-backed parts, warnings, alternatives).                                                         |
| **Critic**           | [10](../../specs/10-ai-critic.md)       | Review draft **text** for accuracy vs `sourceNotes`; adjust `confidence`, flag with `critique[]`. Never rewrites.                                                         |
| **Learnings**        | [11](../../specs/11-learnings.md)       | Capture reusable domain knowledge from a run and feed it back into future runs.                                                                                           |
| **BOM layer**        | [13](../../specs/13-bom-map.md)         | Parse BOM file, reconcile with `DigitalModel`; deterministic match → `PartRef[]`; AI **only** if ambiguous. Merged (#34).                                                 |
| **Illustrator**      | [14](../../specs/14-ai-illustrate.md)   | Schematic AI image from a keyframe (video-only path). Cache on hash(base image + prompt + style). Tier 1 shipped.                                                         |
| **Compositor-lite**  | [14](../../specs/14-ai-illustrate.md)   | IKEA layout on spec 12 canonical views (no pose alignment). Tier 1 shipped.                                                                                               |
| **`regenerate` job** | [16](../../specs/16-regenerate-job.md)  | Editor prompt → `regenerate` job; scope dispatches to Instructor (`text`) or Illustrator (`illustration`/`layout`) as `guidance` — not a new agent. `structure` deferred. |

### Planned (spec 14 tier 2)

| Agent / job         | Spec                                         | Responsibility                                                    |
| ------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| **Compositor-full** | [14 tier 2](../../specs/14-ai-illustrate.md) | Per-step CAD overlay — phase 2; requires pose alignment research. |

**Not in `packages/ai`:** spec 12 `packages/cad` (deterministic STEP/mesh ingest); BOM file parser
(spec 13) follows the same pattern — engine-only, no model calls when the file is authoritative.

All AI agents run **in the engine only**, never in the web app, and every output is validated against
the `@vitruvius/core` zod schemas before it is trusted.

## Credit optimization (cross-cutting)

**Accuracy, confidence, and reliability are the constraint; credits are minimized within it, never
above it.** Optimize away _waste_ — redundant calls, over-sized models on easy steps, re-billing
identical inputs — never quality.

- **Cheapest model that clears the bar.** Reserve expensive calls for low-confidence or flagged steps.
- **One pass, not many.** Batch steps into a single structured call where the model allows it.
- **Chunk by need.** Only sub-chunk fast/ambiguous sections (spec 05).
- **Cache and reuse.** Memoize on content hash + prompt version. Learnings (spec 11) reduce repeat work.
- **Deterministic first.** Spec 12 CAD parse and spec 13 BOM reconcile before spending credits on inference.
- **Image gen discipline (spec 14).** Shared style template; batch where possible; tier-1 vs deep regen
  (grill-me prompt editing); cache `illustrationUrl` inputs.
- **Fail cheap.** Never run Instructor on segments the Segmenter already rejected.
- **Measure it.** Every agent call attributable to a manual (see `infra.md`).

## Provider-pluggable agents + bring-your-own-license (future, out of MVP scope)

> **Not in the MVP.** Captured here so the MVP doesn't paint us into a corner.

- **All model access goes through `packages/ai`.** Pipeline depends on agent _interfaces_, never a
  concrete provider.
- That seam later becomes an **agent registry** (Segmenter / Instructor / Critic / Illustrator / …).

When this graduates from "future" to "now", it gets its own spec and a `decisions.md` revision.

## The Critic — unbiased accuracy review (spec 10)

The generators are biased toward their own output; asking them to grade it is theater.

- **Input:** enriched `ManualStep[]` from the Instructor + their `sourceNotes`.
- **Job:** judge whether each **`instruction`** is supported by `sourceNotes`; lower `confidence`;
  populate `critique[]` when not. Leave well-supported steps alone.
- **Out of scope for the Critic:** BOM mismatch, illustration quality, `PartRef` ambiguity — handled
  by spec 13 deterministic flags, editor UX (spec 08), and export gate (spec 09). See decision 12.
- **Pipeline order (target):** Critic runs **after** instruct, **before** illustrate (spec 14) — still
  text-only, no re-watch of video.
- **Decoupling is the point:** the Critic never rewrites instructions or images.

## Meta-learning — the learnings store (spec 11)

Reusable heuristics (tool/part conventions, audio cues, BOM naming patterns for a product line) are
distilled from runs and **confirmed human edits**, then injected into Segmenter/Instructor prompts.

- Store _reusable heuristics_, not per-video transcripts.
- Human confirmation in the editor is the highest-quality signal.

Loop: generate → critique → human-correct → learn → generate better and cheaper.

## Related docs

- [Architecture](./architecture.md) — baseline vs target pipeline
- [Client alignment assessment](./client-alignment-assessment.md) — grill-me decisions and contract extensions
