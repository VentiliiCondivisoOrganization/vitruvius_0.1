# The AI layer

How Vitruvius uses AI agents, how it keeps that usage cheap, how it checks its own
accuracy, and how it learns over time. This is the conceptual home for everything that lives
behind [`packages/ai`](../packages/ai). The work units are in [`specs/`](../specs) (05, 06, 10, 11);
the resolved trade-offs are in [`DECISIONS.md`](./DECISIONS.md) (8–10).

Vitruvius's positioning is _AI-generated draft + guided human revision_ — not a fully automatic
generator. Everything below serves that: spend the fewest credits to produce a draft that is honest
about its own confidence, and get better at it over time.

## The agent roster

The pipeline is a sequence of distinct **agents**, each a single responsibility behind
`packages/ai`. They are deliberately separate so they can be priced, swapped, and (later) configured
independently.

| Agent          | Spec                                 | Responsibility                                                                                                    |
| -------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Segmenter**  | [05](../specs/05-ai-segment.md)      | Split the video into ordered steps with time bounds, `confidence`, `sourceNotes`.                                 |
| **Instructor** | [06](../specs/06-ai-instructions.md) | Fill operative fields per step (title, instruction, tools, parts, warnings, alternatives).                        |
| **Critic**     | [10](../specs/10-ai-critic.md)       | Independently review the draft for accuracy; adjust `confidence`, flag weak steps. Decoupled from the generators. |
| **Learnings**  | [11](../specs/11-learnings.md)       | Capture reusable domain knowledge from a run and feed it back into future runs.                                   |

All agents run **in the engine only**, never in the web app, and every output is validated against
the `@vitruvius/core` zod schemas before it is trusted.

## Credit optimization (cross-cutting)

AI calls are the dominant variable cost. Treat **credits as a first-class budget**, not an
afterthought — in every spec, every prompt, every loop.

- **Cheapest model that clears the bar.** Don't default to the largest model. Reserve expensive
  calls (e.g. fine-grained re-segmentation) for sections the cheap pass flagged as low-confidence.
- **One pass, not many.** Batch steps into a single call where the model allows it; avoid per-step
  round-trips when a single structured call returns the whole array.
- **Chunk by need.** Only sub-chunk fast/ambiguous sections (spec 05); don't re-feed the whole video
  at high resolution when a keyframe sample suffices.
- **Cache and reuse.** Identical inputs must not be re-billed. Memoize on a content hash of the
  media artifact + prompt version. The **Learnings store** (spec 11) is part of this: priming a run
  with known heuristics shrinks the work the model has to do from scratch.
- **Fail cheap.** Validate inexpensively before spending on the expensive stage; never run the
  Instructor on segments the Segmenter already rejected.
- **Measure it.** Every agent call should be attributable to a manual so credit spend per manual is
  observable (see `INFRA.md`). You can't optimize what you don't count.

## Provider-pluggable agents + bring-your-own-license (future, out of MVP scope)

> **Not in the MVP.** Captured here so the MVP doesn't paint us into a corner. The MVP ships a single
> hosted provider (Gemini) under our own key.

The end-state: a company can spin up Vitruvius in their own environment and **choose which agents to
use and attach their own license/keys**. To keep that future cheap, the MVP must obey one rule now:

- **All model access goes through `packages/ai`.** No SDK import, model name, or API key leaks into
  the engine pipeline, the web app, or any other package. The pipeline depends on the _agent
  interfaces_ (`segment`, `writeInstructions`, `critique`), never on a concrete provider.
- That single seam is what later becomes an **agent registry**: a config that maps each role
  (Segmenter / Instructor / Critic) to a provider + model + credential, resolved at engine startup.
  Self-hosters swap the registry; nothing upstream changes.

When this graduates from "future" to "now", it gets its own spec and a `DECISIONS.md` revision.

## The Critic — unbiased accuracy review (spec 10)

The generators are biased toward their own output; asking them to grade it is theater. So accuracy
review is a **separate agent with a separate prompt and (optionally) a different/cheaper model**,
whose only job is to be an honest skeptic — in the spirit of a `/grill-me` reviewer: relentless and
unbiased, but **not wasting effort on pointless nitpicks**.

- **Input:** the enriched `ManualStep[]` from the Instructor + their `sourceNotes`.
- **Job:** for each step, judge whether the instruction is actually supported by its source evidence.
  Lower `confidence` where it isn't; raise a concrete flag (what's unsupported, what's missing) the
  editor can act on. Leave well-supported steps alone — no busywork.
- **Decoupling is the point:** the Critic must not rewrite instructions (that's the Instructor's
  job). It only _scores and flags_. This keeps the human editor's trust signal (`confidence` +
  flags) independent of the thing that produced the draft.
- **Credit-aware:** the Critic is a cheap, structured pass over text the generators already produced
  — it does not re-watch the video. Escalate to an expensive re-pass only for steps it flags.

The Critic's output sharpens the `confidence` and `sourceNotes` the editor already surfaces (spec
08); no new UI is strictly required for the MVP.

## Meta-learning — the learnings store (spec 11)

If a run discovers something useful for the product's **core scope** (recognizing assembly steps,
tools, parts, common warnings), that knowledge should be **persisted and reused**, not relearned
from zero every time.

- **Write:** at the end of a run (or from confirmed human edits in the editor), distill durable,
  generalizable facts — e.g. "this product line uses hex bolts", "the narrator says _click_ when a
  clip seats" — into the learnings store. Store _reusable heuristics_, not per-video transcripts.
- **Read:** prime future runs by injecting relevant learnings into the Segmenter/Instructor prompts.
  This both improves accuracy and **cuts credits** (the model reasons less from scratch).
- **Scope guard:** only capture knowledge that serves the core scope. Don't hoard noise; a learning
  must be reusable across manuals to earn its place.
- **Human-in-the-loop is the best signal:** an editor _confirming_ or _correcting_ a step is
  ground-truth feedback — the highest-quality source of learnings.

This closes the loop: generate → critique → human-correct → learn → generate better and cheaper.
