import { describe, expect, it } from 'vitest';
import { planSubChunks } from './chunk-plan.js';

describe('planSubChunks', () => {
	it('flags low-confidence segments', () => {
		const plans = planSubChunks(
			[{ order: 0, startMs: 0, endMs: 5000, confidence: 0.4, sourceNotes: ['a'] }],
			{ lowConfidenceThreshold: 0.55, minSubChunkMs: 2500 }
		);
		expect(plans).toHaveLength(1);
		expect(plans[0]?.reason).toBe('low confidence');
	});

	it('flags short segments with middling confidence', () => {
		const plans = planSubChunks(
			[{ order: 0, startMs: 0, endMs: 1500, confidence: 0.7, sourceNotes: ['a'] }],
			{ lowConfidenceThreshold: 0.55, minSubChunkMs: 2500 }
		);
		expect(plans).toHaveLength(1);
		expect(plans[0]?.reason).toBe('short fast-action window');
	});

	it('skips confident long segments', () => {
		const plans = planSubChunks(
			[{ order: 0, startMs: 0, endMs: 8000, confidence: 0.9, sourceNotes: ['a'] }],
			{ lowConfidenceThreshold: 0.55, minSubChunkMs: 2500 }
		);
		expect(plans).toHaveLength(0);
	});
});
