import { error } from '@sveltejs/kit';
import { getManual } from '@vitruvius/db';
import type { PageServerLoad } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params, locals }) => {
	// id maps to a uuid column; a non-uuid would make the query error (500) rather
	// than a clean 404, so reject it up front.
	if (!UUID_RE.test(params.id)) error(404, 'Manual not found');

	const manual = await getManual(locals.db, params.id);
	if (!manual) error(404, 'Manual not found');

	return {
		manual: {
			id: manual.id,
			title: manual.title,
			status: manual.status,
			createdAt: manual.createdAt
		}
	};
};
