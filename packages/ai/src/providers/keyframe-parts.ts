import type { Keyframe } from '@vitruvius/media';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

/** A single content part in a Gemini `generateContent` request. */
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Down-sample keyframes to at most `max` evenly-spaced stills to bound credits per call. */
export function pickKeyframesForCall(keyframes: Keyframe[], max: number): Keyframe[] {
	if (keyframes.length <= max) return keyframes;
	const stride = Math.ceil(keyframes.length / max);
	return keyframes.filter((_, i) => i % stride === 0).slice(0, max);
}

/** Load keyframe stills as inline image parts, each followed by a timestamp label. */
export async function loadKeyframeParts(keyframes: Keyframe[]): Promise<GeminiPart[]> {
	const parts: GeminiPart[] = [];
	for (const kf of keyframes) {
		try {
			const bytes = await readFile(kf.fileRef);
			parts.push({
				inlineData: {
					mimeType: mimeFromPath(kf.fileRef),
					data: bytes.toString('base64')
				}
			});
			parts.push({ text: `Keyframe at ${kf.atMs}ms (${basename(kf.fileRef)})` });
		} catch {
			parts.push({ text: `(keyframe unavailable at ${kf.atMs}ms: ${kf.fileRef})` });
		}
	}
	return parts;
}

export function mimeFromPath(path: string): string {
	// Strip a file:// prefix and any query string / fragment (e.g. signed-URL params)
	// so the extension is read from the real filename, not "...png?X-Amz-Signature=...".
	const withoutScheme = path.startsWith('file://') ? path.slice('file://'.length) : path;
	const cleaned = withoutScheme.split(/[?#]/)[0] ?? withoutScheme;
	const ext = cleaned.split('.').pop()?.toLowerCase();
	if (ext === 'png') return 'image/png';
	if (ext === 'webp') return 'image/webp';
	return 'image/jpeg';
}
