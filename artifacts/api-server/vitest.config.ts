import { defineConfig } from "vitest/config";

// Minimal, focused regression suite for Stage 6 fixes.
// - DB-independent tests (auth tokens, GROQ startup) run with dummy env.
// - DB integration tests (hashtag array, conversation UUID) are gated on
//   TEST_DATABASE_URL and skip when no isolated database is available.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    env: {
      // Dummy values are sufficient for module-load tests; the db Pool is lazy
      // and no connection is opened unless a test actually queries it.
      SESSION_SECRET: "test-session-secret-1234567890",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5999/test",
      NODE_ENV: "test",
    },
  },
});
