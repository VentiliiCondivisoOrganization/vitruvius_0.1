import { manualStepSchema } from '@vitruvius/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	clearSegmentCache,
	resetSegmentProviderFactory,
	segmentVideoIntoSteps,
	setSegmentProviderFactory
} from './index.js';
import { HeuristicSegmentProvider } from './providers/segment-provider.js';
import type { SegmentInput } from './segment/types.js';

const baseInput: SegmentInput = {
	videoUrl: 'https://example.test/manuals/abc/source.mp4',
	videoDurationMs: 9000,
	keyframes: [
		{ atMs: 0, fileRef: '/tmp/frame_0001.jpg' },
		{ atMs: 3000, fileRef: '/tmp/frame_0002.jpg' },
		{ atMs: 6000, fileRef: '/tmp/frame_0003.jpg' }
	],
	scenes: [
		{ startMs: 0, endMs: 3000 },
		{ startMs: 3000, endMs: 6000 },
		{ startMs: 6000, endMs: 9000 }
	],
	clips: [],
	audio: null,
	learnings: ['narrator says "click" when a clip seats']
};

describe('segmentVideoIntoSteps', () => {
	beforeEach(() => {
		clearSegmentCache();
		setSegmentProviderFactory(() => new HeuristicSegmentProvider());
	});

	afterEach(() => {
		resetSegmentProviderFactory();
		clearSegmentCache();
	});

	it('returns schema-valid steps for sample media context', async () => {
		const steps = await segmentVideoIntoSteps(baseInput, (ref) => `file://${ref}`);

		expect(steps.length).toBeGreaterThanOrEqual(1);
		for (const step of steps) {
			expect(() => manualStepSchema.parse(step)).not.toThrow();
			expect(step.instruction).toBe('');
			expect(step.reviewStatus).toBe('hypothesis');
			expect(step.sourceNotes.length).toBeGreaterThan(0);
			expect(step.confidence).toBeGreaterThanOrEqual(0);
			expect(step.confidence).toBeLessThanOrEqual(1);
		}
	});

	it('assigns keyframe URLs from the nearest still in each step window', async () => {
		const steps = await segmentVideoIntoSteps(baseInput, (ref) => `file://${ref}`);
		expect(steps[0]?.keyframeUrl).toBe('file:///tmp/frame_0001.jpg');
	});

	it('uses cache on identical input (provider called once)', async () => {
		let calls = 0;
		setSegmentProviderFactory(() => ({
			name: 'counting',
			segmentWindow: async () => {
				calls += 1;
				return [
					{
						order: 0,
						startMs: 0,
						endMs: 9000,
						confidence: 0.7,
						sourceNotes: ['single pass']
					}
				];
			}
		}));

		await segmentVideoIntoSteps(baseInput);
		await segmentVideoIntoSteps(baseInput);
		expect(calls).toBe(1);
	});
});
