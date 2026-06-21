# Spec: 14-ai-illustrate

**Goal:** Produce print-ready schematic step images (`illustrationUrl`) — AI from video when no CAD, or layout on canonical CAD views when a model is present.
**Package/app(s):** `packages/ai`; extends `@vitruvius/core` (`illustrationUrl` on `ManualStep`).
**Depends on:** 01-core, 04-media, 06-ai-instructions, 12-cad-ingest (for Compositor-lite). Runs **after** spec 10 Critic.

> Design source: [client alignment assessment](../docs/ai/client-alignment-assessment.md) §5.5.
> Delivered in **two tiers** — tier 1 is phase 1; tier 2 is phase 2 (pose alignment research).

## Inputs

- Enriched, critic-reviewed `ManualStep[]` (with `keyframeUrl`, `instruction`, `caption`, `PartRef[]`).
- Media artifacts (keyframes, clips) from spec 04.
- Optional `DigitalModel.canonicalViewRefs` from spec 12.
- Env: model API key(s) via `packages/ai` only.

## Outputs

- Same steps with `illustrationUrl` set — primary image for export (spec 09), distinct from `keyframeUrl` evidence.

## In scope — tier 1 (phase 1)

- **Illustrator:** generate schematic, print-quality images from video/keyframe per step (video-only path).
- **Compositor-lite:** apply IKEA/LEGO layout (callout, arrows, part labels) on spec 12 **canonical static views** — no per-step pose alignment.
- Shared style template for visual consistency across steps.
- **Credit discipline:** cache on hash(keyframe + prompt + style version); batch where the provider allows; cheap tier vs deep regen on user request (spec 16).
- Validate outputs as file refs in Storage — never inline in the contract.

## In scope — tier 2 (phase 2)

- **Compositor-full:** per-step CAD render + AI overlay aligned to video timeline.
- Requires video↔geometry pose alignment (research — explicitly out of scope for spec 12).

## Out of scope

- Replacing spec 12 (priming / canonical views only).
- Expanding spec 12 to do per-step exploded views or pose alignment.
- Running before the Critic (spec 10) in the default pipeline.
- Image editing in the web app (regeneration goes through spec 16 job in the engine).

## Acceptance criteria

- Video-only fixture: every step has an `illustrationUrl` suitable for PDF export (tier 1 Illustrator).
- CAD + video fixture: steps use Compositor-lite on canonical views when `digitalModelStatus: primed`.
- Identical inputs hit cache — no duplicate billing for the same step illustration.
- `keyframeUrl` remains available as source evidence after illustration.

## Validation

- `pnpm --filter @vitruvius/core typecheck` (contract addition)
- `pnpm --filter @vitruvius/ai typecheck`
- `pnpm --filter @vitruvius/ai lint`
- `pnpm --filter @vitruvius/ai test` (fixture steps gain valid `illustrationUrl` refs)
