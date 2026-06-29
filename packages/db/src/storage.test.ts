import { describe, expect, it, vi } from 'vitest';
import type { DbClient } from './client.js';
import {
	deleteVideo,
	isR2Configured,
	manualMediaKey,
	presignManualMedia,
	presignManualMediaBatch,
	presignUploadParts,
	presignVideoGet,
	uploadManualMedia,
	uploadVideo
} from './storage.js';

const R2_ENV = {
	R2_ACCOUNT_ID: 'acct123',
	R2_ACCESS_KEY_ID: 'AKIAEXAMPLE',
	R2_SECRET_ACCESS_KEY: 'secretexamplekey',
	R2_BUCKET: 'vitruvius-videos'
};

describe('isR2Configured', () => {
	it('is true only when all four R2 vars are present', () => {
		expect(isR2Configured(R2_ENV)).toBe(true);
		expect(isR2Configured({})).toBe(false);
		const { R2_BUCKET: _omit, ...partial } = R2_ENV;
		expect(isR2Configured(partial)).toBe(false);
	});
});

describe('presignVideoGet', () => {
	it('signs an R2 URL offline when R2 is configured', async () => {
		// getSignedUrl is pure crypto — no network — so this runs without an R2 account.
		const url = await presignVideoGet({} as DbClient, 'manual-1/source.mp4', 600, R2_ENV);
		expect(url).toContain('acct123.r2.cloudflarestorage.com');
		expect(url).toContain('vitruvius-videos/manual-1/source.mp4');
		expect(url).toContain('X-Amz-Signature=');
	});

	it('falls back to a Supabase signed URL when R2 is unconfigured', async () => {
		const createSignedUrl = vi
			.fn()
			.mockResolvedValue({ data: { signedUrl: 'https://supabase/signed' }, error: null });
		const db = { storage: { from: () => ({ createSignedUrl }) } } as unknown as DbClient;

		const url = await presignVideoGet(db, 'manual-1/source.mp4', 600, {});
		expect(url).toBe('https://supabase/signed');
		expect(createSignedUrl).toHaveBeenCalledWith('manual-1/source.mp4', 600);
	});
});

describe('presignUploadParts', () => {
	it('signs one R2 UploadPart URL per part number (offline)', async () => {
		const sigs = await presignUploadParts(
			'manual-1/source.mp4',
			'upload-123',
			[1, 2, 3],
			600,
			R2_ENV
		);

		expect(sigs.map((s) => s.partNumber)).toEqual([1, 2, 3]);
		for (const sig of sigs) {
			expect(sig.url).toContain('vitruvius-videos/manual-1/source.mp4');
			expect(sig.url).toContain('uploadId=upload-123');
			expect(sig.url).toContain(`partNumber=${sig.partNumber}`);
			expect(sig.url).toContain('X-Amz-Signature=');
			// Regression: the SDK must NOT bake an x-amz-checksum-* into the presigned URL. It would
			// be computed over an empty body, so the browser's real part PUT would fail R2's checksum
			// check with a 403. WHEN_REQUIRED on the client keeps the URL checksum-free.
			expect(sig.url.toLowerCase()).not.toContain('checksum');
		}
	});

	it('throws when R2 is unconfigured (no Supabase multipart fallback)', async () => {
		await expect(presignUploadParts('k', 'u', [1], 600, {})).rejects.toThrow(/not configured/);
	});
});

describe('uploadVideo', () => {
	it('falls back to the Supabase videos bucket when R2 is unconfigured', async () => {
		const upload = vi.fn().mockResolvedValue({ error: null });
		const from = vi.fn(() => ({ upload }));
		const db = { storage: { from } } as unknown as DbClient;

		await uploadVideo(db, 'manual-1/source.mp4', Buffer.from('x'), 'video/mp4', {});
		expect(from).toHaveBeenCalledWith('videos');
		expect(upload).toHaveBeenCalledWith('manual-1/source.mp4', expect.any(Buffer), {
			contentType: 'video/mp4'
		});
	});

	it('throws when the Supabase fallback upload errors', async () => {
		const upload = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
		const db = { storage: { from: () => ({ upload }) } } as unknown as DbClient;

		await expect(uploadVideo(db, 'k', Buffer.from('x'), 'video/mp4', {})).rejects.toThrow(/boom/);
	});
});

describe('deleteVideo', () => {
	it('no-ops on an empty key list', async () => {
		const from = vi.fn();
		const db = { storage: { from } } as unknown as DbClient;
		await deleteVideo(db, [], {});
		expect(from).not.toHaveBeenCalled();
	});

	it('removes from the Supabase videos bucket when R2 is unconfigured', async () => {
		const remove = vi.fn().mockResolvedValue({ error: null });
		const from = vi.fn(() => ({ remove }));
		const db = { storage: { from } } as unknown as DbClient;

		await deleteVideo(db, ['manual-1/source.mp4'], {});
		expect(from).toHaveBeenCalledWith('videos');
		expect(remove).toHaveBeenCalledWith(['manual-1/source.mp4']);
	});

	it('is best-effort: swallows a delete error instead of throwing (rollback path)', async () => {
		const remove = vi.fn().mockRejectedValue(new Error('netfail'));
		const db = { storage: { from: () => ({ remove }) } } as unknown as DbClient;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		await expect(deleteVideo(db, ['k'], {})).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalled();
		warn.mockRestore();
	});
});

describe('manualMediaKey', () => {
	it('scopes the object key under the manual id and kind', () => {
		expect(manualMediaKey('manual-1', 'keyframes', 'keyframe-00003.jpg')).toBe(
			'manual-1/keyframes/keyframe-00003.jpg'
		);
		expect(manualMediaKey('manual-1', 'illustrations', 'illustration_2.png')).toBe(
			'manual-1/illustrations/illustration_2.png'
		);
	});
});

describe('uploadManualMedia', () => {
	it('uploads to the media bucket with upsert', async () => {
		const upload = vi.fn().mockResolvedValue({ error: null });
		const from = vi.fn(() => ({ upload }));
		const db = { storage: { from } } as unknown as DbClient;

		await uploadManualMedia(db, 'manual-1/keyframes/k.jpg', Buffer.from('x'), 'image/jpeg');
		expect(from).toHaveBeenCalledWith('media');
		expect(upload).toHaveBeenCalledWith('manual-1/keyframes/k.jpg', expect.any(Buffer), {
			contentType: 'image/jpeg',
			upsert: true
		});
	});

	it('throws when the upload errors', async () => {
		const upload = vi.fn().mockResolvedValue({ error: { message: 'boom' } });
		const db = { storage: { from: () => ({ upload }) } } as unknown as DbClient;
		await expect(uploadManualMedia(db, 'k', Buffer.from('x'), 'image/jpeg')).rejects.toThrow(
			/boom/
		);
	});
});

describe('presignManualMedia', () => {
	it('signs a single media key from the media bucket', async () => {
		const createSignedUrl = vi
			.fn()
			.mockResolvedValue({ data: { signedUrl: 'https://supabase/signed' }, error: null });
		const from = vi.fn(() => ({ createSignedUrl }));
		const db = { storage: { from } } as unknown as DbClient;

		const url = await presignManualMedia(db, 'manual-1/keyframes/k.jpg', 600);
		expect(from).toHaveBeenCalledWith('media');
		expect(url).toBe('https://supabase/signed');
		expect(createSignedUrl).toHaveBeenCalledWith('manual-1/keyframes/k.jpg', 600);
	});
});

describe('presignManualMediaBatch', () => {
	it('returns an empty map without touching the network for no keys', async () => {
		const from = vi.fn();
		const db = { storage: { from } } as unknown as DbClient;
		const map = await presignManualMediaBatch(db, []);
		expect(map.size).toBe(0);
		expect(from).not.toHaveBeenCalled();
	});

	it('maps each input key to its signed URL and skips per-entry failures', async () => {
		const createSignedUrls = vi.fn().mockResolvedValue({
			data: [
				{ path: 'a/keyframes/1.jpg', signedUrl: 'https://s/a', error: null },
				{ path: 'a/illustrations/2.png', signedUrl: null, error: 'nope' }
			],
			error: null
		});
		const from = vi.fn(() => ({ createSignedUrls }));
		const db = { storage: { from } } as unknown as DbClient;

		const map = await presignManualMediaBatch(db, ['a/keyframes/1.jpg', 'a/illustrations/2.png']);
		expect(from).toHaveBeenCalledWith('media');
		expect(map.get('a/keyframes/1.jpg')).toBe('https://s/a');
		expect(map.has('a/illustrations/2.png')).toBe(false);
	});

	it('throws when the batch sign call errors', async () => {
		const createSignedUrls = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
		const db = { storage: { from: () => ({ createSignedUrls }) } } as unknown as DbClient;
		await expect(presignManualMediaBatch(db, ['k'])).rejects.toThrow(/boom/);
	});
});
