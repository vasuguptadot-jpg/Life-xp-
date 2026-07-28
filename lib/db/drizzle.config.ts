import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Versioned migrations — use `pnpm --filter @workspace/db run generate` then
  // `pnpm --filter @workspace/db run migrate` for production-safe schema changes.
  out: "./migrations",
});
