import { defineConfig } from "vitest/config";
import path from "node:path";

// Slow end-to-end test: bundles the Remotion project and renders a real MP4.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.render.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
