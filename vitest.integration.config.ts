import { defineConfig, mergeConfig } from "vitest/config";

import baseConfig from "./vitest.config";

// Separate from the default config on purpose: these tests hit the live
// Supabase project over the network and need real test-account credentials
// (see tests/integration/README.md) — they must never run as part of the
// fast, hermetic `npm test` unit suite.
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["tests/integration/**/*.test.{ts,tsx}"],
      testTimeout: 20_000,
      hookTimeout: 20_000,
    },
  }),
);
