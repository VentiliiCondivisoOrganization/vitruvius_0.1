import { z } from 'zod';

export const rawCritiqueSchema = z.object({
	order: z.number().int().nonnegative(),
	confidence: z.number().min(0).max(1),
	critique: z.array(z.string().min(1))
});

export const critiqueResponseSchema = z.object({
	steps: z.array(rawCritiqueSchema).min(1)
});

export type CritiqueResponse = z.infer<typeof critiqueResponseSchema>;
