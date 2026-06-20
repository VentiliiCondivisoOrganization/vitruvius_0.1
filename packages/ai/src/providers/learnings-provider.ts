import type { ManualStep } from '@vitruvius/core';
import { buildDistillPrompt } from '../learnings/prompt.js';
import { learningsResponseSchema } from '../learnings/schema.js';
import type { RawLearning } from '../learnings/types.js';
import type { LearningsProvider, LearningsProviderContext } from './learnings-types.js';

/**
 * Deterministic fallback when no API key is configured. Treats recurring step
 * `warnings` as the only generalizable signal (safety cautions transfer across
 * assemblies); the distiller's noise filter still strips any per-video text. No
 * model call, no invented heuristics.
 */
export class HeuristicLearningsProvider implements LearningsProvider {
	readonly name = 'heuristic';

	distill(steps: ManualStep[], _context: LearningsProviderContext): Promise<RawLearning[]> {
		const seen = new Set<string>();
		const out: RawLearning[] = [];
		for (const step of steps) {
			for (const warning of step.warnings) {
				const text = warning.trim();
				const key = text.toLowerCase();
				if (text && !seen.has(key)) {
					seen.add(key);
					out.push({ scope: 'warning', text });
				}
			}
		}
		return Promise.resolve(out);
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

/** Text-only distiller — reads the finished steps and proposes generalizable heuristics. */
export class GeminiLearningsProvider implements LearningsProvider {
	readonly name = 'gemini';
	private readonly apiKey: string;
	private readonly model: string;
	private readonly fetchFn: typeof fetch;

	constructor(options?: { apiKey?: string; model?: string; fetchFn?: typeof fetch }) {
		const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY is required for GeminiLearningsProvider');
		}
		this.apiKey = apiKey;
		this.model = options?.model ?? process.env.GEMINI_LEARNINGS_MODEL ?? DEFAULT_GEMINI_MODEL;
		this.fetchFn = options?.fetchFn ?? fetch;
	}

	async distill(steps: ManualStep[], context: LearningsProviderContext): Promise<RawLearning[]> {
		const { system, user } = buildDistillPrompt(steps, context.existingLearnings);

		const body: GeminiGenerateRequest = {
			systemInstruction: { parts: [{ text: system }] },
			contents: [{ role: 'user', parts: [{ text: user }] }],
			generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
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
				`Gemini distill call failed (${response.status}): ${payload.error?.message ?? response.statusText}`
			);
		}

		const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!text) {
			throw new Error('Gemini distill call returned empty content');
		}

		const parsed = learningsResponseSchema.parse(JSON.parse(text));
		return parsed.learnings;
	}
}

export function createLearningsProvider(): LearningsProvider {
	if (process.env.GEMINI_API_KEY) {
		return new GeminiLearningsProvider();
	}
	return new HeuristicLearningsProvider();
}

/** Override for tests — inject a custom provider factory. */
let providerFactory: () => LearningsProvider = createLearningsProvider;

export function setLearningsProviderFactory(factory: () => LearningsProvider): void {
	providerFactory = factory;
}

export function resetLearningsProviderFactory(): void {
	providerFactory = createLearningsProvider;
}

export function getLearningsProvider(): LearningsProvider {
	return providerFactory();
}
