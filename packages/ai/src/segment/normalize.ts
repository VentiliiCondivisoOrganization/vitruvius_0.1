import type { RawSegment } from './types.js';

/** Sort, de-overlap, clamp to video bounds, and re-number segments. */
export function normalizeSegments(segments: RawSegment[], videoDurationMs: number): RawSegment[] {
	if (segments.length === 0) {
		return [
			{
				order: 0,
				startMs: 0,
				endMs: videoDurationMs,
				confidence: 0.4,
				sourceNotes: ['fallback: full video as one step']
			}
		];
	}

	const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
	const clamped: RawSegment[] = [];

	for (const seg of sorted) {
		const startMs = Math.max(0, Math.min(seg.startMs, videoDurationMs));
		const endMs = Math.max(startMs, Math.min(seg.endMs, videoDurationMs));
		if (endMs <= startMs) continue;
		clamped.push({ ...seg, startMs, endMs });
	}

	if (clamped.length === 0) {
		return [
			{
				order: 0,
				startMs: 0,
				endMs: videoDurationMs,
				confidence: 0.4,
				sourceNotes: ['fallback: full video as one step']
			}
		];
	}

	// Resolve overlaps: earlier step wins; trim the later start.
	const merged: RawSegment[] = [];
	for (const seg of clamped) {
		const prev = merged.at(-1);
		if (prev && seg.startMs < prev.endMs) {
			merged.push({ ...seg, startMs: prev.endMs });
		} else {
			merged.push(seg);
		}
	}

	// Ensure coverage from 0 → duration.
	if (merged[0]!.startMs > 0) {
		merged.unshift({
			...merged[0]!,
			startMs: 0,
			order: 0,
			sourceNotes: [
				'inferred start: video opening before first detected action',
				...merged[0]!.sourceNotes
			]
		});
	}

	const last = merged.at(-1)!;
	if (last.endMs < videoDurationMs) {
		merged.push({
			order: merged.length,
			startMs: last.endMs,
			endMs: videoDurationMs,
			confidence: Math.min(last.confidence, 0.5),
			sourceNotes: ['inferred tail: video continues after last detected action']
		});
	}

	return merged.map((seg, index) => ({ ...seg, order: index }));
}
