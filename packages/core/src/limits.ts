// Abuse / resource guardrails enforced by the web server at the upload entry points.
// Kept here in the frozen contract so the web app, and any future client-side hint or
// engine check, all read the same numbers instead of redefining them locally.
//
// These are deliberately VERY loose: they are a backstop against runaway spending and
// crude DoS (a hostile visitor uploading endlessly or with an absurd file), not a
// product-level cap on legitimate use. They sit far above anything a real user hits.
// Note the effective ceiling on a single upload today is still the adapter
// `BODY_SIZE_LIMIT` (fly.web.toml), since the video is buffered through the web server;
// truly huge videos need direct-to-R2 signed uploads, not a bigger number here.
// Tune the constants here; every enforcement site picks up the change.

const MB = 1024 * 1024;
const GB = 1024 * MB;
const TB = 1024 * GB;

/** Largest source video accepted, in bytes. Loose backstop only — see the file header. */
export const MAX_VIDEO_BYTES = 10 * TB;

/** Largest optional BOM CSV accepted, in bytes. */
export const MAX_BOM_BYTES = 1 * GB;

/** Largest optional digital model (CAD/mesh) accepted, in bytes. */
export const MAX_MODEL_BYTES = 100 * GB;

/** Rolling window for the per-user upload rate limit, in milliseconds. */
export const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Max new manuals a single user may create within `RATE_WINDOW_MS`. */
export const MAX_MANUALS_PER_WINDOW = 100;

/** Hard cap on how many manuals a single user may own at once. */
export const MAX_MANUALS_TOTAL = 2000;

/** Render a byte count as a short human string (e.g. `10 TB`) for user-facing messages. */
export function formatBytes(bytes: number): string {
	const units: ReadonlyArray<[label: string, size: number]> = [
		['TB', TB],
		['GB', GB],
		['MB', MB],
		['KB', 1024]
	];
	for (const [label, size] of units) {
		if (bytes >= size) {
			const value = bytes / size;
			return `${Number.isInteger(value) ? value : value.toFixed(1)} ${label}`;
		}
	}
	return `${bytes} B`;
}
