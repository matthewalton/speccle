import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      reporter: ["json-summary", "text"],
      include: ["features/**/*.ts"],
      exclude: ["features/**/*.test.ts"],
    },
  },
});
