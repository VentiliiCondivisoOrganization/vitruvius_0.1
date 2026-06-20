import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The suite shells out to a real ffmpeg/ffprobe to build a fixture and run the
		// wrappers against it; give those subprocesses room beyond the 5s default.
		testTimeout: 60_000,
		hookTimeout: 60_000
	}
});
