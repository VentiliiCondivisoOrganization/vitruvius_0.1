// Abuse / resource guardrails enforced by the web server at the upload entry points.
// Kept here in the frozen contract so the web app, and any future client-side hint or
// engine check, all read the same numbers instead of redefining them locally.
//
// These are deliberately generous for the MVP — they exist to stop a hostile visitor
// from flooding storage and burning AI credits (huge or endless uploads), not to ration
// legitimate use. Tune the constants here; every enforcement site picks up the change.

const MB = 1024 * 1024;

/** Largest source video accepted, in bytes. Sits just under the adapter `BODY_SIZE_LIMIT`. */
export const MAX_VIDEO_BYTES = 500 * MB;

/** Largest optional BOM CSV accepted, in bytes. */
export const MAX_BOM_BYTES = 5 * MB;

/** Largest optional digital model (CAD/mesh) accepted, in bytes. */
export const MAX_MODEL_BYTES = 50 * MB;

/** Rolling window for the per-user upload rate limit, in milliseconds. */
export const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Max new manuals a single user may create within `RATE_WINDOW_MS`. */
export const MAX_MANUALS_PER_WINDOW = 20;

/** Hard cap on how many manuals a single user may own at once. */
export const MAX_MANUALS_TOTAL = 200;

/** Render a byte count as a short human string (e.g. `500 MB`) for user-facing messages. */
export function formatBytes(bytes: number): string {
	const mb = bytes / MB;
	return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}
