import { formatPartRef, type InstructionManual, type ManualStep } from '@vitruvius/core';

// Minimal HTML escape for text interpolated into the template. Covers the five
// characters that matter in element/attribute contexts; the output is a standalone
// document, not user-editable, so this is sufficient.
function esc(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderList(title: string, items: string[]): string {
	const clean = items.map((i) => i.trim()).filter(Boolean);
	if (clean.length === 0) return '';
	const lis = clean.map((i) => `<li>${esc(i)}</li>`).join('');
	return `<div class="meta"><h4>${esc(title)}</h4><ul>${lis}</ul></div>`;
}

function renderFigure(step: ManualStep, index: number): string {
	// Spec 09 phase-1 target: the schematic illustration is the only primary image.
	const illustration = step.illustrationUrl.trim();
	if (illustration) {
		return `<figure class="schematic"><img src="${esc(illustration)}" alt="Schematic for step ${index + 1}" /></figure>`;
	}
	// keyframeUrl is reference/debug only — never passed off as the finished schematic.
	// When no illustration exists yet (Illustrator is non-fatal), show the source frame
	// clearly marked as a reference, not as the manual's diagram.
	const keyframe = step.keyframeUrl.trim();
	if (keyframe) {
		return `<figure class="reference"><img src="${esc(keyframe)}" alt="Reference frame for step ${index + 1}" /><figcaption>Reference frame (illustration pending)</figcaption></figure>`;
	}
	return '';
}

// Vitruvius brand masthead for the printed manual. Inline SVG (no <img>) so it never
// competes with a step figure for "first image". Light-surface palette for paper.
const BRAND_MASTHEAD = `<header class="masthead">
	<span class="brand">
		<svg class="mark" viewBox="0 0 48 48" width="26" height="26" aria-hidden="true">
			<defs><linearGradient id="vt-pdf" x1="11" y1="13" x2="33" y2="38" gradientUnits="userSpaceOnUse">
				<stop offset="0" stop-color="#E6982F"/><stop offset="1" stop-color="#A8431F"/></linearGradient></defs>
			<path d="M13 12.5 A 16 16 0 0 1 35 12.5" fill="none" stroke="#1E6E86" stroke-width="2.2" stroke-linecap="round"/>
			<path d="M11 13 L24 38 L37 13" fill="none" stroke="url(#vt-pdf)" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/>
			<circle cx="24" cy="38" r="2.4" fill="#1E6E86"/>
		</svg>
		<span class="wm">VITRUVIUS</span>
	</span>
	<span class="kicker">Assembly Manual</span>
</header>`;

// Closing colophon — reinforces the positioning on the page the reader keeps.
const BRAND_COLOPHON = `<footer class="colophon">Drafted with <strong>Vitruvius</strong> &middot; AI-drafted, human-perfected.</footer>`;

function renderStep(step: ManualStep, index: number): string {
	const figure = renderFigure(step, index);

	const heading = step.title.trim() || `Step ${index + 1}`;
	// Target (phase 1): template uses caption for on-page text
	const text = step.caption.trim() || step.instruction.trim();
	const instruction = text ? `<p class="instruction">${esc(text)}</p>` : '';

	return `<section class="step">
	<header><span class="num">${index + 1}</span><h3>${esc(heading)}</h3></header>
	${figure}
	${instruction}
	${renderList('Tools', step.tools)}
	${renderList('Parts', step.parts.map(formatPartRef))}
	${renderList('Warnings', step.warnings)}
</section>`;
}

/**
 * Render a `ready` manual as a standalone, self-contained HTML document (spec 09).
 * The schematic illustration leads each step (`illustrationUrl` + `caption`); the source
 * keyframe is shown only as a clearly marked reference when no illustration exists yet.
 * Pure and deterministic — the engine prints this to PDF with Playwright; the web app can
 * also serve it directly.
 */
export function renderManualHtml(manual: InstructionManual): string {
	const steps = [...manual.steps].sort((a, b) => a.order - b.order);
	const body = steps.map(renderStep).join('\n');

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(manual.title)}</title>
<style>
	* { box-sizing: border-box; }
	body { font-family: "Geist", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #16203a; margin: 0; padding: 2rem; }
	.masthead { display: flex; align-items: center; justify-content: space-between; padding-bottom: 0.85rem; margin-bottom: 1.5rem; border-bottom: 1px solid #e3ddcf; }
	.masthead .brand { display: inline-flex; align-items: center; gap: 0.5rem; }
	.masthead .mark { display: block; }
	.masthead .wm { font-weight: 800; letter-spacing: 0.12em; font-size: 1.05rem; color: #16203a; }
	.masthead .kicker { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: #9a8b6f; }
	h1 { font-size: 1.8rem; margin: 0 0 0.4rem; letter-spacing: -0.01em; }
	h1 + .rule { width: 2.5rem; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #e6982f, #bc5326); margin: 0 0 1.5rem; }
	.step { break-inside: avoid; page-break-inside: avoid; border-top: 1px solid #ece6da; padding: 1.25rem 0; }
	.step header { display: flex; align-items: center; gap: 0.75rem; }
	.step .num { display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: 50%; background: #16203a; color: #fff; font-weight: 700; font-size: 0.95rem; }
	.step h3 { margin: 0; font-size: 1.2rem; }
	figure { margin: 0.75rem 0; }
	figure img { max-width: 100%; border-radius: 6px; border: 1px solid #e2e2e2; }
	figure.reference img { border-style: dashed; border-color: #c9c9c9; filter: grayscale(0.15); }
	figure.reference figcaption { margin-top: 0.35rem; font-size: 0.8rem; color: #888; font-style: italic; }
	.instruction { font-size: 1rem; line-height: 1.5; }
	.meta h4 { margin: 0.75rem 0 0.25rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #6b6452; }
	.meta ul { margin: 0; padding-left: 1.2rem; }
	.colophon { margin-top: 2rem; padding-top: 0.85rem; border-top: 1px solid #e3ddcf; font-size: 0.78rem; color: #9a8b6f; text-align: center; }
	.colophon strong { color: #16203a; font-weight: 700; }
	@page { margin: 1.5cm; }
</style>
</head>
<body>
${BRAND_MASTHEAD}
<h1>${esc(manual.title)}</h1>
<div class="rule"></div>
${body}
${BRAND_COLOPHON}
</body>
</html>`;
}
