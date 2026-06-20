import { z } from 'zod';

export const rawInstructionSchema = z.object({
	order: z.number().int().nonnegative(),
	title: z.string().min(1),
	instruction: z.string().min(1),
	tools: z.array(z.string().min(1)),
	parts: z.array(z.string().min(1)),
	warnings: z.array(z.string().min(1)),
	alternatives: z.array(z.string().min(1)),
	addedSourceNotes: z.array(z.string().min(1)).optional()
});

export const instructionResponseSchema = z.object({
	steps: z.array(rawInstructionSchema).min(1)
});

export type InstructionResponse = z.infer<typeof instructionResponseSchema>;
