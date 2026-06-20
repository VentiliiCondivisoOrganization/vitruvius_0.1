// Format recognition and content hashing for incoming model files. Pure, deterministic,
// dependency-free — no CAD kernel, no AI. Detection is by file extension, which is what
// CAD exporters reliably set; we never sniff bytes to guess between, say, ASCII and
// binary STL (the mesh parser handles that internally).

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

/** A model format this package can actually parse. */
export type SupportedFormat = 'step' | 'obj' | 'stl';

// Extensions we recognize but do NOT parse on this code path: they are logged and
// skipped (-> `unsupported`) rather than failing the run. Kept explicit so the log can
// say "recognized but unsupported" vs. "unknown extension"; both map to `unsupported`.
const RECOGNIZED_UNSUPPORTED = new Set([
	'.iges',
	'.igs',
	'.sldprt',
	'.sldasm',
	'.ipt',
	'.iam',
	'.f3d',
	'.3mf',
	'.ply',
	'.gltf',
	'.glb',
	'.fbx',
	'.dae'
]);

const SUPPORTED: Record<string, SupportedFormat> = {
	'.step': 'step',
	'.stp': 'step',
	'.obj': 'obj',
	'.stl': 'stl'
};

export type FormatClassification =
	| { kind: 'supported'; format: SupportedFormat }
	| { kind: 'recognized-unsupported'; ext: string }
	| { kind: 'unknown'; ext: string };

/** Classify a model path by extension into supported / recognized-unsupported / unknown. */
export function classifyFormat(path: string): FormatClassification {
	const ext = extname(path).toLowerCase();
	const format = SUPPORTED[ext];
	if (format) return { kind: 'supported', format };
	if (RECOGNIZED_UNSUPPORTED.has(ext)) return { kind: 'recognized-unsupported', ext };
	return { kind: 'unknown', ext };
}

/** SHA-256 of the file's bytes, hex-encoded — the cache key for the parsed artifact. */
export async function hashFile(path: string): Promise<string> {
	const bytes = await readFile(path);
	return createHash('sha256').update(bytes).digest('hex');
}
