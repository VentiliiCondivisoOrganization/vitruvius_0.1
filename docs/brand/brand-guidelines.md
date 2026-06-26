# Vitruvius — Brand Guidelines

> _Firmitas, utilitas, venustas_ — solidity, utility, beauty.
> The three virtues Vitruvius demanded of every structure, and the bar we hold for every manual.

This is the source of truth for the Vitruvius identity. Assets live in
[`apps/web/src/lib/assets/brand/`](../../apps/web/src/lib/assets/brand) (SVG masters) and
[`apps/web/static/`](../../apps/web/static) (generated favicons, app icons, OG image).
The raster assets are regenerated from the SVG/HTML sources by
[`scripts/brand/render-brand-assets.mjs`](../../scripts/brand/render-brand-assets.mjs).

---

## 1. The idea

Vitruvius turns a **video of an assembly** into an **editable, step-by-step manual** — the AI
drafts, a human perfects. The name is deliberate: **Marcus Vitruvius Pollio**, the Roman architect
who wrote _De architectura_ and inspired the **Vitruvian Man** — the figure of human proportion
measured inside a circle and a square. That is our product in one image: **the machine measures, the
human gives it judgment.**

The whole identity runs on one tension:

| Cool — _the blueprint_              | Warm — _the craft_                      |
| ----------------------------------- | --------------------------------------- |
| Deep ink navy, technical cyan       | Saffron, ochre, terracotta              |
| Grids, construction arcs, precision | Hand-drawn confidence, classical warmth |
| The AI draft                        | The human revision                      |

Cool structure, warmed by a human hand. Never one without the other.

---

## 2. The logomark — "the Compass-V"

A single bold stroke draws a **V** — for **V**itruvius, and a **funnel**: many raw video frames at
the top converge to one precise step at the bottom. It is crowned by a thin **cyan compass arc** —
the architect drawing with dividers — and pinned by a **node** at the convergence point: the moment a
human confirms the step.

It reads as a letter, a measuring instrument, and a process, at once.

```
   ◜‿◝        ← compass arc (cyan, the draft)
   \   /
    \ /
     •         ← node (the confirmed step)
```

**Construction.** Drawn on a 48×48 grid. The V is a 3-point stroke `(11,13) → (24,38) → (37,13)`,
weight ~5.4, round caps/joins, filled with the Saffron→Terracotta gradient. The arc spans the tips
with a shallow rise; the node sits on the vertex.

**Variants** (in `apps/web/src/lib/assets/brand/`):

| File                             | Use                                    |
| -------------------------------- | -------------------------------------- |
| `logomark.svg`                   | Symbol on dark surfaces                |
| `logomark-light.svg`             | Symbol on light/vellum surfaces        |
| `logomark-mono-white.svg`        | One-colour on photos / dark            |
| `logomark-mono-ink.svg`          | One-colour on light                    |
| `logo-tile.svg`                  | App-icon master (mark on the ink tile) |
| `logo-horizontal.svg` / `-light` | Primary lockup — mark + wordmark       |
| `logo-stacked.svg`               | Stacked lockup with tagline            |
| `wordmark.svg`                   | Wordmark alone (`currentColor`)        |

In the app, prefer the **`Logo.svelte`** component
([`apps/web/src/lib/components/Logo.svelte`](../../apps/web/src/lib/components/Logo.svelte)) —
`variant="lockup" | "mark" | "stacked"`, `size`, `tone="vellum" | "ink"`.

**Clear space & minimum size.** Keep clear space of at least the height of the node's diameter on all
sides. Minimum: 16px for the symbol, 96px wide for the horizontal lockup.

**Don't:** recolour the V outside the brand gradient · stretch or rotate the mark · add shadows or
outlines · place the dark mark on a busy/low-contrast photo (use the mono-white variant) · re-typeset
the wordmark in a different face.

---

## 3. Colour

The interactive accent ramp in the app (`indigo-*`, which the codebase already reaches for) is
**remapped** to the Saffron→Terracotta scale in
[`apps/web/src/app.css`](../../apps/web/src/app.css), so the whole product recolours on-brand. Brand
colours are also exposed directly as `--color-brand-*` (e.g. `bg-brand-ink`, `text-brand-cyan`).

### Core

| Token              | Hex       | Role                             |
| ------------------ | --------- | -------------------------------- |
| `brand-ink`        | `#0A0F1E` | Page base — blueprint near-black |
| `brand-ink-2`      | `#0E1730` | Raised surface / icon tile       |
| `brand-navy`       | `#142142` | Hairline borders, line work      |
| `brand-line`       | `#1C2C4D` | Blueprint grid / dividers        |
| `brand-vellum`     | `#F4EEE1` | Warm paper / light surface       |
| `brand-vellum-ink` | `#16203A` | Text on vellum                   |

### Accent — Saffron → Terracotta

| Token         | Hex       | Role                                       |
| ------------- | --------- | ------------------------------------------ |
| `brand-gold`  | `#F4CC7C` | Highlight tip of the mark, bright accents  |
| `brand-ochre` | `#E6982F` | **Signature colour** — links, focus, the V |
| `brand-rust`  | `#BC5326` | Deep warm — solid fills, gradient end      |
| `brand-cyan`  | `#5BC4DE` | Technical accent — the compass arc only    |

**Contrast.** On the ink base, gold/ochre text clears AA comfortably. Solid action buttons use the
darker ramp steps (`indigo-600/700` → rust) so **white text stays AA**. Cyan is a _technical accent_
(arcs, ticks, small marks) — never body text, never a button fill.

---

## 4. Typography

A clean geometric sans (**Geist**/**Inter** preferred, gracefully degrading to the system UI stack —
see `--font-sans`/`--font-display` in `app.css`). The personality comes from **weight and tracking**,
not a novelty face.

- **Wordmark / display:** weight 800, all-caps, tracking `0.12em`. Monumental, inscriptional.
- **Headings:** weight 800–900, tight tracking (`-0.01em`), often a white→slate gradient on dark.
- **Eyebrows / kickers:** 11–12px, uppercase, tracking `0.18em`, muted.
- **Body:** weight 400–500, comfortable line-height.

**Roman footnote.** The Romans cut **U as V** in stone — _VITRVVIVS_. We don't set the product name
that way, but it's the spirit behind the wide, carved wordmark, and a nod we're allowed to enjoy.

---

## 5. Motifs

- **Blueprint grid** — faint 48px cyan grid, radially masked, behind hero/social surfaces.
- **Construction arcs** — thin concentric circle/arc fragments, like compass marks off-canvas.
- **The node** — the cyan dot. A recurring "confirmed / measured" punctuation mark.
- **Gradient rule** — a short Saffron→Terracotta bar under a title (see the exported PDF).

Use them sparingly and low-contrast. They are texture, not subject.

---

## 6. Voice

Confident, precise, quietly classical — an engineer who respects the reader's time.

- **Say:** "AI drafts it, you perfect it." · "From assembly video to a manual you can trust." ·
  "Drafted, measured, yours."
- **Tagline:** _AI-drafted · human-perfected._
- **Avoid:** hype ("revolutionary AI!"), or implying the output is finished without human review —
  the honesty about the human-in-the-loop _is_ the brand.

---

## 7. Regenerating assets

```bash
node scripts/brand/render-brand-assets.mjs
```

Renders favicons (16/32), `apple-touch-icon` (180), PWA icons (192/512 + maskable), and the
`og-image` (1200×630) from the committed SVG/HTML sources, by driving the Playwright Chromium over
the DevTools Protocol — no extra dependency. Override the browser with `CHROMIUM=/path/to/chrome`.
Edit the masters (`logo-tile.svg`, `scripts/brand/og-card.html`, `scripts/brand/icon-maskable.svg`),
then re-run.
