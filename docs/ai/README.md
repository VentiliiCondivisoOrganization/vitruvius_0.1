# docs/ai — agent knowledge base

Deeper docs for any agent (or human) working in Vitruvius. [`AGENTS.md`](../../AGENTS.md)
at the repo root is the entry point and stays short on purpose; everything it points
to lives here.

| If you're about to…                                              | Read                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| Understand how the system fits together                          | [architecture.md](architecture.md)                               |
| Touch the AI pipeline (agents, credit budget, Critic, learnings) | [ai-layer.md](ai-layer.md)                                       |
| Set things up or run them locally (env vars, services)           | [infra.md](infra.md)                                             |
| Know _why_ something is the way it is                            | [decisions.md](decisions.md)                                     |
| Check client request vs product design (alignment assessment)    | [client-alignment-assessment.md](client-alignment-assessment.md) |
| See what is implemented vs spec-only                             | [implementation-progress.md](implementation-progress.md)         |
| Session notes (decisions + PR context)                           | [session-notes/](session-notes/)                                 |
| Know who owns which lane (Antonio, Giovanni, Stefano)            | [team-organization.md](team-organization.md)                     |
| Open a PR — title, body, CI, formatting                          | [pr-and-ci.md](pr-and-ci.md)                                     |
| Implement an assigned task                                       | the matching spec in [`specs/`](../../specs/)                    |

## Spec map

| Range                 | Role                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **01–12**             | Baseline vertical slices — bootstrap through CAD priming (see [implementation-progress.md](implementation-progress.md))             |
| **13, 14, 16, 17**    | Client-alignment extensions — BOM layer, illustrate, regenerate job, versioning ([assessment §5.3](client-alignment-assessment.md)) |
| **08, 09** (extended) | Disambiguation BOM + schematic export absorbed here — no separate spec 15/18                                                        |

Pipeline target (phase 1): [architecture.md § Pipeline](architecture.md#pipeline-baseline-vs-target).
