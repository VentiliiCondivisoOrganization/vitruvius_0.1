import { readFile } from 'node:fs/promises';
import type { ParsedBomRow } from './types.js';

const CODE_HEADERS = new Set([
	'part_number',
	'partnumber',
	'bom_code',
	'code',
	'sku',
	'item',
	'partno',
	'part_no',
	'articolo',
	'codice'
]);
const NAME_HEADERS = new Set([
	'part_name',
	'partname',
	'name',
	'part',
	'component',
	'componente',
	'descrizione_breve'
]);
const DESC_HEADERS = new Set(['description', 'desc', 'descrizione', 'notes']);
const QTY_HEADERS = new Set(['qty', 'quantity', 'count', 'qta', 'quantita']);

function normalizeHeader(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_');
}

function splitCsvLine(line: string): string[] {
	const cells: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i]!;
		if (ch === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i++;
			} else {
				inQuotes = !inQuotes;
			}
			continue;
		}
		if (ch === ',' && !inQuotes) {
			cells.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	cells.push(current.trim());
	return cells;
}

function parseQuantity(raw: string): number | undefined {
	const n = Number.parseInt(raw.trim(), 10);
	return Number.isFinite(n) && n > 0 ? n : undefined;
}

function mapHeaderIndex(headers: string[]): {
	code?: number;
	name?: number;
	description?: number;
	quantity?: number;
} {
	const map: { code?: number; name?: number; description?: number; quantity?: number } = {};
	headers.forEach((header, index) => {
		const norm = normalizeHeader(header);
		if (CODE_HEADERS.has(norm)) map.code = index;
		else if (NAME_HEADERS.has(norm)) map.name = index;
		else if (DESC_HEADERS.has(norm)) map.description = index;
		else if (QTY_HEADERS.has(norm)) map.quantity = index;
	});
	return map;
}

/** Parse BOM CSV text into rows. Supports header row auto-detection. */
export function parseBomCsv(content: string): ParsedBomRow[] {
	const lines = content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith('#'));

	if (lines.length === 0) return [];

	const firstCells = splitCsvLine(lines[0]!);
	const headerMap = mapHeaderIndex(firstCells);
	const hasHeader = headerMap.name !== undefined || headerMap.code !== undefined;
	const dataLines = hasHeader ? lines.slice(1) : lines;
	const columns = hasHeader
		? headerMap
		: { code: 0, name: 1, description: 2, quantity: 3 as number | undefined };

	const rows: ParsedBomRow[] = [];
	for (const line of dataLines) {
		const cells = splitCsvLine(line);
		const partName = (columns.name !== undefined ? cells[columns.name] : cells[1])?.trim() ?? '';
		const bomCode = (columns.code !== undefined ? cells[columns.code] : cells[0])?.trim();
		const description =
			(columns.description !== undefined ? cells[columns.description] : cells[2])?.trim() ??
			partName;
		const qtyRaw = columns.quantity !== undefined ? cells[columns.quantity] : cells[3];

		if (!partName && !bomCode) continue;

		rows.push({
			bomCode: bomCode || undefined,
			partName: partName || bomCode || 'unknown part',
			description: description || partName || bomCode || '',
			quantity: qtyRaw ? parseQuantity(qtyRaw) : undefined
		});
	}

	return rows;
}

/** Read and parse a local BOM file (CSV). Other formats return an empty list. */
export async function parseBomFile(filePath: string): Promise<ParsedBomRow[]> {
	const lower = filePath.toLowerCase();
	if (!lower.endsWith('.csv')) return [];

	const content = await readFile(filePath, 'utf8');
	return parseBomCsv(content);
}
