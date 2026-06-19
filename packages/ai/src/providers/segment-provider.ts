import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Keyframe } from '@vitruvius/media';
import type { RawSegment, SegmentWindow } from '../segment/types.js';
import { buildSegmentPrompt } from '../segment/prompt.js';
import { segmentResponseSchema } from '../segment/schema.js';
import type { SegmentProvider, SegmentProviderContext } from './types.js';

/** Deterministic fallback when no API key is configured — uses ffmpeg scene boundaries. */
export class HeuristicSegmentProvider implements SegmentProvider {
	readonly name = 'heuristic';

	segmentWindow(window: SegmentWindow, _context: SegmentProviderContext): Promise<RawSegment[]> {
		const scenes =
			window.scenes.length > 0
				? window.scenes
				: [{ startMs: window.startMs, endMs: window.endMs }];

		const steps: RawSegment[] = scenes.map((scene, index) => ({
			order: index,
			startMs: scene.startMs,
			endMs: scene.endMs,
			confidence: 0.55,
			sourceNotes: [
				`scene boundary ${scene.startMs}ms–${scene.endMs}ms from ffmpeg scene detection`,
				'heuristic segmenter — no model call (GEMINI_API_KEY absent or provider override)'
			],
			label: `Step ${index + 1}`
		}));

		return Promise.resolve(steps);
	}
}

type GeminiPart =
	| { text: string }
	| { inlineData: { mimeType: string; data: string } };

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
const MAX_KEYFRAMES_PER_CALL = 12;

export class GeminiSegmentProvider implements SegmentProvider {
	readonly name = 'gemini';
	private readonly apiKey: string;
	private readonly model: string;
	private readonly fetchFn: typeof fetch;

	constructor(options?: { apiKey?: string; model?: string; fetchFn?: typeof fetch }) {
		const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY;
		if (!apiKey) {
			throw new Error('GEMINI_API_KEY is required for GeminiSegmentProvider');
		}
		this.apiKey = apiKey;
		this.model = options?.model ?? process.env.GEMINI_SEGMENT_MODEL ?? DEFAULT_GEMINI_MODEL;
		this.fetchFn = options?.fetchFn ?? fetch;
	}

	async segmentWindow(
		window: SegmentWindow,
		context: SegmentProviderContext
	): Promise<RawSegment[]> {
		const keyframes = pickKeyframesForCall(window.keyframes, MAX_KEYFRAMES_PER_CALL);
		const imageParts = await loadKeyframeParts(keyframes);
		const { system, user } = buildSegmentPrompt(window, context.videoDurationMs, context.learnings);

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
				`Gemini segment call failed (${response.status}): ${payload.error?.message ?? response.statusText}`
			);
		}

		const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
		if (!text) {
			throw new Error('Gemini segment call returned empty content');
		}

		const parsed = segmentResponseSchema.parse(JSON.parse(text));
		return parsed.steps.map((step, index) => ({
			...step,
			order: index,
			sourceNotes: step.sourceNotes.map((note) =>
				note.includes('window') ? note : `${note} (window ${window.startMs}–${window.endMs}ms)`
			)
		}));
	}
}

function pickKeyframesForCall(keyframes: Keyframe[], max: number): Keyframe[] {
	if (keyframes.length <= max) return keyframes;
	const stride = Math.ceil(keyframes.length / max);
	return keyframes.filter((_, i) => i % stride === 0).slice(0, max);
}

async function loadKeyframeParts(keyframes: Keyframe[]): Promise<GeminiPart[]> {
	const parts: GeminiPart[] = [];
	for (const kf of keyframes) {
		try {
			const bytes = await readFile(kf.fileRef);
			parts.push({
				inlineData: {
					mimeType: mimeFromPath(kf.fileRef),
					data: bytes.toString('base64')
				}
			});
			parts.push({ text: `Keyframe at ${kf.atMs}ms (${basename(kf.fileRef)})` });
		} catch {
			parts.push({ text: `(keyframe unavailable at ${kf.atMs}ms: ${kf.fileRef})` });
		}
	}
	return parts;
}

function mimeFromPath(path: string): string {
	const ext = path.split('.').pop()?.toLowerCase();
	if (ext === 'png') return 'image/png';
	if (ext === 'webp') return 'image/webp';
	return 'image/jpeg';
}

export function createSegmentProvider(): SegmentProvider {
	if (process.env.GEMINI_API_KEY) {
		return new GeminiSegmentProvider();
	}
	return new HeuristicSegmentProvider();
}

/** Override for tests — inject a custom provider factory. */
let providerFactory: () => SegmentProvider = createSegmentProvider;

export function setSegmentProviderFactory(factory: () => SegmentProvider): void {
	providerFactory = factory;
}

export function resetSegmentProviderFactory(): void {
	providerFactory = createSegmentProvider;
}

export function getSegmentProvider(): SegmentProvider {
	return providerFactory();
}
