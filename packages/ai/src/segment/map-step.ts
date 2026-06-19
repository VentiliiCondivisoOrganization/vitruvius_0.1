import { manualStepSchema, type ManualStep } from '@vitruvius/core';
import type { Keyframe } from '@vitruvius/media';
import { randomUUID } from 'node:crypto';
import type { RawSegment } from './types.js';

export function pickKeyframeForStep(keyframes: Keyframe[], startMs: number, endMs: number): string {
	const inWindow = keyframes.filter((kf) => kf.atMs >= startMs && kf.atMs < endMs);
	const pool = inWindow.length > 0 ? inWindow : keyframes;
	if (pool.length === 0) return '';

	const mid = (startMs + endMs) / 2;
	let best = pool[0]!;
	let bestDist = Math.abs(best.atMs - mid);
	for (const kf of pool) {
		const dist = Math.abs(kf.atMs - mid);
		if (dist < bestDist) {
			best = kf;
			bestDist = dist;
		}
	}
	return best.fileRef;
}

export function rawSegmentToManualStep(
	seg: RawSegment,
	keyframes: Keyframe[],
	keyframePublicUrl: (fileRef: string) => string
): ManualStep {
	const keyframeRef = pickKeyframeForStep(keyframes, seg.startMs, seg.endMs);
	const title = seg.label?.trim() || `Step ${seg.order + 1}`;

	const step: ManualStep = {
		id: randomUUID(),
		order: seg.order,
		title,
		instruction: '',
		startMs: seg.startMs,
		endMs: seg.endMs,
		keyframeUrl: keyframeRef ? keyframePublicUrl(keyframeRef) : '',
		tools: [],
		parts: [],
		warnings: [],
		confidence: seg.confidence,
		reviewStatus: 'hypothesis',
		sourceNotes: seg.sourceNotes,
		alternatives: []
	};

	return manualStepSchema.parse(step);
}
