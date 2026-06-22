import { error, fail } from '@sveltejs/kit';
import { instructionManualSchema, regenerateRequestSchema } from '@vitruvius/core';
import { enqueueJob, getManual, saveManual } from '@vitruvius/db';
import type { Actions, PageServerLoad } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params, locals }) => {
	// id maps to a uuid column; a non-uuid would make the query error (500) rather
	// than a clean 404, so reject it up front.
	if (!UUID_RE.test(params.id)) error(404, 'Manual not found');

	const manual = await getManual(locals.db, params.id);
	if (!manual) error(404, 'Manual not found');

	// Hand the full manual to the page: the status view needs only the header
	// fields, but the editor (shown once `ready`) needs every step field.
	return { manual };
};

export const actions: Actions = {
	// Persist the edited step set. The editor submits the full step array as JSON
	// (saveManual replaces a manual's steps wholesale, so the payload is the new
	// source of truth). We re-load the manual server-side to keep its immutable
	// header fields (id, title, videoUrl, createdAt) authoritative and never trust
	// them from the form; only the steps come from the client.
	save: async ({ params, request, locals }) => {
		if (!UUID_RE.test(params.id)) error(404, 'Manual not found');

		const current = await getManual(locals.db, params.id);
		if (!current) error(404, 'Manual not found');

		// Only a finished manual is editable. saveManual replaces the whole step set, so
		// accepting edits while the manual is uploaded/processing would race the engine
		// (or resurrect a failed one). Reject anything not `ready`.
		if (current.status !== 'ready') {
			return fail(409, { error: 'This manual is not ready for editing.' });
		}

		const raw = (await request.formData()).get('payload');
		if (typeof raw !== 'string') return fail(400, { error: 'Missing edit payload.' });

		let steps: unknown;
		try {
			steps = JSON.parse(raw);
		} catch {
			return fail(400, { error: 'Could not read edits: malformed payload.' });
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
			return fail(400, { error: `Edits are not valid: ${result.error.message}` });
		}

		try {
			await saveManual(locals.db, result.data);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(500, { error: `Could not save edits: ${message}` });
		}

		return { saved: true };
	},

	// Enqueue an AI regeneration of one step (spec 16). The web app never calls AI —
	// it only validates the request and queues a `regenerate` job for the engine, which
	// reuses the Instructor / Illustrator. Regeneration runs on the saved manual.
	regenerate: async ({ params, request, locals }) => {
		if (!UUID_RE.test(params.id)) error(404, 'Manual not found');

		const manual = await getManual(locals.db, params.id);
		if (!manual) error(404, 'Manual not found');
		if (manual.status !== 'ready') {
			return fail(409, { error: 'This manual is not ready for AI regeneration.' });
		}

		const form = await request.formData();
		const stepId = form.get('stepId');
		const parsed = regenerateRequestSchema.safeParse({
			scope: form.get('scope'),
			prompt: form.get('prompt'),
			stepIds: typeof stepId === 'string' && stepId ? [stepId] : []
		});
		if (!parsed.success) {
			return fail(400, { error: 'Pick a step and a scope, and enter a prompt to regenerate.' });
		}
		if (!manual.steps.some((step) => step.id === parsed.data.stepIds[0])) {
			return fail(400, { error: 'That step is not part of this manual.' });
		}

		try {
			await enqueueJob(locals.db, {
				manualId: manual.id,
				type: 'regenerate',
				payload: parsed.data
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(500, { error: `Could not start regeneration: ${message}` });
		}

		return { regenerateQueued: true };
	}
};
