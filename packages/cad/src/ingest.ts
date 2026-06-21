// Top-level entry point: turn an optional model file into a schema-valid `DigitalModel`
// priming artifact. Deterministic, kernel-free for the parse path, and graceful at every
// edge — no model / unsupported format / parse failure each map to a status, never an
// exception that could fail the engine pipeline. The model is auxiliary: video-only runs
// continue unchanged when this returns a non-`primed` status.

import { digitalModelSchema, type DigitalModel } from '@vitruvius/core';
import { readFile } from 'node:fs/promises';
import { getCached, setCached } from './cache.js';
import { classifyFormat, hashFile } from './format.js';
import { parseObj, parseStl } from './mesh.js';
import { renderCanonicalViews } from './render.js';
import { parseStep } from './step.js';

export interface IngestOptions {
	/**
	 * Directory for rendered canonical views, when a kernel is available. Omitting it
	 * disables rendering even if a kernel is installed (views need somewhere to land).
	 */
	outDir?: string;
	/** Sink for recognized-but-unsupported / failure notes. Defaults to `console`. */
	logger?: Pick<Console, 'info' | 'warn'>;
}

// An empty, non-primed artifact carrying just a status (and a content hash when known).
function emptyModel(status: DigitalModel['status'], contentHash: string): DigitalModel {
	return {
		status,
		source: null,
		bom: [],
		assembly: [],
		geometry: null,
		views: [],
		contentHash
	};
}

/**
 * Ingest a model file by path. Returns `absent` when `modelPath` is null/undefined.
 * Always returns a schema-valid `DigitalModel`; the only way this throws is a programming
 * error in our own output (the zod parse below), never a malformed input file.
 */
export async function ingestModel(
	modelPath: string | null | undefined,
	options: IngestOptions = {}
): Promise<DigitalModel> {
	const log = options.logger ?? console;

	if (!modelPath) return digitalModelSchema.parse(emptyModel('absent', ''));

	const classification = classifyFormat(modelPath);
	if (classification.kind !== 'supported') {
		const why =
			classification.kind === 'recognized-unsupported'
				? `recognized but unsupported format (${classification.ext})`
				: `unknown model extension (${classification.ext || 'none'})`;
		log.info(`[cad] skipping ${modelPath}: ${why}`);
		return digitalModelSchema.parse(emptyModel('unsupported', ''));
	}

	// Hash first so a failed parse still caches nothing but a later retry is cheap, and so
	// a successful parse is memoized on the file content.
	let contentHash: string;
	try {
		contentHash = await hashFile(modelPath);
	} catch (err) {
		log.warn(`[cad] could not read ${modelPath}: ${String(err)}`);
		return digitalModelSchema.parse(emptyModel('failed', ''));
	}

	// Key on the content hash AND the output dir: rendered `views` carry absolute paths
	// under `options.outDir`, so a cache keyed on content alone could hand back views
	// pointing at a different call's directory (or `[]` from a prior no-render call).
	const cacheKey = `${contentHash}:${options.outDir ?? ''}`;
	const cached = getCached(cacheKey);
	if (cached) return cached;

	try {
		const model = await parseSupported(classification.format, modelPath, contentHash, options);
		const validated = digitalModelSchema.parse(model);
		setCached(cacheKey, validated);
		return validated;
	} catch (err) {
		log.warn(`[cad] failed to parse ${modelPath}: ${String(err)}`);
		return digitalModelSchema.parse(emptyModel('failed', contentHash));
	}
}

async function parseSupported(
	format: 'step' | 'obj' | 'stl',
	modelPath: string,
	contentHash: string,
	options: IngestOptions
): Promise<DigitalModel> {
	if (format === 'step') {
		const text = await readFile(modelPath, 'utf8');
		const { source, bom, assembly } = parseStep(text);
		const views = options.outDir
			? await renderCanonicalViews(
					modelPath,
					['assembly', ...bom.map((b) => b.sourceId)],
					options.outDir
				)
			: [];
		return { status: 'primed', source, bom, assembly, geometry: null, views, contentHash };
	}

	// Mesh formats: geometry stats now, optional whole-model render.
	const buf = await readFile(modelPath);
	const geometry = format === 'obj' ? parseObj(buf.toString('utf8')) : parseStl(buf);
	const views = options.outDir
		? await renderCanonicalViews(modelPath, ['assembly'], options.outDir)
		: [];
	return {
		status: 'primed',
		source: { format, system: null, units: null, schema: null },
		bom: [],
		assembly: [],
		geometry,
		views,
		contentHash
	};
}
