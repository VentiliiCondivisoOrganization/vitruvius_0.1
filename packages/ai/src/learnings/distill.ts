import type { NewLearning } from '@vitruvius/core';
import { getLearningsProvider } from '../providers/learnings-provider.js';
import type { DistillInput, RawLearning } from './types.js';

// Per-video markers: absolute timestamps (e.g. "4200ms", "1:23"). A learning that
// carries one of these is tied to a specific video and is not generalizable.
const PER_VIDEO_NOISE = /\b\d+\s?ms\b|\b\d{1,2}:\d{2}\b/i;

/** A learning must generalize: no per-video timestamps, and substantive (not a stray word). */
export function isReusableLearning(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length < 8) return false;
	return !PER_VIDEO_NOISE.test(trimmed);
}

function normalize(text: string): string {
	return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Learnings distiller (spec 11): extract durable, generalizable heuristics from a
 * finished run, rejecting per-video noise and anything already known. Returns
 * `NewLearning[]` ready for `saveLearnings`; persistence is the caller's job.
 */
export async function distillLearnings(input: DistillInput): Promise<NewLearning[]> {
	if (input.steps.length === 0) return [];

	const existing = input.existingLearnings ?? [];
	const provider = getLearningsProvider();
	const raw: RawLearning[] = await provider.distill(input.steps, { existingLearnings: existing });

	const seen = new Set(existing.map(normalize));
	const out: NewLearning[] = [];
	for (const candidate of raw) {
		const text = candidate.text.trim();
		const scope = candidate.scope.trim();
		if (!text || !scope) continue;
		if (!isReusableLearning(text)) continue;

		const key = normalize(text);
		if (seen.has(key)) continue;
		seen.add(key);

		out.push({ scope, text, sourceManualId: input.manualId });
	}
	return out;
}
