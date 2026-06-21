import { error } from '@sveltejs/kit';
import { getManual } from '@vitruvius/db';
// Import only the pure HTML renderer — the PDF path pulls in Playwright (engine-only),
// which must never enter the web bundle.
import { renderManualHtml } from '@vitruvius/export/html';
import type { RequestHandler } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Serve the standalone HTML rendering of a manual (spec 09). This is the same markup
// the engine prints to PDF, viewable directly in the browser.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!UUID_RE.test(params.id)) error(404, 'Manual not found');

	const manual = await getManual(locals.db, params.id);
	if (!manual) error(404, 'Manual not found');
	// Only a finished manual renders meaningfully; non-ready ones would expose
	// partial/empty output, so gate this the same way the export UI does.
	if (manual.status !== 'ready') error(409, 'Manual is not ready to export');

	return new Response(renderManualHtml(manual), {
		headers: { 'content-type': 'text/html; charset=utf-8' }
	});
};
