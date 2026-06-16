import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The concurrency test talks to a real local Supabase stack; give it room
    // and run files serially so they don't contend on the same jobs table.
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
