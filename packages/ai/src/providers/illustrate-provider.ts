import { buildIllustratePrompt } from '../illustrate/prompt.js';
import type { RawIllustration } from '../illustrate/types.js';
import type {
	IllustrateProvider,
	IllustrateProviderContext,
	IllustrationRequest
} from './illustrate-types.js';
import { loadImageBase64, mimeFromPath, type GeminiPart } from './keyframe-parts.js';

/**
 * Deterministic fallback when no API key is configured. It cannot synthesise a schematic,
 * so it degrades to reusing the step's base image (keyframe or canonical view) as a
 * placeholder illustration — credit-free and traceable. Steps whose base image cannot be
 * read are declined (returned shorter), and the orchestrator passes them through.
 */
export class HeuristicIllustrateProvider implements IllustrateProvider {
	readonly name = 'heuristic';

	async illustrate(
		requests: IllustrationRequest[],
		_context: IllustrateProviderContext
	): Promise<RawIllustration[]> {
		const out: RawIllustration[] = [];
		for (const req of requests) {
			try {
				const imageBase64 = await loadImageBase64(req.baseImageRef);
				out.push({ order: req.step.order, imageBase64, mimeType: mimeFromPath(req.baseImageRef) });
			} catch {
				// Base image unavailable — decline this step rather than fail the run.
			}
		}
		return out;
	}
}

type GeminiGenerateRequest = {
	contents: { role: string; parts: GeminiPart[] }[];
	generationConfig: { responseModalities: string[]; temperature: number };
};

type GeminiInlinePart = { inlineData?: { mimeType?: string; data?: string }; text?: string };

type GeminiGenerateResponse = {
	candidates?: { content?: { parts?: GeminiInlinePart[] } }[];
	error?: { message: string };
};

const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';

/**
 * Gemini image-generation provider. One call per step (image models emit a single image
 * per request); the agent's cache prevents re-billing identical steps. Returns the inline
 * image bytes for the orchestrator to persist as a file ref.
 */
export class GeminiIllustrateProvider implements IllustrateProvider {
	readonly name = 'gemini';
	private readonly apiKey: string;
	private readonly model: string;
	private readonly fetchFn: typeof fetch;

	constructor(options?: { apiKey?: string; model?: string; fetchFn?: typeof fetch }) {
		const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY is required for GeminiIllustrateProvider');
		}
		this.apiKey = apiKey;
		this.model =
			options?.model ?? process.env.GEMINI_ILLUSTRATE_MODEL ?? DEFAULT_GEMINI_IMAGE_MODEL;
		this.fetchFn = options?.fetchFn ?? fetch;
	}

	async illustrate(
		requests: IllustrationRequest[],
		_context: IllustrateProviderContext
	): Promise<RawIllustration[]> {
		const out: RawIllustration[] = [];
		for (const req of requests) {
			const illustration = await this.illustrateOne(req);
			if (illustration) out.push(illustration);
		}
		return out;
	}

	private async illustrateOne(req: IllustrationRequest): Promise<RawIllustration | null> {
		const baseImage = await loadImageBase64(req.baseImageRef, this.fetchFn);
		const prompt = buildIllustratePrompt(req.step, req.mode);

		const body: GeminiGenerateRequest = {
			contents: [
				{
					role: 'user',
					parts: [
						{ inlineData: { mimeType: mimeFromPath(req.baseImageRef), data: baseImage } },
						{ text: prompt }
					]
				}
			],
			generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.2 }
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
				`Gemini illustrate call failed (${response.status}): ${payload.error?.message ?? response.statusText}`
			);
		}

		const imagePart = payload.candidates?.[0]?.content?.parts?.find(
			(p): p is { inlineData: { mimeType?: string; data: string } } =>
				typeof p.inlineData?.data === 'string'
		);
		if (!imagePart) return null;

		return {
			order: req.step.order,
			imageBase64: imagePart.inlineData.data,
			mimeType: imagePart.inlineData.mimeType ?? 'image/png'
		};
	}
}

export function createIllustrateProvider(): IllustrateProvider {
	if (process.env.GEMINI_API_KEY) {
		return new GeminiIllustrateProvider();
	}
	return new HeuristicIllustrateProvider();
}

/** Override for tests — inject a custom provider factory. */
let providerFactory: () => IllustrateProvider = createIllustrateProvider;

export function setIllustrateProviderFactory(factory: () => IllustrateProvider): void {
	providerFactory = factory;
}

export function resetIllustrateProviderFactory(): void {
	providerFactory = createIllustrateProvider;
}

export function getIllustrateProvider(): IllustrateProvider {
	return providerFactory();
}
