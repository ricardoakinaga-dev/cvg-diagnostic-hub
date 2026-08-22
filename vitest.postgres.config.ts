import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@cvg/contracts": path.resolve(__dirname, "packages/contracts/src/index.ts")
    }
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/postgres/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000
  }
});
