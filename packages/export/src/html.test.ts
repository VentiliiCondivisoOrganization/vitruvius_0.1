import { partRefFromLabel, type InstructionManual, type ManualStep } from '@vitruvius/core';
import { describe, expect, it } from 'vitest';
import { renderManualHtml } from './html.js';

function step(overrides: Partial<ManualStep> = {}): ManualStep {
	return {
		id: crypto.randomUUID(),
		order: 0,
		title: 'Attach leg A',
		instruction: 'Screw leg A into the corner socket.',
		startMs: 0,
		endMs: 3000,
		keyframeUrl: 'https://example.test/frames/a.jpg',
		tools: ['screwdriver'],
		parts: [partRefFromLabel('leg A')],
		warnings: ['Do not overtighten'],
		confidence: 0.8,
		reviewStatus: 'hypothesis',
		sourceNotes: ['narrator: attach leg A'],
		alternatives: [],
		critique: [],
		caption: '',
		illustrationUrl: '',
		...overrides
	};
}

function manual(steps: ManualStep[], title = 'Test Manual'): InstructionManual {
	const now = '2026-06-20T00:00:00.000Z';
	return {
		id: '11111111-1111-1111-1111-111111111111',
		title,
		videoUrl: 'videos/x/source.mp4',
		bomFileUrl: '',
		digitalModelUrl: '',
		status: 'ready',
		steps,
		bom: [],
		version: 1,
		parentVersionId: null,
		createdAt: now,
		updatedAt: now
	};
}

describe('renderManualHtml', () => {
	it('produces a standalone HTML document with the title', () => {
		const html = renderManualHtml(manual([step()]));
		expect(html.startsWith('<!doctype html>')).toBe(true);
		expect(html).toContain('<title>Test Manual</title>');
		expect(html).toContain('<h1>Test Manual</h1>');
	});

	it('renders the image before the instruction', () => {
		const html = renderManualHtml(manual([step()]));
		const imgIdx = html.indexOf('<img');
		const instrIdx = html.indexOf('Screw leg A');
		expect(imgIdx).toBeGreaterThan(-1);
		expect(imgIdx).toBeLessThan(instrIdx);
	});

	it('marks a keyframe-only step as a reference frame, not a schematic', () => {
		const html = renderManualHtml(
			manual([step({ keyframeUrl: 'https://example.test/frame.jpg', illustrationUrl: '' })])
		);
		expect(html).toContain('src="https://example.test/frame.jpg"');
		expect(html).toContain('class="reference"');
		expect(html).toContain('illustration pending');
		expect(html).not.toContain('class="schematic"');
	});

	it('renders an illustrated step as a schematic without the reference marker', () => {
		const html = renderManualHtml(
			manual([
				step({
					keyframeUrl: 'https://example.test/frame.jpg',
					illustrationUrl: 'https://example.test/illustration.png'
				})
			])
		);
		expect(html).toContain('class="schematic"');
		expect(html).not.toContain('class="reference"');
		expect(html).not.toContain('illustration pending');
	});

	it('orders steps by their order field', () => {
		const html = renderManualHtml(
			manual([
				step({ order: 1, title: 'Second', keyframeUrl: '' }),
				step({ order: 0, title: 'First', keyframeUrl: '' })
			])
		);
		expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
	});

	it('escapes HTML in user content', () => {
		const html = renderManualHtml(manual([step({ title: '<script>x</script>', keyframeUrl: '' })]));
		expect(html).not.toContain('<script>x</script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('omits empty meta sections', () => {
		const html = renderManualHtml(
			manual([step({ tools: [], parts: [], warnings: [], keyframeUrl: '' })])
		);
		expect(html).not.toContain('<h4>Tools</h4>');
		expect(html).not.toContain('<h4>Warnings</h4>');
	});

	it('prefers illustrationUrl over keyframeUrl', () => {
		const html = renderManualHtml(
			manual([
				step({
					keyframeUrl: 'https://example.test/frame.jpg',
					illustrationUrl: 'https://example.test/illustration.png'
				})
			])
		);
		expect(html).toContain('src="https://example.test/illustration.png"');
		expect(html).not.toContain('src="https://example.test/frame.jpg"');
	});

	it('prefers caption over instruction', () => {
		const html = renderManualHtml(
			manual([step({ instruction: 'Base instruction', caption: 'Custom caption' })])
		);
		expect(html).toContain('Custom caption');
		expect(html).not.toContain('Base instruction');
	});
});
