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
		return `<figure class="reference"><img src="${esc(keyframe)}" alt="Reference frame for step ${index + 1}" /><figcaption>Reference frame — illustration pending</figcaption></figure>`;
	}
	return '';
}

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
	body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; margin: 0; padding: 2rem; }
	h1 { font-size: 1.8rem; margin: 0 0 1.5rem; }
	.step { break-inside: avoid; page-break-inside: avoid; border-top: 2px solid #eee; padding: 1.25rem 0; }
	.step header { display: flex; align-items: center; gap: 0.75rem; }
	.step .num { display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: 50%; background: #1a1a1a; color: #fff; font-weight: 600; font-size: 0.95rem; }
	.step h3 { margin: 0; font-size: 1.2rem; }
	figure { margin: 0.75rem 0; }
	figure img { max-width: 100%; border-radius: 6px; border: 1px solid #e2e2e2; }
	figure.reference img { border-style: dashed; border-color: #c9c9c9; filter: grayscale(0.15); }
	figure.reference figcaption { margin-top: 0.35rem; font-size: 0.8rem; color: #888; font-style: italic; }
	.instruction { font-size: 1rem; line-height: 1.5; }
	.meta h4 { margin: 0.75rem 0 0.25rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #666; }
	.meta ul { margin: 0; padding-left: 1.2rem; }
	@page { margin: 1.5cm; }
</style>
</head>
<body>
<h1>${esc(manual.title)}</h1>
${body}
</body>
</html>`;
}
