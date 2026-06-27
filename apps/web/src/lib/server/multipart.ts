import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { isR2Configured } from '@vitruvius/db';

// Shared guards + validation for the direct browser→R2 multipart upload endpoints (spec 20).
// The video bytes go straight to R2 via presigned part URLs; these endpoints only sign parts
// and never see the bytes. R2 constraints below come from the S3 multipart contract R2 implements.

const MiB = 1024 * 1024;
/** R2 requires every part except the last to be at least 5 MiB. */
const MIN_PART_SIZE = 5 * MiB;
/** R2 allows at most 10 000 parts per multipart upload. */
const MAX_PARTS = 10_000;
/** Default part size — large enough to keep the part count (and round-trips) low for big videos. */
const DEFAULT_PART_SIZE = 64 * MiB;

/** `<uuid>/source.<ext>` — the only key shape `create` issues; enforced so a caller can't
 * sign/complete an upload to an arbitrary object path. */
const VIDEO_KEY_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/source(\.[a-z0-9]+)?$/;

export type PartPlan = { partSize: number; partCount: number };

/**
 * Pick a part size and count for a file of `size` bytes: default 64 MiB parts, growing the part
 * size only if that would exceed R2's 10 000-part ceiling, and never below R2's 5 MiB minimum.
 */
export function computePartPlan(size: number): PartPlan {
	let partSize = DEFAULT_PART_SIZE;
	if (Math.ceil(size / partSize) > MAX_PARTS) {
		// Round up to a whole MiB so parts stay well-aligned.
		partSize = Math.ceil(size / MAX_PARTS / MiB) * MiB;
	}
	if (partSize < MIN_PART_SIZE) partSize = MIN_PART_SIZE;
	const partCount = Math.max(1, Math.ceil(size / partSize));
	return { partSize, partCount };
}

/** True when `key` is a well-formed `<uuid>/source.<ext>` video key. */
export function isValidVideoKey(key: string): boolean {
	return VIDEO_KEY_RE.test(key);
}

/**
 * Gate every upload endpoint: require a signed-in user and a configured R2 backend. Returns a
 * JSON `Response` to short-circuit with, or null when the request may proceed.
 */
export function guardUpload(event: RequestEvent): Response | null {
	if (!event.locals.session?.user) return json({ error: 'unauthorized' }, { status: 401 });
	if (!isR2Configured()) return json({ error: 'direct upload unavailable' }, { status: 409 });
	return null;
}

/** Read the JSON body, or null when it is absent/malformed (caller returns 400). */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const body: unknown = await request.json();
		return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

export function asString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

/** A finite, positive, safe integer, else null. */
export function asPositiveInt(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** An array of valid part numbers (1..MAX_PARTS, no more than MAX_PARTS of them), else null. */
export function asPartNumbers(value: unknown): number[] | null {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PARTS) return null;
	const nums: number[] = [];
	for (const item of value) {
		const n = asPositiveInt(item);
		if (n === null || n > MAX_PARTS) return null;
		nums.push(n);
	}
	return nums;
}

/** An array of completed parts (`{ partNumber, etag }`), else null. */
export function asCompletedParts(value: unknown): { partNumber: number; etag: string }[] | null {
	if (!Array.isArray(value) || value.length === 0 || value.length > MAX_PARTS) return null;
	const parts: { partNumber: number; etag: string }[] = [];
	for (const item of value) {
		if (typeof item !== 'object' || item === null) return null;
		const record = item as Record<string, unknown>;
		const partNumber = asPositiveInt(record.partNumber);
		const etag = asString(record.etag);
		if (partNumber === null || partNumber > MAX_PARTS || etag === null) return null;
		parts.push({ partNumber, etag });
	}
	return parts;
}
