/** One row parsed from a BOM file before reconcile with CAD (spec 13). */
export type ParsedBomRow = {
	bomCode?: string;
	partName: string;
	description: string;
	quantity?: number;
};
