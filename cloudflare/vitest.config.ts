import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const cloudflareDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrations = await readD1Migrations(path.join(cloudflareDirectory, "migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: path.join(cloudflareDirectory, "..", "wrangler.jsonc")
      },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          PARTICIPANT_HMAC_KEY: "test-only-hmac-key-with-at-least-32-bytes",
          PROLIFIC_API_TOKEN: "test-only-prolific-token",
          PROLIFIC_COMPLETION_CODE: "DONE1234"
        }
      }
    })
  ],
  test: {
    include: ["cloudflare/worker-tests/**/*.test.ts"],
    testTimeout: 30_000
  }
});
