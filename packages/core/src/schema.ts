import { z } from "zod";
import { MANUAL_STATUS, STEP_REVIEW_STATUS, JOB_STATUS, JOB_TYPE } from "./status.js";

export const manualStepSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  title: z.string(),
  instruction: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  keyframeUrl: z.string(),
  tools: z.array(z.string()),
  parts: z.array(z.string()),
  warnings: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reviewStatus: z.enum(STEP_REVIEW_STATUS),
  sourceNotes: z.array(z.string()),
  alternatives: z.array(z.string()),
});

export const instructionManualSchema = z.object({
  id: z.string(),
  title: z.string(),
  videoUrl: z.string(),
  status: z.enum(MANUAL_STATUS),
  steps: z.array(manualStepSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const jobSchema = z.object({
  id: z.string(),
  manualId: z.string(),
  type: z.enum(JOB_TYPE),
  status: z.enum(JOB_STATUS),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
