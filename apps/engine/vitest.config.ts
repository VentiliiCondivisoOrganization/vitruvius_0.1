import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The regenerate `structure` split/merge is exercised through `handleRegenerateJob`
		// with `@vitruvius/db` mocked and the Instructor on its offline Heuristic provider.
		// The media/Storage and Playwright paths are engine-container-only and not run here.
		include: ['src/**/*.test.ts']
	}
});
