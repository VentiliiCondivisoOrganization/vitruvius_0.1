import type { InstructionManual } from '@vitruvius/core';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderManualHtml } from './html.js';

export type RenderPdfOptions = {
	/** Directory to write the PDF into. Defaults to a fresh OS temp directory. */
	outDir?: string;
	/**
	 * Path to a Chromium executable. Defaults to `PLAYWRIGHT_CHROMIUM_PATH` (the engine
	 * container provides the browser). `playwright-core` ships no bundled browser, so an
	 * executable must be available at runtime.
	 */
	executablePath?: string;
};

/**
 * Render a manual to a PDF file via headless Chromium (spec 09). Engine-only: Playwright
 * and a Chromium binary live in the engine container, never in `apps/web`. The browser
 * import is dynamic so importing this package for `renderManualHtml` alone pulls in no
 * Playwright code. Returns the local path to the written PDF; the caller stores it.
 */
export async function renderManualPdf(
	manual: InstructionManual,
	options: RenderPdfOptions = {}
): Promise<{ fileRef: string }> {
	const html = renderManualHtml(manual);

	const { chromium } = await import('playwright-core');
	const browser = await chromium.launch({
		executablePath: options.executablePath ?? process.env.PLAYWRIGHT_CHROMIUM_PATH,
		args: ['--no-sandbox']
	});

	try {
		const page = await browser.newPage();
		await page.setContent(html, { waitUntil: 'networkidle' });

		const dir = options.outDir ?? (await mkdtemp(join(tmpdir(), 'vitruvius-export-')));
		const fileRef = join(dir, `${manual.id}.pdf`);
		await page.pdf({ path: fileRef, format: 'A4', printBackground: true });

		return { fileRef };
	} finally {
		await browser.close();
	}
}
