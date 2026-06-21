// packages/cad — deterministic ingestion of an optional digital model (CAD/mesh) shipped
// alongside a video, turned into an AI-priming artifact (bill of materials + assembly tree
// + geometry stats + optional canonical views). Engine-only, like packages/media: never
// imported by apps/web. Makes NO AI/model calls — parsing and rendering are local compute.
//
// The shared output shapes (DigitalModel, BomItem, …) live in @vitruvius/core and are not
// redefined here. No concrete CAD-kernel type is exported: rendering is reached only
// through the KernelRenderer interface, wired by the engine at runtime.

export { clearCache } from './cache.js';
export { ingestModel } from './ingest.js';
export type { IngestOptions } from './ingest.js';
export { isRenderAvailable, renderCanonicalViews, setKernelRenderer } from './render.js';
export type { KernelRenderer } from './render.js';

// Lower-level parsers exposed for testing and for callers that already have file bytes.
export { classifyFormat, hashFile } from './format.js';
export type { FormatClassification, SupportedFormat } from './format.js';
export { parseObj, parseStl } from './mesh.js';
export { decodeStepString } from './step-strings.js';
export { parseStep } from './step.js';
export type { StepParseResult } from './step.js';
