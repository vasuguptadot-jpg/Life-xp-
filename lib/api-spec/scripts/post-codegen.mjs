/**
 * Post-processes orval-generated files:
 * 1. Rewrites `import * as zod from 'zod'` → `from 'zod/v4'` so Zod v4 APIs
 *    (looseObject, uuid, email, etc.) resolve correctly.
 * 2. Rewrites the api-zod barrel index to only export from `./generated/api`,
 *    removing the duplicate `./generated/types` export orval always appends.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

// 1. Patch generated zod api.ts: swap zod import to zod/v4
const zodApiPath = path.join(root, "lib", "api-zod", "src", "generated", "api.ts");
if (fs.existsSync(zodApiPath)) {
  const original = fs.readFileSync(zodApiPath, "utf8");
  const patched = original.replace(/from 'zod'/g, "from 'zod/v4'");
  if (patched !== original) {
    fs.writeFileSync(zodApiPath, patched, "utf8");
    console.log("✓ Patched zod import → zod/v4 in generated/api.ts");
  }
}

// 2. Overwrite barrel index to remove the duplicate types re-export
const indexPath = path.join(root, "lib", "api-zod", "src", "index.ts");
const correctIndex = `export * from "./generated/api";\n`;
fs.writeFileSync(indexPath, correctIndex, "utf8");
console.log("✓ Wrote clean api-zod/src/index.ts");
