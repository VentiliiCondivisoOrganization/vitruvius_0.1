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

/**
 * Load an image (keyframe or canonical CAD view) as base64 bytes, resolving `file://`,
 * plain local paths, and `http(s)` refs. Shared by providers that need the raw image
 * either to send to a model or to reuse as a deterministic fallback illustration.
 */
export async function loadImageBase64(ref: string, fetchFn: typeof fetch = fetch): Promise<string> {
	const path = ref.startsWith('file://') ? ref.slice('file://'.length) : ref;
	if (/^https?:\/\//.test(path)) {
		const res = await fetchFn(path);
		if (!res.ok) throw new Error(`image fetch failed (${res.status}) for ${path}`);
		return Buffer.from(await res.arrayBuffer()).toString('base64');
	}
	return (await readFile(path)).toString('base64');
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
