import { partRefLabels, type ManualStep } from '@vitruvius/core';

export const DISTILL_PROMPT_VERSION = 'distill-v1';

export function buildDistillPrompt(
	steps: ManualStep[],
	existingLearnings: string[]
): { system: string; user: string } {
	const existingBlock =
		existingLearnings.length > 0
			? `\nAlready known (do NOT repeat these):\n${existingLearnings.map((l) => `- ${l}`).join('\n')}\n`
			: '';

	const stepLines = steps
		.map((step) => {
			const facts = [
				step.tools.length ? `tools: ${step.tools.join(', ')}` : '',
				step.parts.length ? `parts: ${partRefLabels(step.parts).join(', ')}` : '',
				step.warnings.length ? `warnings: ${step.warnings.join('; ')}` : ''
			]
				.filter(Boolean)
				.join(' | ');
			return `- ${step.title}: ${step.instruction}${facts ? ` [${facts}]` : ''}`;
		})
		.join('\n');

	const system = `You are the Learnings distiller for Vitruvius — an IKEA-style assembly manual generator.
From a finished run, extract a SHORT list of reusable, generalizable heuristics that would help future
runs of DIFFERENT videos — and reduce credits by priming the generators.

Rules:
- Keep only durable, generalizable facts: tool/part naming conventions, recurring audio cues, safety
  warnings that recur across assemblies, segmentation heuristics.
- REJECT per-video noise: anything tied to this specific video — timestamps, "the narrator said X at
  N ms", one-off part numbers, transcript lines. A transcript line is NOT a learning.
- Each learning gets a short scope tag (e.g. "tool", "warning", "audio-cue", "segmentation").
- Return JSON only: { "learnings": [{ scope, text }] }. Return an empty array if nothing generalizes.
- Prefer few high-quality learnings over many shallow ones.
Prompt version: ${DISTILL_PROMPT_VERSION}`;

	const user = `Distill reusable learnings from this finished run.
${existingBlock}
Steps:
${stepLines || '- (no steps)'}

Return only generalizable heuristics that would help a different assembly video.`;

	return { system, user };
}
