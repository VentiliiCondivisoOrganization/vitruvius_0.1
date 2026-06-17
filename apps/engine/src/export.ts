import type { Job } from '@vitruvius/core';

// TODO(spec 09-export): render the manual HTML (packages/export) and print it to PDF
// with Playwright, then store the PDF in Supabase Storage.
export async function handleExportJob(_job: Job): Promise<void> {
	throw new Error('not implemented');
}
