import { describe, expect, it } from 'vitest';
import { GeminiSegmentProvider } from './segment-provider.js';

describe('GeminiSegmentProvider', () => {
	it('parses a structured JSON response from the Gemini API', async () => {
		const mockFetch: typeof fetch = async () =>
			({
				ok: true,
				status: 200,
				statusText: 'OK',
				json: async () => ({
					candidates: [
						{
							content: {
								parts: [
									{
										text: JSON.stringify({
											steps: [
												{
													order: 0,
													startMs: 0,
													endMs: 4000,
													confidence: 0.82,
													sourceNotes: ['hand places base plate at 0ms'],
													label: 'Place base'
												},
												{
													order: 1,
													startMs: 4000,
													endMs: 9000,
													confidence: 0.45,
													sourceNotes: ['fastener motion blurred between 4–6s']
												}
											]
										})
									}
								]
							}
						}
					]
				})
			}) as Response;

		const provider = new GeminiSegmentProvider({
			apiKey: 'test-key',
			model: 'gemini-2.0-flash',
			fetchFn: mockFetch
		});

		const steps = await provider.segmentWindow(
			{
				startMs: 0,
				endMs: 9000,
				keyframes: [],
				scenes: [
					{ startMs: 0, endMs: 4000 },
					{ startMs: 4000, endMs: 9000 }
				]
			},
			{ videoDurationMs: 9000, learnings: [] }
		);

		expect(steps).toHaveLength(2);
		expect(steps[1]?.confidence).toBe(0.45);
		expect(steps[1]?.sourceNotes[0]).toContain('window');
	});
});
