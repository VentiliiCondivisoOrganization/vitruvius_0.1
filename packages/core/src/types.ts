import type {
	DigitalModelStatus,
	JobStatus,
	JobType,
	ManualBomSource,
	ManualStatus,
	RegenerateScope,
	StepReviewStatus
} from './status.js';

// Structured component reference on a step (spec 13-bom-map). Distinct from the CAD-only
// `BomItem` inside `DigitalModel` — reconcile merges CAD + file BOM into `ManualBomItem`.
export type PartRef = {
	bomItemId: string | null;
	label: string;
	bomCode?: string;
	description?: string;
	confidence: number;
	candidateBomItemIds?: string[];
};

export type ManualStep = {
	id: string;
	order: number;
	title: string;
	instruction: string;
	caption: string; // short on-page text for IKEA-style export (spec 06 / 09)
	startMs: number;
	endMs: number;
	keyframeUrl: string; // source evidence still from video (spec 04)
	illustrationUrl: string; // print-ready schematic (spec 14); empty until illustrated
	tools: string[];
	parts: PartRef[];
	warnings: string[];
	confidence: number; // 0..1, the model's self-reported certainty
	reviewStatus: StepReviewStatus;
	sourceNotes: string[]; // why the AI proposed this (timestamps, audio cues, visual evidence)
	alternatives: string[]; // alternative phrasings/options the editor can choose from
	critique: string[]; // Critic (spec 10) flags: what is unsupported/missing; empty when well-supported
};

// Merged bill of materials at manual scope after spec 13 reconcile (file + CAD + inferred).
export type ManualBomItem = {
	id: string;
	partName: string;
	bomCode?: string;
	description: string;
	quantity?: number;
	source: ManualBomSource;
	// When `source` is `cad`, links back to `BomItem.sourceId` from spec 12.
	cadSourceId?: string;
};

export type InstructionManual = {
	id: string;
	title: string;
	videoUrl: string;
	/** Storage object key for an optional BOM file (spec 13). Empty when absent. */
	bomFileUrl: string;
	/** Storage object key for an optional digital model (spec 12). Empty when absent. */
	digitalModelUrl: string;
	status: ManualStatus;
	steps: ManualStep[];
	bom: ManualBomItem[];
	createdAt: string; // ISO 8601
	updatedAt: string; // ISO 8601
};

// A reusable, generalizable heuristic distilled from a finished run (spec 11) —
// e.g. a tool/part naming convention, an audio cue, or a recurring warning. Not a
// per-video transcript line. Primed back into future generation prompts.
export type Learning = {
	id: string;
	scope: string; // a tag grouping related learnings for retrieval (e.g. 'warning', 'tool')
	text: string; // the generalizable heuristic itself
	sourceManualId: string; // the run this was distilled from
	createdAt: string; // ISO 8601
};

// A Learning before persistence — id and createdAt are assigned by the database.
export type NewLearning = Omit<Learning, 'id' | 'createdAt'>;
// ---------------------------------------------------------------------------
// Digital model (CAD/mesh) priming artifact — spec 12-cad-ingest.
//
// An optional model (STEP/OBJ/STL) that ships alongside a video is parsed by the
// engine-only `@vitruvius/cad` package into this normalized, AI-priming shape. It is
// auxiliary context: it sharpens segmentation and instruction part-naming, but the
// pipeline runs unchanged on video alone when no usable model is present.
// ---------------------------------------------------------------------------

// One line of the CAD-derived bill of materials inside `DigitalModel` (spec 12).
// Manual-scope BOM rows use `ManualBomItem` after reconcile (spec 13).
export type BomItem = {
	// Human-readable part name, already decoded (non-ASCII / STEP `\X2\` escapes resolved).
	name: string;
	// Total occurrence count of this part across the assembly.
	quantity: number;
	// Stable identifier from the source file (e.g. STEP product id) for traceability.
	sourceId: string;
};

// A node in the assembly tree: a parent product and the child occurrences it contains.
// `name` is the product name; `children` reference child nodes by their `sourceId`.
export type AssemblyNode = {
	sourceId: string;
	name: string;
	// `sourceId`s of the direct child occurrences of this node.
	children: string[];
};

// Provenance read out of the model file, useful for the Critic and for debugging.
export type DigitalModelSource = {
	// Format family the artifact was parsed from.
	format: 'step' | 'obj' | 'stl';
	// Originating CAD system when discoverable (e.g. "Autodesk Inventor"), else null.
	system: string | null;
	// Declared units when discoverable (e.g. "MILLIMETRE"), else null.
	units: string | null;
	// Schema/flavor when discoverable (e.g. STEP "AUTOMOTIVE_DESIGN"), else null.
	schema: string | null;
};

// Basic geometry statistics extracted from a mesh file. Cheap, deterministic, and
// kernel-free — distinct from the optional rendered views below.
export type GeometryStats = {
	vertexCount: number;
	triangleCount: number;
	// Axis-aligned bounding box, [minX, minY, minZ, maxX, maxY, maxZ], in file units.
	boundingBox: [number, number, number, number, number, number];
};

// A canonical view rendered for priming (whole-assembly or per-part). Produced ONLY when
// a CAD/mesh kernel is available in the engine container; never inlined — `fileRef` is an
// absolute local path the engine uploads to Storage. Empty when no kernel is present.
export type CanonicalView = {
	// "assembly" for the whole model, or a part `sourceId` for a per-part render.
	target: string;
	// Short label for the camera angle, e.g. "iso", "front".
	angle: string;
	fileRef: string;
};

// The priming artifact returned by `@vitruvius/cad` and validated against the zod schema.
export type DigitalModel = {
	status: DigitalModelStatus;
	source: DigitalModelSource | null;
	bom: BomItem[];
	// Flattened assembly tree; the root is the first node when present.
	assembly: AssemblyNode[];
	// Present for mesh inputs; null for STEP product-structure parses.
	geometry: GeometryStats | null;
	// Empty unless a kernel rendered canonical views.
	views: CanonicalView[];
	// Content hash of the source model file; the artifact is cached on this.
	contentHash: string;
};

// Parameters carried by a `regenerate` job (spec 16): the editor's natural-language
// prompt, which facet of the steps to re-derive, and the steps it applies to. Reuses
// the existing Instructor / Illustrator agents — there is no separate "Regenerator".
export type RegenerateRequest = {
	scope: RegenerateScope;
	prompt: string;
	stepIds: string[];
};

// The unit of work the web app enqueues and the engine consumes.
export type Job = {
	id: string;
	manualId: string;
	type: JobType;
	status: JobStatus;
	attempts: number;
	// Present only for `regenerate` jobs (spec 16); null for process/export.
	payload: RegenerateRequest | null;
	createdAt: string;
	updatedAt: string;
};
