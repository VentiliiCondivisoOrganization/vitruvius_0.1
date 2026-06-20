// Deterministic, kernel-free parse of STEP (ISO 10303-21, AP203/214/242) product
// structure into a bill of materials + assembly tree. We never evaluate geometry; we read
// the *administrative* entities that carry the named-part vocabulary an IKEA-style manual
// needs:
//
//   PRODUCT / PRODUCT_DEFINITION_FORMATION / PRODUCT_DEFINITION   — the parts (names + ids)
//   NEXT_ASSEMBLY_USAGE_OCCURRENCE (NAUO)                         — parent→child edges
//   FILE_SCHEMA / FILE_NAME header                                — schema + originating system
//   *_UNIT (SI_UNIT / CONVERSION_BASED_UNIT)                      — declared length unit
//
// The BOM aggregates occurrences per product (quantity = how many NAUO edges point at it,
// or 1 for a part that only appears as a root). This is auxiliary priming, so a partial
// parse is still useful: anything we can't resolve is skipped, never thrown.

import type { AssemblyNode, BomItem, DigitalModelSource } from '@vitruvius/core';
import { decodeStepString } from './step-strings.js';

export interface StepParseResult {
	source: DigitalModelSource;
	bom: BomItem[];
	assembly: AssemblyNode[];
}

interface Entity {
	id: string; // "#123"
	type: string; // uppercased keyword, e.g. "PRODUCT"
	args: string; // raw argument text inside the outer parens
}

// Split the file into header and DATA bodies. STEP layout is
//   ISO-10303-21; HEADER; …ENTITIES…; ENDSEC; DATA; …ENTITIES…; ENDSEC; END-ISO-10303-21;
function sectionBetween(text: string, start: string, end: string): string {
	const s = text.indexOf(start);
	if (s === -1) return '';
	const from = s + start.length;
	const e = text.indexOf(end, from);
	return text.slice(from, e === -1 ? undefined : e);
}

// Parse "#id = TYPE( args );" statements from a section body. Strips comments first.
// Splits on top-level ';' so nested parens/strings don't break entity boundaries.
function parseEntities(body: string): Entity[] {
	const noComments = body.replace(/\/\*[\s\S]*?\*\//g, '');
	const entities: Entity[] = [];
	const headRe = /^\s*(#\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/;

	for (const stmt of splitTopLevel(noComments, ';')) {
		const head = headRe.exec(stmt);
		if (!head) continue;
		const id = head[1]!;
		const type = head[2]!.toUpperCase();
		// args = everything between the first '(' and its matching ')'.
		const open = stmt.indexOf('(');
		const args = stmt.slice(open + 1, stmt.lastIndexOf(')'));
		entities.push({ id, type, args });
	}
	return entities;
}

// Split on a separator that sits at paren-depth 0 and outside single-quoted strings.
function splitTopLevel(text: string, sep: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let inStr = false;
	let buf = '';
	for (let i = 0; i < text.length; i++) {
		const c = text[i]!;
		if (inStr) {
			buf += c;
			if (c === "'") {
				// A doubled quote stays inside the string.
				if (text[i + 1] === "'") {
					buf += "'";
					i++;
				} else inStr = false;
			}
			continue;
		}
		if (c === "'") {
			inStr = true;
			buf += c;
			continue;
		}
		if (c === '(') depth++;
		else if (c === ')') depth--;
		if (c === sep && depth === 0) {
			parts.push(buf);
			buf = '';
			continue;
		}
		buf += c;
	}
	if (buf.trim()) parts.push(buf);
	return parts;
}

// Pull the quoted string literals out of an argument list, in order, decoded.
function stringArgs(args: string): string[] {
	const out: string[] = [];
	const re = /'((?:[^']|'')*)'/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(args)) !== null) out.push(decodeStepString(m[1]!));
	return out;
}

// Pull entity references (#123) out of an argument list, in order.
function refArgs(args: string): string[] {
	return args.match(/#\d+/g) ?? [];
}

function parseHeader(header: string): { schema: string | null; system: string | null } {
	const entities = parseEntities(
		// HEADER entities have the form `FILE_SCHEMA((...));` — no leading `#id =`, so
		// rewrite them to the parseable form before reusing the entity parser.
		header.replace(/(^|;)\s*([A-Za-z0-9_]+)\s*\(/g, '$1 #0 = $2 (')
	);
	let schema: string | null = null;
	let system: string | null = null;
	for (const e of entities) {
		if (e.type === 'FILE_SCHEMA') {
			const s = stringArgs(e.args)[0];
			if (s) schema = s.replace(/\s*\{.*$/, '').trim() || s.trim();
		}
		if (e.type === 'FILE_NAME') {
			// FILE_NAME(name, time, author, org, preprocessor, originating_system, authorization)
			const strs = stringArgs(e.args);
			const originating = strs[5];
			if (originating) system = originating;
		}
	}
	return { schema, system };
}

// Units live in SI_UNIT(...). In AP214 these are often wrapped in an anonymous *complex*
// entity — `#40 = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) );` — which has
// no top-level `#id = TYPE(` head, so it isn't in the parsed entity table. We therefore
// scan the raw data body for the SI_UNIT length directive directly.
function parseUnits(dataBody: string): string | null {
	const si = /SI_UNIT\s*\(\s*(?:\.(\w+)\.|\$)\s*,\s*\.METRE\./.exec(dataBody);
	if (si) return si[1] ? `${si[1]} METRE` : 'METRE';
	const named = /\b(MILLI\s*METRE|MILLIMETRE|METRE|INCH|FOOT)\b/i.exec(dataBody);
	return named ? named[1]!.toUpperCase().replace(/\s+/g, ' ') : null;
}

export function parseStep(text: string): StepParseResult {
	const header = sectionBetween(text, 'HEADER;', 'ENDSEC;');
	const data = sectionBetween(text, 'DATA;', 'END-ISO-10303-21');
	const dataBody = sectionBetween(`DATA;${data}`, 'DATA;', 'ENDSEC;') || data;

	const entities = parseEntities(dataBody);
	const byId = new Map<string, Entity>();
	for (const e of entities) byId.set(e.id, e);

	const { schema, system } = parseHeader(header);
	const units = parseUnits(dataBody);

	// product id -> display name. Prefer PRODUCT.name; fall back to PRODUCT_DEFINITION.
	const productName = new Map<string, string>();
	for (const e of entities) {
		if (e.type === 'PRODUCT') {
			const name = stringArgs(e.args)[0];
			if (name) productName.set(e.id, name);
		}
	}

	// Resolve a PRODUCT_DEFINITION (#pd) back to its PRODUCT id by walking
	// PRODUCT_DEFINITION -> PRODUCT_DEFINITION_FORMATION -> PRODUCT.
	const formationToProduct = new Map<string, string>();
	for (const e of entities) {
		if (e.type === 'PRODUCT_DEFINITION_FORMATION') {
			const product = refArgs(e.args).at(-1);
			if (product) formationToProduct.set(e.id, product);
		}
	}
	const defToProduct = new Map<string, string>();
	for (const e of entities) {
		if (e.type === 'PRODUCT_DEFINITION') {
			// PRODUCT_DEFINITION(id, desc, formation_ref, frame_ref)
			const refs = refArgs(e.args);
			const formation = refs.find((r) => formationToProduct.has(r));
			const product = formation ? formationToProduct.get(formation) : undefined;
			if (product) defToProduct.set(e.id, product);
		}
	}

	// Assembly edges from NAUO: relating (parent) -> related (child), both PRODUCT_DEFINITION.
	const edges: Array<{ parent: string; child: string }> = [];
	for (const e of entities) {
		if (e.type === 'NEXT_ASSEMBLY_USAGE_OCCURRENCE') {
			// NAUO(id, name, desc, relating_pd, related_pd) — the two refs are the products.
			const refs = refArgs(e.args).filter((r) => defToProduct.has(r));
			if (refs.length >= 2) edges.push({ parent: refs[0]!, child: refs[1]! });
		}
	}

	// Build the assembly tree keyed by product id (stable across PD aliases).
	const nodes = new Map<string, AssemblyNode>();
	const ensure = (def: string): AssemblyNode | undefined => {
		const product = defToProduct.get(def);
		if (!product) return undefined;
		let node = nodes.get(product);
		if (!node) {
			node = { sourceId: product, name: productName.get(product) ?? product, children: [] };
			nodes.set(product, node);
		}
		return node;
	};

	const childOccurrences = new Map<string, number>(); // product id -> occurrence count
	for (const { parent, child } of edges) {
		const p = ensure(parent);
		const c = ensure(child);
		if (!p || !c) continue;
		p.children.push(c.sourceId);
		childOccurrences.set(c.sourceId, (childOccurrences.get(c.sourceId) ?? 0) + 1);
	}

	// Make sure every named product is represented as a node, even leaves with no edges.
	for (const [productId, name] of productName) {
		if (!nodes.has(productId)) nodes.set(productId, { sourceId: productId, name, children: [] });
	}

	// Root-first ordering: roots (never a child) come first, then the rest by id.
	const assembly = [...nodes.values()].sort((a, b) => {
		const ra = childOccurrences.has(a.sourceId) ? 1 : 0;
		const rb = childOccurrences.has(b.sourceId) ? 1 : 0;
		if (ra !== rb) return ra - rb;
		return idNum(a.sourceId) - idNum(b.sourceId);
	});

	// BOM: one line per named product. Quantity = total occurrences across the assembly,
	// or 1 when the product only appears as a root (no incoming edge).
	const bom: BomItem[] = [...productName.entries()]
		.map(([productId, name]) => ({
			name,
			quantity: childOccurrences.get(productId) ?? 1,
			sourceId: productId
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

	return {
		source: { format: 'step', system, units, schema },
		bom,
		assembly
	};
}

function idNum(id: string): number {
	return Number.parseInt(id.replace('#', ''), 10) || 0;
}
