import { z } from 'zod';

export const rawSegmentSchema = z.object({
	order: z.number().int().nonnegative(),
	startMs: z.number().int().nonnegative(),
	endMs: z.number().int().nonnegative(),
	confidence: z.number().min(0).max(1),
	sourceNotes: z.array(z.string().min(1)).min(1),
	label: z.string().optional()
});

export const segmentResponseSchema = z.object({
	steps: z.array(rawSegmentSchema).min(1)
});

export type SegmentResponse = z.infer<typeof segmentResponseSchema>;
