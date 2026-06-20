import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// The parse path is pure in-process text/binary parsing of short fixtures, so the
		// 5s default is plenty. The kernel-dependent render test self-skips unless a kernel
		// is installed (see render.ts), so it never needs a raised timeout here either.
		testTimeout: 10_000
	}
});
