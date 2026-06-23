import type { DigitalModel, ManualStep } from '@vitruvius/core';

/**
 * Optional context for the Illustrator (spec 14). A primed `DigitalModel` switches the
 * agent into the Compositor-lite path (lay out the schematic on canonical CAD views);
 * otherwise the video-only Illustrator path is used.
 */
export type IllustrateOptions = {
	digitalModel?: DigitalModel | null;
	manualId?: string;
	/** Natural-language steering from a `regenerate` illustration/layout job (spec 16). */
	guidance?: string;
};

/**
 * Input to the Illustrator (spec 14 tier 1): the critic-reviewed steps to illustrate in
 * place, plus the engine-owned directory generated illustration files are written into.
 * The directory is cleaned up by the caller — illustrations leave this package as file
 * refs (`illustrationUrl`), never inline in the contract.
 */
export type IllustrateInput = IllustrateOptions & {
	steps: ManualStep[];
	outDir: string;
};

/**
 * How a step's illustration is produced:
 *   - `illustrator`     — redraw a video keyframe as a clean schematic (no CAD model);
 *   - `compositor-lite` — lay the schematic out on a spec 12 canonical CAD view (static,
 *                         no per-step pose alignment — that is tier 2 / phase 2).
 */
export type IllustrationMode = 'illustrator' | 'compositor-lite';

/**
 * One generated illustration as returned by a provider — the image bytes in memory only.
 * The orchestrator writes them to a file and exposes a `fileRef`; bytes never enter the
 * `@vitruvius/core` contract.
 */
export type RawIllustration = {
	order: number;
	/** base64-encoded image bytes. */
	imageBase64: string;
	mimeType: string;
};
