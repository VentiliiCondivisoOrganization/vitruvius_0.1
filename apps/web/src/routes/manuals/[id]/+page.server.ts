import { error } from '@sveltejs/kit';
import { getManual } from '@vitruvius/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
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
