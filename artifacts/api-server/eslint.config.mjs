// @ts-check
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    // Ignore build output and node_modules
    ignores: ["dist/**", "node_modules/**", "*.mjs"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Prevent raw console.log leaking server internals
      "no-console": "error",
      // Catch unused variables (except leading _)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Warn on explicit any — there are a few intentional uses (drizzle tx typing)
      "@typescript-eslint/no-explicit-any": "warn",
      // Prevent floating promises
      "@typescript-eslint/no-floating-promises": "error",
      // Consistent return in async functions
      "@typescript-eslint/require-await": "warn",
    },
  },
];
