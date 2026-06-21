import type { DigitalModel, ManualBomItem } from '@vitruvius/core';
import { randomUUID } from 'node:crypto';
import type { ParsedBomRow } from './types.js';

function normalize(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/**
 * Merge CAD-derived BOM (spec 12) with optional file rows into manual-scope items.
 * Matching uses normalized part name or bom code; file-only rows get `source: 'file'`.
 */
export function reconcileBom(
	digitalModel: DigitalModel | null,
	fileRows: ParsedBomRow[]
): ManualBomItem[] {
	const items: ManualBomItem[] = [];
	const byName = new Map<string, ManualBomItem>();
	const byCode = new Map<string, ManualBomItem>();

	if (digitalModel?.status === 'primed') {
		for (const row of digitalModel.bom) {
			const item: ManualBomItem = {
				id: randomUUID(),
				partName: row.name,
				description: row.name,
				quantity: row.quantity,
				source: 'cad',
				cadSourceId: row.sourceId
			};
			items.push(item);
			byName.set(normalize(row.name), item);
		}
	}

	for (const row of fileRows) {
		const normName = normalize(row.partName);
		const normCode = row.bomCode ? normalize(row.bomCode) : '';
		const existing =
			(normCode && byCode.get(normCode)) ?? (normName && byName.get(normName)) ?? null;

		if (existing) {
			if (row.bomCode) existing.bomCode = row.bomCode;
			if (row.description.trim()) existing.description = row.description.trim();
			if (row.quantity !== undefined) existing.quantity = row.quantity;
			continue;
		}

		const item: ManualBomItem = {
			id: randomUUID(),
			partName: row.partName,
			bomCode: row.bomCode,
			description: row.description.trim() || row.partName,
			quantity: row.quantity,
			source: 'file'
		};
		items.push(item);
		if (normName) byName.set(normName, item);
		if (normCode) byCode.set(normCode, item);
	}

	return items;
}
