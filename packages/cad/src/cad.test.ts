import { digitalModelSchema } from '@vitruvius/core';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearCache } from './cache.js';
import { ingestModel } from './ingest.js';
import { isRenderAvailable, renderCanonicalViews, setKernelRenderer } from './render.js';
import { decodeStepString } from './step-strings.js';

// A short but structurally real STEP AP214 assembly: one root "LINEAR_GUIDE" containing a
// rail, a carriage, an end seal, and two M4 bolts (quantity 2). One part name carries a
// non-ASCII glyph via the STEP \X2\ escape (\X2\00E9\X0\ -> "é") to exercise decoding.
// Built on the fly so no binary blob is committed.
const STEP_FIXTURE = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('linear guide assembly'),'2;1');
FILE_NAME('guide.stp','2026-06-20T00:00:00',(''),(''),'preproc','Autodesk Inventor','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 }'));
ENDSEC;
DATA;
#1 = PRODUCT('LINEAR_GUIDE','LINEAR_GUIDE','',(#100));
#2 = PRODUCT('RAIL','RAIL','',(#100));
#3 = PRODUCT('CARRIAGE','CARRIAGE','',(#100));
#4 = PRODUCT('END_SEAL_\\X2\\00E9\\X0\\','seal','',(#100));
#5 = PRODUCT('M4_BOLT','M4','',(#100));
#11 = PRODUCT_DEFINITION_FORMATION('','',#1);
#12 = PRODUCT_DEFINITION_FORMATION('','',#2);
#13 = PRODUCT_DEFINITION_FORMATION('','',#3);
#14 = PRODUCT_DEFINITION_FORMATION('','',#4);
#15 = PRODUCT_DEFINITION_FORMATION('','',#5);
#21 = PRODUCT_DEFINITION('design','',#11,#200);
#22 = PRODUCT_DEFINITION('design','',#12,#200);
#23 = PRODUCT_DEFINITION('design','',#13,#200);
#24 = PRODUCT_DEFINITION('design','',#14,#200);
#25 = PRODUCT_DEFINITION('design','',#15,#200);
#31 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('1','','',#21,#22,$);
#32 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('2','','',#21,#23,$);
#33 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('3','','',#21,#24,$);
#34 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('4','','',#21,#25,$);
#35 = NEXT_ASSEMBLY_USAGE_OCCURRENCE('5','','',#21,#25,$);
#40 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );
ENDSEC;
END-ISO-10303-21;
`;

// A tiny OBJ: a unit tetrahedron — 4 vertices, 4 triangular faces.
const OBJ_FIXTURE = `# tetra
v 0 0 0
v 1 0 0
v 0 1 0
v 0 0 1
f 1 2 3
f 1 2 4
f 1 3 4
f 2 3 4
`;

describe('packages/cad', () => {
	let workDir: string;

	beforeAll(async () => {
		workDir = await mkdtemp(join(tmpdir(), 'vitruvius-cad-test-'));
		clearCache();
	});

	afterAll(async () => {
		if (workDir) await rm(workDir, { recursive: true, force: true });
		setKernelRenderer(null);
	});

	describe('STEP product structure', () => {
		it('parses BOM with named parts, quantities, assembly tree, and decoded names', async () => {
			const path = join(workDir, 'guide.stp');
			await writeFile(path, STEP_FIXTURE, 'utf8');

			const model = await ingestModel(path);

			expect(model.status).toBe('primed');
			expect(model.source).toMatchObject({ format: 'step', schema: 'AUTOMOTIVE_DESIGN' });
			expect(model.source?.system).toBe('Autodesk Inventor');
			expect(model.source?.units).toBe('MILLI METRE');

			const names = model.bom.map((b) => b.name).sort();
			expect(names).toContain('RAIL');
			expect(names).toContain('CARRIAGE');
			expect(names).toContain('M4_BOLT');
			// Non-ASCII part name decoded from \X2\00E9\X0\ -> "é".
			expect(names.some((n) => n.includes('é'))).toBe(true);

			// The M4 bolt appears twice -> quantity 2.
			const m4 = model.bom.find((b) => b.name === 'M4_BOLT');
			expect(m4?.quantity).toBe(2);

			// Assembly tree: root LINEAR_GUIDE has four distinct children.
			const root = model.assembly.find((n) => n.name === 'LINEAR_GUIDE');
			expect(root).toBeDefined();
			expect(root!.children.length).toBeGreaterThanOrEqual(4);

			// Schema-valid output.
			expect(() => digitalModelSchema.parse(model)).not.toThrow();
		});

		it('caches on content hash (second ingest returns the same artifact)', async () => {
			const path = join(workDir, 'guide.stp');
			const a = await ingestModel(path);
			const b = await ingestModel(path);
			expect(b).toBe(a); // referential identity from the cache
			expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
		});
	});

	describe('mesh geometry stats', () => {
		it('parses an OBJ into vertex/triangle counts and a bounding box', async () => {
			const path = join(workDir, 'tetra.obj');
			await writeFile(path, OBJ_FIXTURE, 'utf8');

			const model = await ingestModel(path);

			expect(model.status).toBe('primed');
			expect(model.source).toMatchObject({ format: 'obj' });
			expect(model.geometry?.vertexCount).toBe(4);
			expect(model.geometry?.triangleCount).toBe(4);
			expect(model.geometry?.boundingBox).toEqual([0, 0, 0, 1, 1, 1]);
			expect(model.bom).toEqual([]);
			expect(() => digitalModelSchema.parse(model)).not.toThrow();
		});
	});

	describe('graceful degradation', () => {
		it('returns absent when no model is supplied', async () => {
			const model = await ingestModel(null);
			expect(model.status).toBe('absent');
			expect(() => digitalModelSchema.parse(model)).not.toThrow();
		});

		it('returns unsupported for a recognized-but-unsupported format', async () => {
			const path = join(workDir, 'part.iges');
			await writeFile(path, 'whatever', 'utf8');
			const model = await ingestModel(path, { logger: silentLogger() });
			expect(model.status).toBe('unsupported');
		});

		it('returns unsupported for an unknown extension', async () => {
			const path = join(workDir, 'notes.txt');
			await writeFile(path, 'hello', 'utf8');
			const model = await ingestModel(path, { logger: silentLogger() });
			expect(model.status).toBe('unsupported');
		});

		it('returns failed for a missing supported file rather than throwing', async () => {
			const model = await ingestModel(join(workDir, 'missing.stp'), { logger: silentLogger() });
			expect(model.status).toBe('failed');
		});
	});

	describe('STEP string decoding', () => {
		it('decodes \\X2\\ (UTF-16), \\X\\ (8-bit), doubled quotes, and backslash', () => {
			expect(decodeStepString('caf\\X2\\00E9\\X0\\')).toBe('café');
			expect(decodeStepString('\\X\\E9')).toBe('é');
			expect(decodeStepString("o''brien")).toBe("o'brien");
			expect(decodeStepString('a\\\\b')).toBe('a\\b');
			// Multi-codepoint \X2\ run.
			expect(decodeStepString('\\X2\\00E900FC\\X0\\')).toBe('éü');
		});
	});

	describe('canonical-view rendering (kernel-optional)', () => {
		it('produces no views when no kernel is available', async () => {
			expect(isRenderAvailable()).toBe(false);
			const views = await renderCanonicalViews('/any.stp', ['assembly'], workDir);
			expect(views).toEqual([]);
		});

		// Runs only where a kernel is installed. In plain CI there is none, so we simulate
		// the engine's wiring: install a fake KernelRenderer and assert the artifact carries
		// a view ref. This proves the boundary contract without a native dep. The REAL
		// kernel-backed render runs in the engine container (see checks.yml note).
		const kernelEnv = process.env.VITRUVIUS_CAD_KERNEL === '1';
		it.runIf(kernelEnv)('produces view refs when a kernel is wired', async () => {
			setKernelRenderer({
				render: async (_path, targets, outDir) =>
					targets.map((t) => ({
						target: t,
						angle: 'iso',
						fileRef: join(outDir, `${t}-iso.png`)
					}))
			});
			const path = join(workDir, 'guide.stp');
			await writeFile(path, STEP_FIXTURE, 'utf8');
			clearCache();
			const model = await ingestModel(path, { outDir: workDir });
			expect(model.views.length).toBeGreaterThan(0);
			expect(model.views[0]!.fileRef).toContain('-iso.png');
			setKernelRenderer(null);
		});
	});
});

function silentLogger() {
	return { info: () => {}, warn: () => {} };
}
