import type { ManualStep } from '@vitruvius/core';
import type { IllustrationMode, RawIllustration } from '../illustrate/types.js';

/**
 * One step's illustration request, prepared by the orchestrator: the step, the chosen base
 * image (a keyframe or a canonical CAD view), and how the provider should treat it.
 */
export type IllustrationRequest = {
	step: ManualStep;
	mode: IllustrationMode;
	baseImageRef: string;
	/** Editor regeneration prompt (spec 16); folded into the prompt and the cache key when present. */
	guidance?: string;
};

export type IllustrateProviderContext = {
	styleVersion: string;
	manualId?: string;
};

export interface IllustrateProvider {
	readonly name: string;
	/**
	 * Generate an illustration per request. A provider may return fewer entries than it was
	 * given (declining steps it cannot illustrate); the orchestrator passes those through
	 * with no illustration rather than failing the run.
	 */
	illustrate(
		requests: IllustrationRequest[],
		context: IllustrateProviderContext
	): Promise<RawIllustration[]>;
}

export type IllustrateProviderFactory = () => IllustrateProvider;
