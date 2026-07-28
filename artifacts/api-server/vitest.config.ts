import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Run test files sequentially to avoid DB isolation issues across files
    pool: "forks",
    singleFork: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    include: ["src/tests/**/*.test.ts"],
    setupFiles: ["src/tests/setup.ts"],
    env: {
      NODE_ENV: "test",
    },
  },
});
