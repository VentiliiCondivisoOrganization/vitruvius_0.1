import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// renderManualHtml is pure; the Playwright PDF path is engine-container-only and
		// is not exercised here (no bundled browser in plain CI).
		include: ['src/**/*.test.ts']
	}
});
