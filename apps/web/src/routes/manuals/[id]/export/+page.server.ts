import { error, fail } from '@sveltejs/kit';
import { checkExportGate } from '@vitruvius/core';
import { enqueueJob, getManual } from '@vitruvius/db';
import type { Actions, PageServerLoad } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXPORT_BUCKET = 'exports';
const SIGNED_URL_TTL_S = 60;

function exportObjectKey(manualId: string): string {
	return `${manualId}.pdf`;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!UUID_RE.test(params.id)) fail(404, 'Manual not found');

	const manual = await getManual(locals.db, params.id);
	if (!manual) error(404, 'Manual not found');

	const gate = checkExportGate(manual);

	const { data } = await locals.db.storage
		.from(EXPORT_BUCKET)
		.createSignedUrl(exportObjectKey(manual.id), SIGNED_URL_TTL_S);

	return {
		manual: { id: manual.id, title: manual.title, status: manual.status },
		downloadUrl: data?.signedUrl ?? null,
		exportBlockedReason: gate.ok ? null : gate.reason
	};
};

export const actions: Actions = {
	default: async ({ params, locals }) => {
		if (!UUID_RE.test(params.id)) return fail(404, { error: 'Manual not found' });

		const manual = await getManual(locals.db, params.id);
		if (!manual) return fail(404, { error: 'Manual not found' });
		if (manual.status !== 'ready') {
			return fail(409, { error: 'Manual is not ready to export yet.' });
		}

		const gate = checkExportGate(manual);
		if (!gate.ok) {
			return fail(409, { error: gate.reason });
		}

		try {
			await enqueueJob(locals.db, { manualId: manual.id, type: 'export' });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'unknown error';
			return fail(500, { error: `Could not start export: ${message}` });
		}

		return { queued: true };
	}
};
