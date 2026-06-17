import type { InstructionManual } from '@vitruvius/core';

// TODO(spec 09-export): implement the HTML template that renders an InstructionManual
// and the Playwright print-to-PDF step. Playwright runs inside the engine container only.

export function renderManualHtml(_manual: InstructionManual): string {
	throw new Error('not implemented');
}

export async function renderManualPdf(_manual: InstructionManual): Promise<{ fileRef: string }> {
	throw new Error('not implemented');
}
