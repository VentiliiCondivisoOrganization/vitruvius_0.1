import { partRefLabels, type ManualStep } from '@vitruvius/core';
import { CRITIQUE_PROMPT_VERSION } from './cache.js';

export function buildCritiquePrompt(
	steps: ManualStep[],
	learnings: string[]
): { system: string; user: string } {
	const learningsBlock =
		learnings.length > 0
			? `\nKnown domain conventions (apply when judging support):\n${learnings.map((l) => `- ${l}`).join('\n')}\n`
			: '';

	const stepLines = steps
		.map((step) => {
			const notes = step.sourceNotes.map((n) => `    - ${n}`).join('\n');
			const lists = [
				step.tools.length ? `tools: ${step.tools.join(', ')}` : '',
				step.parts.length ? `parts: ${partRefLabels(step.parts).join(', ')}` : '',
				step.warnings.length ? `warnings: ${step.warnings.join(', ')}` : ''
			]
				.filter(Boolean)
				.map((l) => `  ${l}`)
				.join('\n');

			return `Step order=${step.order} (confidence ${step.confidence})
  title: "${step.title}"
  instruction: "${step.instruction}"
${lists ? `${lists}\n` : ''}  sourceNotes:
${notes || '    - (none)'}`;
		})
		.join('\n\n');

	const system = `You are the Critic agent for Vitruvius — an IKEA-style assembly manual generator.
You are independent from the agents that wrote these steps: review them like a relentless, unbiased
reviewer. You do NOT re-watch the video; judge only from each step's stated sourceNotes and fields.

Rules:
- For each step, decide whether its instruction (and any tools/parts/warnings) is actually supported
  by that step's sourceNotes. A claim with no backing evidence is unsupported.
- Recalibrate confidence (0..1): LOWER it where evidence is weak or missing; keep it where the step is
  well-supported. Do not raise confidence above the input value.
- Populate critique with concrete, actionable flags naming what is unsupported or missing.
  Leave critique as an empty array when the step is well-supported — do not invent busywork.
- Never rewrite the instruction, title, tools, parts, or warnings. You only score and flag.
- Return JSON only, matching: { "steps": [{ order, confidence, critique }] }
- Return exactly one entry per input step, keyed by the same order value.
Prompt version: ${CRITIQUE_PROMPT_VERSION}`;

	const user = `Review these ${steps.length} drafted step(s) for accuracy.
${learningsBlock}
Steps:
${stepLines}

Return one verdict per step, matching each by its order value.`;

	return { system, user };
}
