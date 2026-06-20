import type { ManualStep } from '@vitruvius/core';
import { readFile } from 'node:fs/promises';
import { buildInstructPrompt } from '../instruct/prompt.js';
import { instructionResponseSchema } from '../instruct/schema.js';
import type { RawInstruction } from '../instruct/types.js';
import { mimeFromPath, type GeminiPart } from './keyframe-parts.js';
import type { InstructProvider, InstructProviderContext } from './instruct-types.js';

/**
 * Deterministic fallback when no API key is configured. Derives a minimal, fully
 * traceable instruction from the step's own evidence — no model call, no invented
 * tools/parts/warnings.
 */
export class HeuristicInstructProvider implements InstructProvider {
	readonly name = 'heuristic';

	writeInstructions(
		steps: ManualStep[],
		_context: InstructProviderContext
	): Promise<RawInstruction[]> {
		const out: RawInstruction[] = steps.map((step) => ({
			order: step.order,
			title: step.title?.trim() || `Step ${step.order + 1}`,
			instruction:
				step.sourceNotes[0]?.trim() ||
				`Perform the action shown from ${step.startMs}ms to ${step.endMs}ms.`,
			tools: [],
			parts: [],
			warnings: [],
			alternatives: []
		}));

		return Promise.resolve(out);
	}
}

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
const MAX_KEYFRAMES_PER_CALL = 16;

export class GeminiInstructProvider implements InstructProvider {
	readonly name = 'gemini';
	private readonly apiKey: string;
	private readonly model: string;
	private readonly fetchFn: typeof fetch;

	constructor(options?: { apiKey?: string; model?: string; fetchFn?: typeof fetch }) {
		const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY is required for GeminiInstructProvider');
		}
		this.apiKey = apiKey;
		this.model = options?.model ?? process.env.GEMINI_INSTRUCT_MODEL ?? DEFAULT_GEMINI_MODEL;
		this.fetchFn = options?.fetchFn ?? fetch;
	}

	async writeInstructions(
		steps: ManualStep[],
		context: InstructProviderContext
	): Promise<RawInstruction[]> {
		const imageParts = await this.loadStepKeyframeParts(steps);
		const { system, user } = buildInstructPrompt(steps, context.learnings);

		const body: GeminiGenerateRequest = {
			systemInstruction: { parts: [{ text: system }] },
			contents: [{ role: 'user', parts: [...imageParts, { text: user }] }],
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
				`Gemini instruct call failed (${response.status}): ${payload.error?.message ?? response.statusText}`
			);
		}

		const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!text) {
			throw new Error('Gemini instruct call returned empty content');
		}

		const parsed = instructionResponseSchema.parse(JSON.parse(text));
		return parsed.steps;
	}

	/** One keyframe still per step (down-sampled to a cap), labelled by step time. */
	private async loadStepKeyframeParts(steps: ManualStep[]): Promise<GeminiPart[]> {
		const withKeyframes = steps.filter((step) => step.keyframeUrl);
		const stride =
			withKeyframes.length > MAX_KEYFRAMES_PER_CALL
				? Math.ceil(withKeyframes.length / MAX_KEYFRAMES_PER_CALL)
				: 1;
		const sampled = withKeyframes.filter((_, i) => i % stride === 0).slice(0, MAX_KEYFRAMES_PER_CALL);

		const parts: GeminiPart[] = [];
		for (const step of sampled) {
			try {
				const data = await this.readKeyframe(step.keyframeUrl);
				parts.push({ inlineData: { mimeType: mimeFromPath(step.keyframeUrl), data } });
				parts.push({ text: `Keyframe for step order=${step.order} at ${step.startMs}ms` });
			} catch {
				parts.push({
					text: `(keyframe unavailable for step order=${step.order}: ${step.keyframeUrl})`
				});
			}
		}
		return parts;
	}

	private async readKeyframe(keyframeUrl: string): Promise<string> {
		const ref = keyframeUrl.startsWith('file://') ? keyframeUrl.slice('file://'.length) : keyframeUrl;
		if (/^https?:\/\//.test(ref)) {
			const res = await this.fetchFn(ref);
			if (!res.ok) throw new Error(`keyframe fetch failed (${res.status})`);
			return Buffer.from(await res.arrayBuffer()).toString('base64');
		}
		return (await readFile(ref)).toString('base64');
	}
}

export function createInstructProvider(): InstructProvider {
	if (process.env.GEMINI_API_KEY) {
		return new GeminiInstructProvider();
	}
	return new HeuristicInstructProvider();
}

/** Override for tests — inject a custom provider factory. */
let providerFactory: () => InstructProvider = createInstructProvider;

export function setInstructProviderFactory(factory: () => InstructProvider): void {
	providerFactory = factory;
}

export function resetInstructProviderFactory(): void {
	providerFactory = createInstructProvider;
}

export function getInstructProvider(): InstructProvider {
	return providerFactory();
}
