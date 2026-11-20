import { defineConfig } from "vitest/config";

// Inline signals-core so vi.resetModules() yields a second, independent copy (cross-copy test).
export default defineConfig({
  test: { environment: "node", server: { deps: { inline: ["@preact/signals-core"] } } },
});
