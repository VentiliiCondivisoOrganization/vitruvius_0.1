import type { PartRef } from './types.js';

/** Empty part row for editor / pipeline defaults. */
export function emptyPartRef(): PartRef {
	return { bomItemId: null, label: '', confidence: 1 };
}

/** Build a generic (unmapped) part reference from a human-readable label. */
export function partRefFromLabel(label: string, confidence = 1): PartRef {
	return { bomItemId: null, label: label.trim(), confidence };
}

/** Convert legacy string labels (AI provider output, migrations) to `PartRef[]`. */
export function partRefsFromLabels(labels: string[]): PartRef[] {
	return labels.map((label) => partRefFromLabel(label)).filter((ref) => ref.label.length > 0);
}

/** Display labels for prompts and string-list UIs. */
export function partRefLabels(parts: PartRef[]): string[] {
	return parts.map((part) => part.label.trim()).filter(Boolean);
}

/** One-line label for export templates — includes BOM code when present. */
export function formatPartRef(part: PartRef): string {
	const code = part.bomCode?.trim();
	const label = part.label.trim();
	if (code && label) return `${code} — ${label}`;
	return code || label;
}

/** True when disambiguation is still required before export (spec 08 / 09 gate). */
export function partRefHasOpenCandidates(part: PartRef): boolean {
	return (part.candidateBomItemIds?.length ?? 0) > 0;
}
