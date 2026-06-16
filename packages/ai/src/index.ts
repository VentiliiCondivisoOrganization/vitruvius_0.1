import type { ManualStep } from "@vitruvius/core";

// TODO(spec 05-ai-segment, 06-ai-instructions): implement Gemini calls. Output must be
// validated with the @vitruvius/core zod schemas. Called from the engine only.

export async function segmentVideoIntoSteps(_videoUrl: string): Promise<ManualStep[]> {
  throw new Error("not implemented");
}

export async function writeInstructions(_steps: ManualStep[]): Promise<ManualStep[]> {
  throw new Error("not implemented");
}
