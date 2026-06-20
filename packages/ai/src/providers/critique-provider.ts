import type { ManualStep } from '@vitruvius/core';
import { buildCritiquePrompt } from '../critique/prompt.js';
import { critiqueResponseSchema } from '../critique/schema.js';
import type { RawCritique } from '../critique/types.js';
import type { CritiqueProvider, CritiqueProviderContext } from './critique-types.js';

const UNSUPPORTED_CONFIDENCE = 0.2;

/**
 * Deterministic fallback when no API key is configured. Flags a step whose instruction has
 * no backing source note (or no instruction at all) and downgrades its confidence; leaves
 * well-supported steps untouched. No model call, no invented critique.
 */
export class HeuristicCritiqueProvider implements CritiqueProvider {
	readonly name = 'heuristic';

	critiqueSteps(steps: ManualStep[], _context: CritiqueProviderContext): Promise<RawCritique[]> {
		const verdicts: RawCritique[] = steps.map((step) => {
			const hasInstruction = step.instruction.trim().length > 0;
			const hasEvidence = step.sourceNotes.some((n) => n.trim().length > 0);

			if (!hasInstruction) {
				return {
					order: step.order,
					confidence: Math.min(step.confidence, UNSUPPORTED_CONFIDENCE),
					critique: ['Step has no instruction text to evaluate.']
				};
			}
			if (!hasEvidence) {
				return {
					order: step.order,
					confidence: Math.min(step.confidence, UNSUPPORTED_CONFIDENCE),
					critique: ['Instruction is not backed by any source note.']
				};
			}
			return { order: step.order, confidence: step.confidence, critique: [] };
		});

		return Promise.resolve(verdicts);
	}
}

type GeminiPart = { text: string };

type GeminiGenerateRequest = {
	contents: { role: string; parts: GeminiPart[] }[];
	generationConfig: { responseMimeType: string; temperature: number };
	systemInstruction?: { parts: { text: string }[] };
};

type GeminiGenerateResponse = {
	candidates?: { content?: { parts?: { text?: string }[] } }[];
	error?: { message: string };
};

const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';

/** Text-only Critic — judges from the steps' own fields and never re-watches the video. */
export class GeminiCritiqueProvider implements CritiqueProvider {
	readonly name = 'gemini';
	private readonly apiKey: string;
	private readonly model: string;
	private readonly fetchFn: typeof fetch;

	constructor(options?: { apiKey?: string; model?: string; fetchFn?: typeof fetch }) {
		const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY is required for GeminiCritiqueProvider');
		}
		this.apiKey = apiKey;
		this.model = options?.model ?? process.env.GEMINI_CRITIC_MODEL ?? DEFAULT_GEMINI_MODEL;
		this.fetchFn = options?.fetchFn ?? fetch;
	}

	async critiqueSteps(
		steps: ManualStep[],
		context: CritiqueProviderContext
	): Promise<RawCritique[]> {
		const { system, user } = buildCritiquePrompt(steps, context.learnings);

		const body: GeminiGenerateRequest = {
			systemInstruction: { parts: [{ text: system }] },
			contents: [{ role: 'user', parts: [{ text: user }] }],
			// Low temperature: the Critic should be consistent, not creative.
			generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
		};

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
		const response = await this.fetchFn(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});

		const payload = (await response.json()) as GeminiGenerateResponse;
		if (!response.ok) {
			throw new Error(
				`Gemini critique call failed (${response.status}): ${payload.error?.message ?? response.statusText}`
			);
		}

		const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!text) {
			throw new Error('Gemini critique call returned empty content');
		}

		const parsed = critiqueResponseSchema.parse(JSON.parse(text));
		return parsed.steps;
	}
}

export function createCritiqueProvider(): CritiqueProvider {
	if (process.env.GEMINI_API_KEY) {
		return new GeminiCritiqueProvider();
	}
	return new HeuristicCritiqueProvider();
}

/** Override for tests — inject a custom provider factory. */
let providerFactory: () => CritiqueProvider = createCritiqueProvider;

export function setCritiqueProviderFactory(factory: () => CritiqueProvider): void {
	providerFactory = factory;
}

export function resetCritiqueProviderFactory(): void {
	providerFactory = createCritiqueProvider;
}

export function getCritiqueProvider(): CritiqueProvider {
	return providerFactory();
}
