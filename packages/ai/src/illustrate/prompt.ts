import type { ManualStep } from '@vitruvius/core';
import { ILLUSTRATE_STYLE_PROMPT, ILLUSTRATE_STYLE_VERSION } from './style.js';
import type { IllustrationMode } from './types.js';

/**
 * Build the per-step image prompt: the shared style template plus this step's action,
 * parts, and tools, and an instruction for how to treat the attached base image (a video
 * keyframe for the Illustrator path, a canonical CAD view for Compositor-lite).
 */
export function buildIllustratePrompt(step: ManualStep, mode: IllustrationMode): string {
	const partLabels = step.parts.map((p) => p.label.trim()).filter((l) => l.length > 0);
	const partsLine = partLabels.length > 0 ? `Parts in this step: ${partLabels.join(', ')}.` : '';
	const toolsLine = step.tools.length > 0 ? `Tools used: ${step.tools.join(', ')}.` : '';

	const baseImageInstruction =
		mode === 'compositor-lite'
			? 'Use the attached canonical CAD view as the geometry reference. Lay the schematic, arrows, and callouts out on top of it; do not change its camera angle or geometry.'
			: 'Use the attached video keyframe only as a reference for what is being assembled. Redraw it as a clean schematic — do not trace photographic detail.';

	return `${ILLUSTRATE_STYLE_PROMPT}

Step ${step.order + 1}: ${step.title}
Action: ${step.instruction}
${partsLine}
${toolsLine}
${baseImageInstruction}
Style version: ${ILLUSTRATE_STYLE_VERSION}`;
}
