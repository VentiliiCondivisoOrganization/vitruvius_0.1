import type { ManualStep } from '@vitruvius/core';
import type { BomDisambiguateInput, BomDisambiguateOptions } from '../bom-map/types.js';

export interface BomDisambiguateProvider {
	readonly name: string;
	disambiguate(input: BomDisambiguateInput, context: BomDisambiguateOptions): Promise<ManualStep[]>;
}

/** No model call — keep deterministic `candidateBomItemIds` as-is. */
export class HeuristicBomDisambiguateProvider implements BomDisambiguateProvider {
	readonly name = 'heuristic';

	disambiguate(
		input: BomDisambiguateInput,
		_context: BomDisambiguateOptions
	): Promise<ManualStep[]> {
		return Promise.resolve(input.steps);
	}
}

type GeminiPart = { text: string };

type GeminiGenerateRequest = {
	contents: { role: string; parts: GeminiPart[] }[];
	systemInstruction?: { parts: { text: string }[] };
	generationConfig?: { responseMimeType: string; temperature: number };
};

type GeminiGenerateResponse = {
	candidates?: { content?: { parts?: { text?: string }[] } }[];
};

type GeminiDisambiguateRow = {
	order: number;
	candidateBomItemIds: string[];
};

const PROMPT_VERSION = 'bom-disambiguate-v1';

/**
 * Optional Gemini pass for ambiguous steps: may narrow `candidateBomItemIds` using evidence,
 * but never sets a resolved `bomItemId` (spec 13 credit discipline + editor gate).
 */
export class GeminiBomDisambiguateProvider implements BomDisambiguateProvider {
	readonly name = 'gemini';

	constructor(private readonly apiKey: string) {}

	async disambiguate(
		input: BomDisambiguateInput,
		_context: BomDisambiguateOptions
	): Promise<ManualStep[]> {
		const ambiguous = input.steps.filter((step) => input.ambiguousStepOrders.includes(step.order));
		if (ambiguous.length === 0) return input.steps;

		const catalog = input.manualBom
			.map(
				(item) =>
					`- id=${item.id} code=${item.bomCode ?? ''} name=${item.partName} desc=${item.description}`
			)
			.join('\n');

		const stepLines = ambiguous
			.map((step) => {
				const part = step.parts.find((p) => (p.candidateBomItemIds?.length ?? 0) > 0);
				const candidates = part?.candidateBomItemIds ?? [];
				return `order=${step.order} evidence="${[step.title, ...step.sourceNotes].join(' ')}" candidates=[${candidates.join(', ')}]`;
			})
			.join('\n');

		const system = `You refine BOM disambiguation for Vitruvius assembly manuals.
Given step evidence and a candidate BOM id list, return ONLY ids that remain plausible.
Never pick a single winner — return a subset (or the same list). Never invent ids.
Return JSON: { "steps": [{ "order": number, "candidateBomItemIds": string[] }] }
Prompt version: ${PROMPT_VERSION}`;

		const user = `BOM catalog:\n${catalog}\n\nAmbiguous steps:\n${stepLines}`;

		const res = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					systemInstruction: { parts: [{ text: system }] },
					contents: [{ role: 'user', parts: [{ text: user }] }],
					generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
				} satisfies GeminiGenerateRequest)
			}
		);

		if (!res.ok) {
			return input.steps;
		}

		const payload = (await res.json()) as GeminiGenerateResponse;
		const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!text) return input.steps;

		let parsed: { steps?: GeminiDisambiguateRow[] };
		try {
			parsed = JSON.parse(text) as { steps?: GeminiDisambiguateRow[] };
		} catch {
			return input.steps;
		}

		const validIds = new Set(input.manualBom.map((item) => item.id));
		const byOrder = new Map<number, string[]>();
		for (const row of parsed.steps ?? []) {
			const ids = (row.candidateBomItemIds ?? []).filter((id) => validIds.has(id));
			if (ids.length > 0) byOrder.set(row.order, ids);
		}

		return input.steps.map((step) => {
			const narrowed = byOrder.get(step.order);
			if (!narrowed) return step;
			return {
				...step,
				parts: step.parts.map((part) =>
					part.candidateBomItemIds ? { ...part, candidateBomItemIds: narrowed } : part
				)
			};
		});
	}
}

let factory: (() => BomDisambiguateProvider) | null = null;

export function setBomDisambiguateProviderFactory(next: () => BomDisambiguateProvider): void {
	factory = next;
}

export function resetBomDisambiguateProviderFactory(): void {
	factory = null;
}

export function createBomDisambiguateProvider(): BomDisambiguateProvider {
	const key = process.env.GEMINI_API_KEY?.trim();
	if (key) return new GeminiBomDisambiguateProvider(key);
	return new HeuristicBomDisambiguateProvider();
}

export function getBomDisambiguateProvider(): BomDisambiguateProvider {
	return factory?.() ?? createBomDisambiguateProvider();
}
