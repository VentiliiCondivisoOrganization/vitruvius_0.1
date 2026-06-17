// TODO(spec 04-media): implement the ffmpeg wrappers (keyframe extraction, audio
// extraction, scene-change detection, clip splitting). Runs inside the engine
// container only — never imported by apps/web.

export type Keyframe = { atMs: number; fileRef: string };
export type Clip = { startMs: number; endMs: number; fileRef: string };

export async function extractKeyframes(_videoPath: string): Promise<Keyframe[]> {
	throw new Error('not implemented');
}

export async function extractAudio(_videoPath: string): Promise<{ fileRef: string }> {
	throw new Error('not implemented');
}

export async function detectScenes(_videoPath: string): Promise<Clip[]> {
	throw new Error('not implemented');
}

export async function splitIntoClips(_videoPath: string): Promise<Clip[]> {
	throw new Error('not implemented');
}
