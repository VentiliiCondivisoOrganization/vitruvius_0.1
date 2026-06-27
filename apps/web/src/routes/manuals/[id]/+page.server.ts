import { m } from '$lib/paraglide/messages';
import { readAuxFiles, uploadAuxFiles } from '$lib/server/uploads';
import { error, fail, redirect } from '@sveltejs/kit';
import { instructionManualSchema, regenerateRequestSchema } from '@vitruvius/core';
import {
	createManualVersion,
	enqueueJob,
	getManual,
	getManualProgressStage,
	listManualVersions,
	saveManual,
	type DbClient,
	type ManualVersionSummary
} from '@vitruvius/db';
import type { Actions, PageServerLoad } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Spec 17 freeze rule: only the head (no descendant) of a lineage is editable; older
 * versions are read-only snapshots (still exportable). A lineage with a single version
 * is its own head.
 */
function isHeadVersion(manualId: string, versions: ManualVersionSummary[]): boolean {
	return !versions.some((v) => v.parentVersionId === manualId);
}

export const load: PageServerLoad = async ({ params, locals }) => {
	// id maps to a uuid column; a non-uuid would make the query error (500) rather
	// than a clean 404, so reject it up front.
	if (!UUID_RE.test(params.id)) error(404, m.error_manual_not_found());

	const manual = await getManual(locals.db, params.id);
	if (!manual) error(404, m.error_manual_not_found());

	// The version lineage drives the switcher and the freeze rule. A video-only manual
	// that was never enriched is a one-element lineage (and its own head).
	const versions = await listManualVersions(locals.db, manual.id);

	// Live pipeline stage (spec 07) for the processing view's progress bar. Only meaningful
	// while `processing`; the page polls (invalidateAll) so this refreshes as the engine advances.
	const progressStage =
		manual.status === 'processing' ? await getManualProgressStage(locals.db, manual.id) : null;

	// Hand the full manual to the page: the status view needs only the header
	// fields, but the editor (shown once `ready`) needs every step field.
	return { manual, versions, isHead: isHeadVersion(manual.id, versions), progressStage };
};

/** Reject edits/regeneration on a frozen (non-head) version. Returns a `fail` or null. */
async function assertHead(db: DbClient, manualId: string) {
	const { data, error } = await db
		.from('manuals')
		.select('id')
		.eq('parent_version_id', manualId)
		.limit(1)
		.returns<{ id: string }[]>();
	if (error) {
		return fail(500, { error: m.error_could_not_check_version({ message: error.message }) });
	}
	if ((data?.length ?? 0) > 0) {
		return fail(409, {
			error: m.error_older_version_readonly()
		});
	}
	return null;
}

export const actions: Actions = {
	// Persist the edited step set. The editor submits the full step array as JSON
	// (saveManual replaces a manual's steps wholesale, so the payload is the new
	// source of truth). We re-load the manual server-side to keep its immutable
	// header fields (id, title, videoUrl, createdAt) authoritative and never trust
	// them from the form; only the steps come from the client.
	save: async ({ params, request, locals }) => {
		if (!UUID_RE.test(params.id)) error(404, m.error_manual_not_found());

		const current = await getManual(locals.db, params.id);
		if (!current) error(404, m.error_manual_not_found());

		// Only a finished manual is editable. saveManual replaces the whole step set, so
		// accepting edits while the manual is uploaded/processing would race the engine
		// (or resurrect a failed one). Reject anything not `ready`.
		if (current.status !== 'ready') {
			return fail(409, { error: m.error_not_ready_for_editing() });
		}

		const frozen = await assertHead(locals.db, current.id);
		if (frozen) return frozen;

		const raw = (await request.formData()).get('payload');
		if (typeof raw !== 'string') return fail(400, { error: m.error_missing_payload() });

		let steps: unknown;
		try {
			steps = JSON.parse(raw);
		} catch {
			return fail(400, { error: m.error_malformed_payload() });
		}

		// Validate the whole manual (header + edited steps) against the core schema —
		// the same trust boundary getManual/saveManual enforce. Re-number defensively
		// so split/merge/reorder always yields a contiguous `order` (the DB enforces
		// UNIQUE(manual_id, order)).
		const reordered = Array.isArray(steps)
			? steps.map((step, index) =>
					step && typeof step === 'object' ? { ...(step as object), order: index } : step
				)
			: steps;

		const result = instructionManualSchema.safeParse({
			...current,
			steps: reordered,
			updatedAt: new Date().toISOString()
		});
		if (!result.success) {
			return fail(400, { error: m.error_invalid_edits({ message: result.error.message }) });
		}

		try {
			await saveManual(locals.db, result.data);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(500, { error: m.error_could_not_save({ message }) });
		}

		return { saved: true };
	},

	// Enqueue an AI regeneration of one step (spec 16). The web app never calls AI —
	// it only validates the request and queues a `regenerate` job for the engine, which
	// reuses the Instructor / Illustrator. Regeneration runs on the saved manual.
	regenerate: async ({ params, request, locals }) => {
		if (!UUID_RE.test(params.id)) error(404, m.error_manual_not_found());

		const manual = await getManual(locals.db, params.id);
		if (!manual) error(404, m.error_manual_not_found());
		if (manual.status !== 'ready') {
			return fail(409, { error: m.error_not_ready_for_regen() });
		}

		const frozen = await assertHead(locals.db, manual.id);
		if (frozen) return frozen;

		const form = await request.formData();
		const stepId = form.get('stepId');
		const parsed = regenerateRequestSchema.safeParse({
			scope: form.get('scope'),
			prompt: form.get('prompt'),
			stepIds: typeof stepId === 'string' && stepId ? [stepId] : []
		});
		if (!parsed.success) {
			return fail(400, { error: m.error_regen_fields_required() });
		}
		if (!manual.steps.some((step) => step.id === parsed.data.stepIds[0])) {
			return fail(400, { error: m.error_step_not_in_manual() });
		}

		try {
			await enqueueJob(locals.db, {
				manualId: manual.id,
				type: 'regenerate',
				payload: parsed.data
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(500, { error: m.error_could_not_start_regen({ message }) });
		}

		return { regenerateQueued: true };
	},

	// Enrich a video-only (or already-enriched) manual with a BOM file and/or digital
	// model that arrived after processing (spec 17). The web app only stores the new
	// files and calls `createManualVersion`, which copies the head onto the same step
	// timeline as a new version and enqueues the `enrich` job for the engine — it never
	// runs bom-map / illustrate itself. Redirects to the new version's editor.
	enrich: async ({ params, request, locals }) => {
		if (!UUID_RE.test(params.id)) error(404, m.error_manual_not_found());

		const manual = await getManual(locals.db, params.id);
		if (!manual) error(404, m.error_manual_not_found());
		if (manual.status !== 'ready') {
			return fail(409, { error: m.error_not_ready_to_enrich() });
		}

		const frozen = await assertHead(locals.db, manual.id);
		if (frozen) return frozen;

		const form = await request.formData();
		const aux = readAuxFiles(form);
		if ('error' in aux) return fail(400, { error: aux.error });
		if (!aux.bomFile && !aux.modelFile) {
			return fail(400, { error: m.error_enrich_files_required() });
		}

		// New files land under their own storage folder so they never collide with the
		// parent's refs; createManualVersion keeps the parent's ref for whichever file
		// the user did not replace.
		const auxUpload = await uploadAuxFiles(locals.db, crypto.randomUUID(), aux);
		if ('error' in auxUpload) return fail(502, { error: auxUpload.error });

		let next;
		try {
			next = await createManualVersion(locals.db, manual.id, {
				bomFileUrl: aux.bomFile ? auxUpload.bomFileUrl : undefined,
				digitalModelUrl: aux.modelFile ? auxUpload.digitalModelUrl : undefined
			});
		} catch (err) {
			await Promise.allSettled([locals.db.storage.from('videos').remove(auxUpload.uploadedPaths)]);
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(500, { error: m.error_could_not_start_enrich({ message }) });
		}

		redirect(303, `/manuals/${next.id}`);
	}
};
