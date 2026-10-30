import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  testTimeout: 30_000,
    exclude: ["tests/**/*.render.test.ts"],
  },
});
