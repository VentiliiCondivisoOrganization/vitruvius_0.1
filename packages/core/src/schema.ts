import { z } from 'zod';
import {
	DIGITAL_MODEL_STATUS,
	JOB_STATUS,
	JOB_TYPE,
	MANUAL_BOM_SOURCE,
	MANUAL_STATUS,
	REGENERATE_SCOPE,
	STEP_REVIEW_STATUS
} from './status.js';

export const partRefSchema = z.object({
	bomItemId: z.string().nullable(),
	label: z.string(),
	bomCode: z.string().optional(),
	description: z.string().optional(),
	confidence: z.number().min(0).max(1),
	candidateBomItemIds: z.array(z.string()).optional()
});

export const manualBomItemSchema = z.object({
	id: z.string(),
	partName: z.string(),
	bomCode: z.string().optional(),
	description: z.string(),
	quantity: z.number().int().positive().optional(),
	source: z.enum(MANUAL_BOM_SOURCE),
	cadSourceId: z.string().optional()
});

export const manualStepSchema = z.object({
	id: z.string(),
	order: z.number().int().nonnegative(),
	title: z.string(),
	instruction: z.string(),
	caption: z.string().default(''),
	startMs: z.number().int().nonnegative(),
	endMs: z.number().int().nonnegative(),
	keyframeUrl: z.string(),
	illustrationUrl: z.string().default(''),
	tools: z.array(z.string()),
	parts: z.array(partRefSchema).default([]),
	warnings: z.array(z.string()),
	confidence: z.number().min(0).max(1),
	reviewStatus: z.enum(STEP_REVIEW_STATUS),
	sourceNotes: z.array(z.string()),
	alternatives: z.array(z.string()),
	// Critic (spec 10) flags. Defaulted so pre-Critic steps and stored rows parse unchanged.
	critique: z.array(z.string()).default([])
});

export const instructionManualSchema = z.object({
	id: z.string(),
	title: z.string(),
	videoUrl: z.string(),
	bomFileUrl: z.string().default(''),
	digitalModelUrl: z.string().default(''),
	status: z.enum(MANUAL_STATUS),
	steps: z.array(manualStepSchema),
	bom: z.array(manualBomItemSchema).default([]),
	createdAt: z.string(),
	updatedAt: z.string()
});

export const learningSchema = z.object({
	id: z.string(),
	scope: z.string().min(1),
	text: z.string().min(1),
	sourceManualId: z.string(),
	createdAt: z.string()
});

// A Learning before persistence — id and createdAt are assigned by the database.
export const newLearningSchema = learningSchema.omit({ id: true, createdAt: true });
// Digital model (CAD/mesh) priming artifact — spec 12-cad-ingest. Mirrors the
// DigitalModel/BomItem types; `@vitruvius/cad` validates its output against this.
export const bomItemSchema = z.object({
	name: z.string(),
	quantity: z.number().int().nonnegative(),
	sourceId: z.string()
});

export const assemblyNodeSchema = z.object({
	sourceId: z.string(),
	name: z.string(),
	children: z.array(z.string())
});

export const digitalModelSourceSchema = z.object({
	format: z.enum(['step', 'obj', 'stl']),
	system: z.string().nullable(),
	units: z.string().nullable(),
	schema: z.string().nullable()
});

export const geometryStatsSchema = z.object({
	vertexCount: z.number().int().nonnegative(),
	triangleCount: z.number().int().nonnegative(),
	boundingBox: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()])
});

export const canonicalViewSchema = z.object({
	target: z.string(),
	angle: z.string(),
	fileRef: z.string()
});

export const digitalModelSchema = z.object({
	status: z.enum(DIGITAL_MODEL_STATUS),
	source: digitalModelSourceSchema.nullable(),
	bom: z.array(bomItemSchema),
	assembly: z.array(assemblyNodeSchema),
	geometry: geometryStatsSchema.nullable(),
	views: z.array(canonicalViewSchema),
	contentHash: z.string()
});

// Validates a `regenerate` job's payload (spec 16). A non-empty prompt is required —
// automatic regeneration without a user prompt is out of scope.
export const regenerateRequestSchema = z.object({
	scope: z.enum(REGENERATE_SCOPE),
	prompt: z.string().min(1),
	stepIds: z.array(z.string()).min(1)
});

export const jobSchema = z.object({
	id: z.string(),
	manualId: z.string(),
	type: z.enum(JOB_TYPE),
	status: z.enum(JOB_STATUS),
	attempts: z.number().int().nonnegative(),
	// Null for process/export; a validated request for regenerate jobs (spec 16).
	payload: regenerateRequestSchema.nullable().default(null),
	createdAt: z.string(),
	updatedAt: z.string()
});
