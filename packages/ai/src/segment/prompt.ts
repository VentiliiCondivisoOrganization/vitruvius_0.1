import type { SegmentWindow } from './types.js';
import { SEGMENT_PROMPT_VERSION } from './cache.js';

export function buildSegmentPrompt(
	window: SegmentWindow,
	videoDurationMs: number,
	learnings: string[]
): { system: string; user: string } {
	const learningsBlock =
		learnings.length > 0
			? `\nPrior learnings (reusable heuristics — apply when relevant):\n${learnings.map((l) => `- ${l}`).join('\n')}\n`
			: '';

	const sceneLines = window.scenes
		.map((s) => `- ${s.startMs}ms → ${s.endMs}ms`)
		.join('\n');

	const keyframeLines = window.keyframes
		.map((kf) => `- still at ${kf.atMs}ms (${kf.fileRef})`)
		.join('\n');

	const system = `You are the Segmenter agent for Vitruvius — an IKEA-style assembly manual generator.
Split the assembly video into ordered montage steps for a human reviewer.

Rules:
- Video timeline is the source of truth for step order and boundaries (video-first segmentation).
- Each step must have startMs/endMs within the analysis window, non-overlapping, covering the window.
- sourceNotes must cite concrete evidence: timestamps, visible actions, scene cuts, or audio cues.
- confidence is 0..1 — lower when the action boundary is ambiguous.
- Do NOT write full instructions, tool lists, or part names — only time bounds and evidence.
- Return JSON only, matching the schema: { "steps": [{ order, startMs, endMs, confidence, sourceNotes, label? }] }
- startMs and endMs are absolute milliseconds from the start of the full video (t=0), not relative to the window.
Prompt version: ${SEGMENT_PROMPT_VERSION}`;

	const user = `Analyze this assembly segment and return ordered steps.

Full video duration: ${videoDurationMs}ms
Analysis window: ${window.startMs}ms → ${window.endMs}ms
${learningsBlock}
Detected scene boundaries in window:
${sceneLines || '- (none — treat as continuous action)'}

Candidate keyframes attached (still images at timestamps):
${keyframeLines || '- (none)'}

Return steps that partition the window into distinct assembly actions.`;

	return { system, user };
}
