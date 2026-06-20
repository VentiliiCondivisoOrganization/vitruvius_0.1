import type { ManualStep } from '@vitruvius/core';
import { INSTRUCT_PROMPT_VERSION } from './cache.js';

export function buildInstructPrompt(
	steps: ManualStep[],
	learnings: string[]
): { system: string; user: string } {
	const learningsBlock =
		learnings.length > 0
			? `\nPrior learnings (reusable heuristics — apply when relevant):\n${learnings.map((l) => `- ${l}`).join('\n')}\n`
			: '';

	const stepLines = steps
		.map((step) => {
			const notes = step.sourceNotes.map((n) => `    - ${n}`).join('\n');
			return `Step order=${step.order} (${step.startMs}ms → ${step.endMs}ms), current title: "${step.title}"
  sourceNotes:
${notes || '    - (none)'}`;
		})
		.join('\n\n');

	const system = `You are the Instruction Writer agent for Vitruvius — an IKEA-style assembly manual generator.
For each segmented step you are given, write operative instructions a human can follow.

Rules:
- Fill these fields per step: title (short imperative), instruction (one clear action), tools, parts, warnings, alternatives.
- Ground EVERY field in evidence: the step's sourceNotes and the attached keyframe images for that time range.
- If a field is grounded in a keyframe rather than an existing sourceNote, add a short note to addedSourceNotes
  citing that visual evidence (e.g. "hex key visible in keyframe at 4200ms"). Never invent facts you cannot see.
- Do NOT change step order, time bounds, or confidence — only the operative fields.
- Leave tools/parts/warnings/alternatives as empty arrays when there is no evidence for them; do not pad.
- Return JSON only, matching: { "steps": [{ order, title, instruction, tools, parts, warnings, alternatives, addedSourceNotes? }] }
- Return exactly one entry per input step, keyed by the same order value.
Prompt version: ${INSTRUCT_PROMPT_VERSION}`;

	const user = `Write instructions for these ${steps.length} segmented step(s).
Keyframe stills for the steps are attached in time order.
${learningsBlock}
Steps:
${stepLines}

Return one enriched entry per step, matching each by its order value.`;

	return { system, user };
}
