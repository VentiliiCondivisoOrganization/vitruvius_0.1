import { z } from 'zod';

export const rawLearningSchema = z.object({
	scope: z.string().min(1),
	text: z.string().min(1)
});

export const learningsResponseSchema = z.object({
	learnings: z.array(rawLearningSchema)
});

export type LearningsResponse = z.infer<typeof learningsResponseSchema>;
