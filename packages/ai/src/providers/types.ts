import type { RawSegment, SegmentWindow } from '../segment/types.js';

export type SegmentProviderContext = {
	videoDurationMs: number;
	learnings: string[];
	manualId?: string;
};

export interface SegmentProvider {
	readonly name: string;
	segmentWindow(
		window: SegmentWindow,
		context: SegmentProviderContext
	): Promise<RawSegment[]>;
}

export type SegmentProviderFactory = () => SegmentProvider;
