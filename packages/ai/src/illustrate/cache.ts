import { createHash } from 'node:crypto';
import type { IllustrationRequest } from '../providers/illustrate-types.js';
import { buildIllustratePrompt } from './prompt.js';
import { ILLUSTRATE_STYLE_VERSION } from './style.js';
import type { RawIllustration } from './types.js';

export const ILLUSTRATE_PROMPT_VERSION = 'illustrate-v1';

/**
 * Cache key for a single step's illustration — hash(base image + prompt + style version),
 * per spec 14's credit discipline. Identical inputs hit the cache and are not re-billed.
 * The base image ref stands in for its content, mirroring the instruct/critique caches.
 */
export function illustrateCacheKey(request: IllustrationRequest): string {
	const payload = JSON.stringify({
		promptVersion: ILLUSTRATE_PROMPT_VERSION,
		styleVersion: ILLUSTRATE_STYLE_VERSION,
		mode: request.mode,
		baseImageRef: request.baseImageRef,
		prompt: buildIllustratePrompt(request.step, request.mode)
	});
	return createHash('sha256').update(payload).digest('hex');
}

/** In-process memoization — identical step illustrations are not re-billed in the same run. */
const cache = new Map<string, RawIllustration>();

export function getCachedIllustration(key: string): RawIllustration | undefined {
	return cache.get(key);
}

export function setCachedIllustration(key: string, value: RawIllustration): void {
	cache.set(key, value);
}

/** Test-only: reset between test files. */
export function clearIllustrateCache(): void {
	cache.clear();
}
